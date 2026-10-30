export const GAME_INVITE_DAILY_LIMIT = 100;

export interface InviteEntry { firstName: string; email: string }
export interface InviteParse { entries: InviteEntry[]; invalid: string[]; duplicates: number }

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const isInviteEmail = (v: string): boolean => EMAIL_RE.test(v.trim()) && v.trim().length <= 254;

/**
 * Parse pasted lines into invites. Accepts `Quamie, quamie@x.com`, `quamie@x.com, Quamie`,
 * `Quamie quamie@x.com`, tab separated rows, or a bare email.
 */
export function parseInviteLines(text: string): InviteParse {
  const entries: InviteEntry[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const found = line.match(/[^\s,;<>"']+@[^\s,;<>"']+/);
    const email = found ? found[0].replace(/[.,;]+$/, '').toLowerCase() : '';
    if (!email || !isInviteEmail(email)) { invalid.push(line); continue; }
    const firstName = line.replace(found![0], '').replace(/[,;\t<>"']+/g, ' ').replace(/\s+/g, ' ').trim().split(' ')[0] ?? '';
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    entries.push({ firstName, email });
  }
  return { entries, invalid, duplicates };
}

export const OUTCOME_LABEL: Record<string, string> = {
  queued: 'Sent',
  invalid_email: 'Not a valid email',
  duplicate_in_list: 'Duplicate in list',
  already_invited: 'Already invited recently',
  daily_limit_reached: 'Daily limit reached',
  suppressed: 'Unsubscribed or bounced',
  failed: 'Failed',
};
