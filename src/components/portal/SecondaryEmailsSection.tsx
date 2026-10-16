import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Unlink, Loader2, GitMerge } from "lucide-react";

interface AccountLink {
  id: string;
  alias_user_id: string;
  email: string | null;
  full_name: string | null;
  relationship: string | null;
  previous_status: string | null;
  created_at: string;
}

const REL_LABEL: Record<string, string> = { parent: "Parent", guardian: "Guardian", student: "Student", other: "Other" };

export function SecondaryEmailsSection({ userId, onMergeClick }: { userId: string; onMergeClick?: () => void }) {
  const [main, setMain] = useState<{ name: string; email: string | null } | null>(null);
  const { toast } = useToast();
  const [links, setLinks] = useState<AccountLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-account-links", { body });
    if (error) {
      // Surface the server's message when available.
      const message = (data as any)?.error || error.message;
      throw new Error(message);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await call({ action: "list", canonical_user_id: userId });
      setLinks(data.links || []);
    } catch (e: any) {
      console.error("Failed to load secondary emails", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("full_name, first_name, last_name, email")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const n = [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || data.full_name || data.email || "Main account";
          setMain({ name: n, email: data.email });
        }
      });
    if (userId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleAdd = async () => {
    const value = email.trim().toLowerCase();
    if (!value) return;
    setAdding(true);
    try {
      await call({ action: "add", canonical_user_id: userId, email: value });
      toast({
        title: "Secondary email added",
        description: `${value} can now sign in to this account and will receive copies of all emails.`,
      });
      setEmail("");
      await load();
    } catch (e: any) {
      toast({ title: "Could not add email", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (link: AccountLink) => {
    setRemovingId(link.alias_user_id);
    try {
      if (!window.confirm(`Unlink ${link.full_name || link.email || "this login"}? Moved records stay with the main account.`)) return;
      const res = await call({ action: "remove", alias_user_id: link.alias_user_id });
      toast({ title: "Account unlinked", description: res?.message });
      await load();
    } catch (e: any) {
      toast({ title: "Could not remove email", description: e.message, variant: "destructive" });
    } finally {
      setRemovingId(null);
    }
  };

  const handleRelationship = async (link: AccountLink, value: string) => {
    try {
      await call({ action: "set_relationship", alias_user_id: link.alias_user_id, relationship: value === "none" ? null : value });
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, relationship: value === "none" ? null : value } : l)));
    } catch (e: any) {
      toast({ title: "Could not update relationship", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Linked accounts</h4>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground">
        Everyone here signs in with their own email and password, sees this same account, and receives a copy of
        every email sent to this student.
      </p>

      <div className="space-y-2">
        {main && (
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{main.name}</p>
              <p className="truncate text-xs text-muted-foreground">{main.email}</p>
            </div>
            <Badge className="text-[10px]">Primary</Badge>
          </div>
        )}
        {links.map((link) => (
          <div key={link.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{link.full_name || link.email || link.alias_user_id}</p>
              <p className="truncate text-xs text-muted-foreground">{link.email}</p>
            </div>
            <Badge variant="outline" className="text-[10px]">Linked</Badge>
            <Select value={link.relationship || "none"} onValueChange={(v) => handleRelationship(link, v)}>
              <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Relationship">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No label</SelectItem>
                {Object.entries(REL_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => handleRemove(link)}
              disabled={removingId === link.alias_user_id}
              aria-label={`Unlink ${link.email || "linked account"}`}
            >
              {removingId === link.alias_user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            </Button>
          </div>
        ))}
      </div>

      {onMergeClick && (
        <Button variant="outline" className="w-full gap-2" onClick={onMergeClick}>
          <GitMerge className="h-4 w-4" />
          Merge with another account
        </Button>
      )}

      <div className="space-y-2">
        <Label className="text-xs">Add a secondary email</Label>
        <div className="flex gap-2">
          <Input
            type="email"
            inputMode="email"
            placeholder="parent@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button onClick={handleAdd} disabled={adding || !email.trim()} className="gap-1 shrink-0">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
