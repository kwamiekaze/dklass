import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle, Clock, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  hours: number;
  reason: string | null;
  status: "owed" | "made_up";
  created_at: string;
  made_up_at: string | null;
}

interface Props {
  studentId: string;
  /** admins, staff and instructors can add and resolve; students only see it */
  canManage?: boolean;
  /** use the plain Card (staff pages) or the portal-card look (student profile) */
  className?: string;
}

// Stored as hours (2 decimals). Whole minutes survive the round trip exactly
// (error is at most 0.3 min), so we do all math and display in minutes.
const toMins = (h: number) => Math.round(h * 60);
const fmtMins = (m: number) => {
  const h = Math.floor(m / 60), r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  return h ? `${h}h` : `${r}m`;
};

export function MakeupTimeCard({ studentId, canManage = false, className }: Props) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hrs, setHrs] = useState("");
  const [mins, setMins] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // the table is new, so the generated types do not list it yet
  const table = () => (supabase as any).from("makeup_time_entries");

  const load = useCallback(async () => {
    const { data, error } = await table().select("id, hours, reason, status, created_at, made_up_at").eq("student_id", studentId).order("created_at", { ascending: false });
    if (!error && data) setEntries((data as any[]).map((e) => ({ ...e, hours: Number(e.hours) })));
    setLoading(false);
  }, [studentId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const { owed, madeUp } = useMemo(() => ({
    owed: entries.filter((e) => e.status === "owed").reduce((a, e) => a + toMins(e.hours), 0),
    madeUp: entries.filter((e) => e.status === "made_up").reduce((a, e) => a + toMins(e.hours), 0),
  }), [entries]);

  const add = async () => {
    const h = hrs.trim() === "" ? 0 : Number(hrs);
    const m = mins.trim() === "" ? 0 : Number(mins);
    const total = Math.round(h * 60 + m);
    if (!Number.isFinite(total) || h < 0 || m < 0 || total < 1 || total > 6000) { toast({ title: "Invalid time", description: "Enter at least 1 minute (up to 100 hours).", variant: "destructive" }); return; }
    const n = Math.round((total / 60) * 100) / 100;
    setBusy("add");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await table().insert({ student_id: studentId, hours: n, reason: reason.trim() || null, created_by: u.user?.id ?? null });
    setBusy(null);
    if (error) { toast({ title: "Could not add makeup time", description: error.message, variant: "destructive" }); return; }
    setHrs(""); setMins(""); setReason("");
    toast({ title: "Makeup time added", description: `${fmtMins(total)} added.` });
    load();
  };

  const setStatus = async (e: Entry, status: "owed" | "made_up") => {
    setBusy(e.id);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await table().update(status === "made_up"
      ? { status, made_up_at: new Date().toISOString(), made_up_by: u.user?.id ?? null }
      : { status, made_up_at: null, made_up_by: null }).eq("id", e.id);
    setBusy(null);
    if (error) { toast({ title: "Could not update", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const remove = async (e: Entry) => {
    setBusy(e.id);
    const { error } = await table().delete().eq("id", e.id);
    setBusy(null);
    if (error) { toast({ title: "Could not remove", description: error.message, variant: "destructive" }); return; }
    load();
  };

  return (
    <Card className={cn("portal-card min-w-0", className)}>
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary" />Makeup Time</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          {canManage ? "Hours this student still has to make up. Add time when a lesson is missed or cut short, and mark it made up once it is done." : "Hours you still have to make up with your instructor."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-background/40 p-3 min-w-0">
            <p className="text-[11px] text-muted-foreground">To make up</p>
            <p className="text-2xl font-semibold theme-heading text-amber-500">{fmtMins(owed)}</p>
          </div>
          <div className="rounded-lg border bg-background/40 p-3 min-w-0">
            <p className="text-[11px] text-muted-foreground">Made up</p>
            <p className="text-2xl font-semibold theme-heading text-green-500">{fmtMins(madeUp)}</p>
          </div>
        </div>

        {canManage && (
          <div className="space-y-2 rounded-lg border bg-background/40 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Hours</Label>
                <Input type="number" step="1" min="0" max="100" inputMode="numeric" value={hrs} onChange={(e) => setHrs(e.target.value)} placeholder="0" className="min-h-[44px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Minutes</Label>
                <Input type="number" step="1" min="0" max="59" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} placeholder="30" className="min-h-[44px]" />
              </div>
            </div>
            <div className="space-y-1 min-w-0">
              <Label className="text-xs">Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Missed lesson, left early…" maxLength={200} className="min-h-[44px]" />
            </div>
            <Button type="button" onClick={add} disabled={busy === "add"} className="w-full gap-2 min-h-[44px]">
              {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add makeup time
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No makeup time.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {entries.map((e) => (
              <div key={e.id} className="rounded-lg border bg-background/40 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{fmtMins(toMins(e.hours))}</span>
                  <Badge className={cn("text-[10px] border-0 shrink-0", e.status === "made_up" ? "bg-green-500/20 text-green-700 dark:text-green-300" : "bg-amber-500/20 text-amber-700 dark:text-amber-300")}>
                    {e.status === "made_up" ? <><CheckCircle className="h-2.5 w-2.5 mr-0.5" />Made up</> : <><Clock className="h-2.5 w-2.5 mr-0.5" />To make up</>}
                  </Badge>
                </div>
                {e.reason && <p className="text-xs text-muted-foreground break-words">{e.reason}</p>}
                <p className="text-[11px] text-muted-foreground">
                  Added {format(parseISO(e.created_at), "MMM d, yyyy")}{e.made_up_at ? ` · made up ${format(parseISO(e.made_up_at), "MMM d, yyyy")}` : ""}
                </p>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={busy === e.id} className="h-8 text-xs gap-1" onClick={() => setStatus(e, e.status === "owed" ? "made_up" : "owed")}>
                      {e.status === "owed" ? <><CheckCircle className="h-3.5 w-3.5" />Mark made up</> : <><RotateCcw className="h-3.5 w-3.5" />Undo</>}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy === e.id} className="h-8 text-xs gap-1 text-destructive" onClick={() => remove(e)}>
                      <Trash2 className="h-3.5 w-3.5" />Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
