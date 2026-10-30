import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, Gamepad2 } from 'lucide-react';
import {
  GAME_INVITE_DAILY_LIMIT, OUTCOME_LABEL, isInviteEmail, parseInviteLines, type InviteEntry,
} from '@/lib/gameInvite';

interface Outcome { email: string; status: string; detail?: string }
interface Usage { used: number; limit: number; remaining: number }

export function GameInviteCard() {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [bulk, setBulk] = useState('');
  const [resend, setResend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [results, setResults] = useState<Outcome[] | null>(null);

  const bulkParsed = useMemo(() => parseInviteLines(bulk), [bulk]);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('send-game-invite', { body: { action: 'status' } });
    if (!error && data && typeof data.used === 'number') setUsage(data as Usage);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const send = async (invites: InviteEntry[]) => {
    if (!invites.length) return;
    setBusy(true);
    setResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-game-invite', { body: { invites, resend } });
      if (error || !data) throw new Error(error?.message || 'Send failed');
      if (data.error) throw new Error(data.error);
      setResults(data.outcomes as Outcome[]);
      setUsage({ used: data.used, limit: data.limit, remaining: data.remaining });
      toast({ title: data.queued ? `${data.queued} invite${data.queued === 1 ? '' : 's'} on the way` : 'Nothing was sent', description: 'Sent from play@drivingklass.com' });
      return data.outcomes as Outcome[];
    } catch (e) {
      toast({ title: 'Could not send', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const sendOne = async () => {
    const out = await send([{ firstName: firstName.trim(), email: email.trim() }]);
    if (out?.[0]?.status === 'queued') { setFirstName(''); setEmail(''); }
  };
  const sendBulk = async () => {
    const out = await send(bulkParsed.entries);
    if (out && out.every((o) => o.status === 'queued')) setBulk('');
  };

  const canOne = isInviteEmail(email) && !busy;
  const left = usage ? usage.remaining : null;

  return (
    <Card className="portal-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Gamepad2 className="h-5 w-5 text-primary" /> Game invite
          </CardTitle>
          {usage && (
            <Badge variant={usage.remaining === 0 ? 'destructive' : 'secondary'}>
              {usage.used} of {usage.limit} sent in the last 24 hours
            </Badge>
          )}
        </div>
        <CardDescription>
          Invites someone to play the DrivingKlass game and tour the back parking lot. Sent from play@drivingklass.com,
          the button opens the homepage, replies go to connect@drivingklass.com.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-3 items-end">
          <div>
            <Label htmlFor="gi-name" className="text-xs text-muted-foreground">First name</Label>
            <Input id="gi-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Quamie" autoComplete="off" maxLength={40} />
          </div>
          <div>
            <Label htmlFor="gi-email" className="text-xs text-muted-foreground">Email</Label>
            <Input id="gi-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@email.com" autoComplete="off"
              onKeyDown={(e) => { if (e.key === 'Enter' && canOne) void sendOne(); }} />
          </div>
          <Button onClick={sendOne} disabled={!canOne || left === 0} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send invite
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gi-bulk" className="text-xs text-muted-foreground">Or paste a list, one per line (name, email)</Label>
          <Textarea id="gi-bulk" value={bulk} onChange={(e) => setBulk(e.target.value)} rows={4} placeholder={'Quamie, kwamiekaze@gmail.com\nAlex, alex@email.com'} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {bulkParsed.entries.length} ready
              {bulkParsed.duplicates ? `, ${bulkParsed.duplicates} duplicate${bulkParsed.duplicates === 1 ? '' : 's'} skipped` : ''}
              {bulkParsed.invalid.length ? `, ${bulkParsed.invalid.length} line${bulkParsed.invalid.length === 1 ? '' : 's'} not valid` : ''}
            </p>
            <Button variant="secondary" onClick={sendBulk} disabled={busy || !bulkParsed.entries.length || left === 0} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send {bulkParsed.entries.length || ''} invites
            </Button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={resend} onCheckedChange={(v) => setResend(v === true)} />
          Send again even if this person was invited in the last 30 days
        </label>

        {results && (
          <ul className="divide-y rounded-md border text-sm" aria-live="polite">
            {results.map((o, i) => (
              <li key={`${o.email}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="break-all">{o.email || '(blank)'}</span>
                <Badge variant={o.status === 'queued' ? 'default' : 'outline'}>{OUTCOME_LABEL[o.status] ?? o.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
