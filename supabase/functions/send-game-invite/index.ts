// Admin/staff only: send the DrivingKlass game invite (first name + email) from play@drivingklass.com.
// Guards: valid address, no repeat invite within 30 days (unless resend), 100 sends per rolling 24 hours.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { firstNameFrom } from '../_shared/names.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const TEMPLATE = 'game-invite'
const DAILY_LIMIT = 100
const MAX_PER_CALL = 100
const REPEAT_DAYS = 30
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

type Invite = { firstName?: string; email?: string }
type Outcome = { email: string; status: string; detail?: string }

const cleanName = (v: unknown): string => {
  const n = firstNameFrom(typeof v === 'string' ? v : '').replace(/[<>"\n\r\t]/g, '').slice(0, 40)
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'staff']).limit(1).maybeSingle()
  if (!role) return json({ error: 'forbidden: admin or staff only' }, 403)

  let body: { action?: string; invites?: Invite[]; resend?: boolean }
  try { body = await req.json() } catch { return json({ error: 'invalid JSON body' }, 400) }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const countToday = async (): Promise<number> => {
    const { count, error } = await admin.from('email_send_log').select('id', { count: 'exact', head: true })
      .eq('template_name', TEMPLATE).eq('status', 'pending').gte('created_at', since)
    if (error) throw new Error('count failed')
    return count ?? 0
  }

  try {
    // `pending` rows are written once per accepted invite (the queue worker adds a separate `sent` row later),
    // so counting pending rows counts invites exactly once.
    if (body.action === 'status') {
      const used = await countToday()
      return json({ used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used) })
    }

    const invites = Array.isArray(body.invites) ? body.invites : []
    if (!invites.length) return json({ error: 'no invites supplied' }, 400)
    if (invites.length > MAX_PER_CALL) return json({ error: `max ${MAX_PER_CALL} invites per request` }, 400)

    let used = await countToday()
    const seen = new Set<string>()
    const outcomes: Outcome[] = []

    // Who was already invited recently
    const emails = invites.map((i) => String(i.email ?? '').trim().toLowerCase()).filter((e) => EMAIL_RE.test(e))
    const recent = new Set<string>()
    if (!body.resend && emails.length) {
      const cutoff = new Date(Date.now() - REPEAT_DAYS * 86400 * 1000).toISOString()
      const { data } = await admin.from('email_send_log').select('recipient_email')
        .eq('template_name', TEMPLATE).eq('status', 'pending').gte('created_at', cutoff).in('recipient_email', emails)
      for (const r of data ?? []) recent.add(String(r.recipient_email).toLowerCase())
    }

    for (const inv of invites) {
      const email = String(inv.email ?? '').trim().toLowerCase()
      if (!EMAIL_RE.test(email) || email.length > 254) { outcomes.push({ email, status: 'invalid_email' }); continue }
      if (seen.has(email)) { outcomes.push({ email, status: 'duplicate_in_list' }); continue }
      seen.add(email)
      if (recent.has(email)) { outcomes.push({ email, status: 'already_invited', detail: `invited in the last ${REPEAT_DAYS} days` }); continue }
      if (used >= DAILY_LIMIT) { outcomes.push({ email, status: 'daily_limit_reached' }); continue }

      const r = await fetch(`${url}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          templateName: TEMPLATE,
          recipientEmail: email,
          idempotencyKey: `${TEMPLATE}-${email}-${body.resend ? Date.now() : 'once'}`,
          templateData: { recipientName: cleanName(inv.firstName), inviteUrl: 'https://drivingklass.com/' },
        }),
      })
      const out = await r.json().catch(() => ({}))
      if (r.ok && out.success) { used++; outcomes.push({ email, status: 'queued' }) }
      else if (r.ok && out.reason === 'email_suppressed') outcomes.push({ email, status: 'suppressed', detail: 'this address unsubscribed or bounced' })
      else outcomes.push({ email, status: 'failed', detail: String(out.error ?? r.status).slice(0, 160) })
    }

    return json({
      queued: outcomes.filter((o) => o.status === 'queued').length,
      used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used),
      outcomes,
    })
  } catch (e) {
    console.error('send-game-invite failed', e)
    return json({ error: 'server error' }, 500)
  }
})
