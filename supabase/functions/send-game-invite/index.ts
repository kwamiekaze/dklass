// Admin/staff only: send the DrivingKlass game invite (first name + email).
// Sends through Resend on its OWN sender domain, never the shared student/auth email setup,
// so invite complaints or bounces cannot hurt lesson reminders or sign in emails.
// Refuses to send until RESEND_API_KEY exists. Guards: valid address, own opt out list,
// no repeat invite within 30 days (unless resend), 100 sends per rolling 24 hours.
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { firstNameFrom } from '../_shared/names.ts'
import { template } from '../_shared/transactional-email-templates/game-invite.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const LOG_NAME = 'game-invite'
const DAILY_LIMIT = 100
const MAX_PER_CALL = 100
const REPEAT_DAYS = 30
const SITE_URL = 'https://drivingklass.com'
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

type Invite = { firstName?: string; email?: string }
type Outcome = { email: string; status: string; detail?: string }

const cleanName = (v: unknown): string => {
  const n = firstNameFrom(typeof v === 'string' ? v : '').replace(/[<>"\n\r\t]/g, '').slice(0, 40)
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''
}
const token32 = () => {
  const b = new Uint8Array(32); crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
  const fromAddress = Deno.env.get('INVITE_FROM') ?? 'DrivingKlass Play <hello@play.drivingklass.com>'
  const replyTo = Deno.env.get('INVITE_REPLY_TO') ?? 'connect@drivingklass.com'
  const configured = resendKey.length > 0

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
      .eq('template_name', LOG_NAME).eq('status', 'pending').gte('created_at', since)
    if (error) throw new Error('count failed')
    return count ?? 0
  }

  try {
    // One `pending` log row is written per accepted invite, so counting them counts invites once.
    if (body.action === 'status') {
      const used = await countToday()
      return json({ configured, used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used) })
    }
    if (!configured) {
      return json({ error: 'Invite sender is not set up yet. Add the RESEND_API_KEY secret first. Nothing was sent.', configured: false }, 503)
    }

    const invites = Array.isArray(body.invites) ? body.invites : []
    if (!invites.length) return json({ error: 'no invites supplied' }, 400)
    if (invites.length > MAX_PER_CALL) return json({ error: `max ${MAX_PER_CALL} invites per request` }, 400)

    let used = await countToday()
    const seen = new Set<string>()
    const outcomes: Outcome[] = []

    const emails = invites.map((i) => String(i.email ?? '').trim().toLowerCase()).filter((e) => EMAIL_RE.test(e))
    const recent = new Set<string>()
    if (!body.resend && emails.length) {
      const cutoff = new Date(Date.now() - REPEAT_DAYS * 86400 * 1000).toISOString()
      const { data } = await admin.from('email_send_log').select('recipient_email')
        .eq('template_name', LOG_NAME).eq('status', 'pending').gte('created_at', cutoff).in('recipient_email', emails)
      for (const r of data ?? []) recent.add(String(r.recipient_email).toLowerCase())
    }
    const optedOut = new Set<string>()
    if (emails.length) {
      const { data } = await admin.from('invite_optouts').select('email').not('opted_out_at', 'is', null).in('email', emails)
      for (const r of data ?? []) optedOut.add(String(r.email).toLowerCase())
    }

    for (const inv of invites) {
      const email = String(inv.email ?? '').trim().toLowerCase()
      if (!EMAIL_RE.test(email) || email.length > 254) { outcomes.push({ email, status: 'invalid_email' }); continue }
      if (seen.has(email)) { outcomes.push({ email, status: 'duplicate_in_list' }); continue }
      seen.add(email)
      if (optedOut.has(email)) { outcomes.push({ email, status: 'suppressed', detail: 'unsubscribed from invites' }); continue }
      if (recent.has(email)) { outcomes.push({ email, status: 'already_invited', detail: `invited in the last ${REPEAT_DAYS} days` }); continue }
      if (used >= DAILY_LIMIT) { outcomes.push({ email, status: 'daily_limit_reached' }); continue }

      // own unsubscribe token, kept apart from the shared student email list
      await admin.from('invite_optouts').upsert({ email, token: token32() }, { onConflict: 'email', ignoreDuplicates: true })
      const { data: tk } = await admin.from('invite_optouts').select('token').eq('email', email).maybeSingle()
      if (!tk?.token) { outcomes.push({ email, status: 'failed', detail: 'token' }); continue }
      const unsubscribeUrl = `${SITE_URL}/unsubscribe?scope=invite&token=${tk.token}`
      const oneClickUrl = `${url}/functions/v1/handle-invite-unsubscribe?token=${tk.token}`

      const data = { recipientName: cleanName(inv.firstName), inviteUrl: `${SITE_URL}/`, unsubscribeUrl }
      const html = await renderAsync(React.createElement(template.component, data))
      const text = await renderAsync(React.createElement(template.component, data), { plainText: true })
      const subject = template.subject(data)

      const messageId = crypto.randomUUID()
      await admin.from('email_send_log').insert({ message_id: messageId, template_name: LOG_NAME, recipient_email: email, status: 'pending', metadata: { subject, via: 'resend' } })

      let r: Response
      try {
        r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${LOG_NAME}-${messageId}` },
          body: JSON.stringify({
            from: fromAddress, to: [email], reply_to: replyTo, subject, html, text,
            headers: { 'List-Unsubscribe': `<${oneClickUrl}>, <${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
            tags: [{ name: 'type', value: 'game-invite' }],
          }),
        })
      } catch (e) {
        await admin.from('email_send_log').insert({ message_id: messageId, template_name: LOG_NAME, recipient_email: email, status: 'failed', error_message: 'network error' })
        outcomes.push({ email, status: 'failed', detail: 'network error' }); continue
      }
      const out = await r.json().catch(() => ({}))
      if (r.ok) {
        used++
        await admin.from('email_send_log').insert({ message_id: messageId, template_name: LOG_NAME, recipient_email: email, status: 'sent' })
        outcomes.push({ email, status: 'queued' })
      } else {
        const detail = String(out?.message ?? r.status).slice(0, 160)
        await admin.from('email_send_log').insert({ message_id: messageId, template_name: LOG_NAME, recipient_email: email, status: 'failed', error_message: detail })
        outcomes.push({ email, status: 'failed', detail })
        if (r.status === 401 || r.status === 403 || r.status === 429) break // key or limit problem: stop the batch
      }
    }

    return json({
      queued: outcomes.filter((o) => o.status === 'queued').length,
      used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used), outcomes,
    })
  } catch (e) {
    console.error('send-game-invite failed', e)
    return json({ error: 'server error' }, 500)
  }
})
