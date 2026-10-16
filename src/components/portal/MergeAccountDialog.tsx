import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, GitMerge, AlertTriangle, ArrowRight } from "lucide-react";
import { getDisplayName } from "@/lib/profileUtils";

interface Candidate {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  approval_status: string;
  hours_remaining: number | null;
  purchased_hours: number | null;
  created_at: string;
}

interface MergeAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceUserId: string;
  sourceLabel: string;
  onMerged?: () => void;
}

type Relationship = "parent" | "guardian" | "student" | "other";
type Step = "pick" | "setup" | "preview" | "confirm";

interface Preview {
  source: { name: string | null; email: string | null; status: string; role: string | null; purchased_hours: number; hours_remaining: number };
  target: { name: string | null; email: string | null; status: string; role: string | null; purchased_hours: number; hours_remaining: number };
  counts: Record<string, number>;
  warnings: string[];
}

const LABELS: Record<string, string> = {
  sessions: "Lessons",
  report_cards: "Report cards",
  report_card_ratings: "Ratings",
  road_test_results: "Road test results",
  session_tracking: "Live tracking",
  session_hour_deductions: "Hour deductions",
  schedule_proposals: "Schedule proposals",
  proposal_edit_requests: "Proposal edit requests",
  instructor_students: "Instructor assignments",
  permits: "Permits",
  permit_documents: "Documents",
  intake_form_revisions: "Intake history",
  approved_intakes: "Approved intakes",
  intake_drafts: "Intake drafts",
  notifications: "Notifications",
  map_pins: "Map pins",
  student_schedule_shares: "Schedule shares",
  internal_notes: "Internal notes",
  report_card_feedback: "Feedback",
  leads: "Leads",
  linked_logins: "Linked logins",
};

const statusVariant = (s: string) => (s === "approved" ? "default" : "secondary");
const name = (c: Candidate) => getDisplayName(c as any, c.email || "Unknown");

export function MergeAccountDialog({ open, onOpenChange, sourceUserId, sourceLabel, onMerged }: MergeAccountDialogProps) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [self, setSelf] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [other, setOther] = useState<Candidate | null>(null);
  const [mainId, setMainId] = useState<string>("");
  const [relationship, setRelationship] = useState<Relationship>("parent");
  const [step, setStep] = useState<Step>("pick");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setOther(null);
      setSearch("");
      setStep("pick");
      setPreview(null);
      return;
    }
    const load = async () => {
      setLoading(true);
      const [{ data }, { data: staff }, { data: links }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, first_name, last_name, full_name, email, approval_status, hours_remaining, purchased_hours, created_at")
          .in("approval_status", ["pending", "approved"])
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id").in("role", ["admin", "staff", "instructor"]),
        supabase.from("account_links").select("alias_user_id"),
      ]);
      const blocked = new Set([...(staff || []).map((r) => r.user_id), ...(links || []).map((l) => l.alias_user_id)]);
      const all = (data || []) as Candidate[];
      setSelf(all.find((c) => c.id === sourceUserId) || null);
      setCandidates(all.filter((c) => c.id !== sourceUserId && !blocked.has(c.id)));
      setLoading(false);
    };
    load();
  }, [open, sourceUserId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? candidates.filter((c) =>
          `${c.first_name || ""} ${c.last_name || ""} ${c.full_name || ""} ${c.email || ""}`.toLowerCase().includes(term)
        )
      : candidates;
    return list.slice(0, 25);
  }, [candidates, search]);

  const pick = (c: Candidate) => {
    setOther(c);
    // Default main: the approved one; if both/neither approved, the older account.
    let main = c.id;
    if (self) {
      const sA = self.approval_status === "approved";
      const cA = c.approval_status === "approved";
      if (sA !== cA) main = sA ? self.id : c.id;
      else main = new Date(self.created_at) <= new Date(c.created_at) ? self.id : c.id;
    }
    setMainId(main);
    setStep("setup");
  };

  const sourceId = other ? (mainId === sourceUserId ? other.id : sourceUserId) : "";
  const targetId = other ? (mainId === sourceUserId ? sourceUserId : other.id) : "";
  const selfLabel = self ? name(self) : sourceLabel;
  const otherLabel = other ? name(other) : "";
  const mainLabel = mainId === sourceUserId ? selfLabel : otherLabel;
  const linkedLabel = mainId === sourceUserId ? otherLabel : selfLabel;

  const loadPreview = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("merge_preview", {
      p_source_user_id: sourceId,
      p_target_user_id: targetId,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Could not preview merge", description: error.message, variant: "destructive" });
      return;
    }
    setPreview(data as unknown as Preview);
    setStep("preview");
  };

  const handleMerge = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("merge_student_account", {
      p_source_user_id: sourceId,
      p_target_user_id: targetId,
      p_relationship: relationship,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Merge failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Accounts merged",
      description: `${linkedLabel} is now linked to ${mainLabel}. Both keep signing in with their own email and password.`,
    });
    onOpenChange(false);
    onMerged?.();
  };

  const moving = preview ? Object.entries(preview.counts).filter(([, n]) => Number(n) > 0) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,560px)] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <GitMerge className="h-5 w-5 text-primary" />
            Merge with another account
          </DialogTitle>
          <DialogDescription>
            Link <span className="font-medium">{selfLabel}</span> with another student or parent account into one family.
          </DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search students by name or email..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No matching accounts</p>
            ) : (
              <div className="max-h-[320px] space-y-2 overflow-y-auto">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => pick(c)}
                    className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name(c)}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant={statusVariant(c.approval_status)} className="text-[10px] capitalize">
                        {c.approval_status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{Number(c.hours_remaining ?? 0)}h left</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "setup" && other && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Main account (keeps all records)</Label>
              <RadioGroup value={mainId} onValueChange={setMainId} className="space-y-2">
                {[self ?? ({ id: sourceUserId, email: null, approval_status: "pending" } as Candidate), other].map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2">
                    <RadioGroupItem value={c.id} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.id === sourceUserId ? selfLabel : name(c)}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                    </div>
                    <Badge variant={statusVariant(c.approval_status)} className="text-[10px] capitalize">
                      {c.approval_status}
                    </Badge>
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">{linkedLabel} is the…</Label>
              <Select value={relationship} onValueChange={(v) => setRelationship(v as Relationship)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="guardian">Guardian</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("pick")} disabled={busy}>Back</Button>
              <Button className="flex-1 gap-2" onClick={loadPreview} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Preview
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm">
              <p><span className="text-muted-foreground">Linked:</span> <span className="font-medium">{linkedLabel}</span> ({relationship})</p>
              <p><span className="text-muted-foreground">Main:</span> <span className="font-medium">{mainLabel}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">
                Hours: {Number(preview.source.purchased_hours ?? 0)}h purchased on the linked account will be added to {Number(preview.target.purchased_hours ?? 0)}h on the main account.
              </p>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">What will move</h4>
              {moving.length === 0 ? (
                <p className="text-sm text-muted-foreground">No records to move — only the login gets linked.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  {moving.map(([k, n]) => (
                    <li key={k} className="flex justify-between rounded border px-2 py-1">
                      <span>{LABELS[k] || k}</span>
                      <span className="font-medium">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {preview.warnings.length > 0 && (
              <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                {preview.warnings.map((w) => (
                  <p key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />{w}</p>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("setup")}>Back</Button>
              <Button className="flex-1" onClick={() => setStep("confirm")}>Continue</Button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <div className="mb-2 flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Confirm merge
              </div>
              <p className="text-muted-foreground">
                Everything belonging to <span className="font-medium text-foreground">{linkedLabel}</span> moves to{" "}
                <span className="font-medium text-foreground">{mainLabel}</span>. Nothing is deleted, and both people keep
                signing in with their own email and password.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("preview")} disabled={busy}>Back</Button>
              <Button className="flex-1 gap-2" onClick={handleMerge} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
                Merge accounts
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
