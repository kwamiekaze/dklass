// Public: validates (GET) and processes (POST) a game invite unsubscribe token.
// Also accepts RFC 8058 one click POSTs from mail apps.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let token = new URL(req.url).searchParams.get('token')
  if (req.method === 'POST') {
    const ct = req.headers.get('content-type') ?? ''
    try {
      if (ct.includes('application/x-www-form-urlencoded')) {
        const p = new URLSearchParams(await req.text())
        if (!token && p.get('token')) token = p.get('token')
      } else {
        const b = await req.json()
        if (b?.token) token = b.token
      }
    } catch { /* keep query token */ }
  }
  if (!token || token.length > 128) return json({ error: 'Token is required' }, 400)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: rec, error } = await supabase.from('invite_optouts').select('email, opted_out_at').eq('token', token).maybeSingle()
  if (error || !rec) return json({ error: 'Invalid or expired token' }, 404)
  if (rec.opted_out_at) return json({ valid: false, reason: 'already_unsubscribed' })
  if (req.method === 'GET') return json({ valid: true })

  const { error: upErr } = await supabase.from('invite_optouts').update({ opted_out_at: new Date().toISOString() }).eq('token', token).is('opted_out_at', null)
  if (upErr) return json({ error: 'Failed to process unsubscribe' }, 500)
  return json({ success: true })
})
