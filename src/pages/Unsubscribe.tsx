import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, Mail } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const fn = params.get("scope") === "invite" ? "handle-invite-unsubscribe" : "handle-email-unsubscribe";
  const [state, setState] = useState<"validating" | "ready" | "already" | "invalid" | "submitting" | "done" | "error">("validating");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}?token=${encodeURIComponent(token)}`, { headers: { apikey: ANON } });
        const j = await r.json();
        if (r.ok && j.valid) setState("ready");
        else if (j.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch (e: any) { setState("error"); setMsg(e?.message || "Network error"); }
    })();
  }, [token, fn]);

  const confirm = async () => {
    if (!token) return;
    setState("submitting");
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: ANON },
        body: JSON.stringify({ token }),
      });
      const j = await r.json();
      if (j.success || j.reason === "already_unsubscribed") setState("done");
      else { setState("error"); setMsg(j.error || "Could not unsubscribe"); }
    } catch (e: any) { setState("error"); setMsg(e?.message || "Network error"); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Unsubscribe</CardTitle>
          <CardDescription>DrivingKlass email preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "validating" && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Validating your link…</p>}
          {state === "ready" && (
            <>
              <p>Click below to unsubscribe this email address from DrivingKlass emails.</p>
              <Button onClick={confirm} className="w-full">Confirm unsubscribe</Button>
            </>
          )}
          {state === "submitting" && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Unsubscribing…</p>}
          {state === "done" && <p className="flex items-center gap-2 text-green-600"><CheckCircle2 className="h-5 w-5" /> You've been unsubscribed.</p>}
          {state === "already" && <p className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="h-5 w-5" /> This email is already unsubscribed.</p>}
          {state === "invalid" && <p className="flex items-center gap-2 text-destructive"><AlertCircle className="h-5 w-5" /> This link is invalid or expired.</p>}
          {state === "error" && <p className="flex items-center gap-2 text-destructive"><AlertCircle className="h-5 w-5" /> {msg || "Something went wrong."}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
