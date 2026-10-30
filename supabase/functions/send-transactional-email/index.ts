import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import { resolveRecipientEmails } from '../_shared/recipients.ts'

// Configuration baked in at scaffold time — do NOT change these manually.
// To update, re-run the email domain setup flow.
const SITE_NAME = "drivingklass"
// SENDER_DOMAIN is the verified sender subdomain FQDN (e.g., "notify.example.com").
// It MUST match the subdomain delegated to Lovable's nameservers — never the root domain.
// The email API looks up this exact domain; a mismatch causes "No email domain record found".
const SENDER_DOMAIN = "notify.drivingklass.com"
// FROM_DOMAIN is the domain shown in the From: header (e.g., "example.com").
// When display_from_root is enabled, this can be the root domain for cleaner branding,
// even though actual sending uses the subdomain above.
const FROM_DOMAIN = "drivingklass.com"

// Generate a cryptographically random 32-byte hex token
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Auth note: this function uses verify_jwt = true in config.toml, so Supabase's
// gateway validates the caller's JWT (anon or service_role) before the request
// reaches this code. No in-function auth check is needed.

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Parse request body
  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    messageId = crypto.randomUUID()
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 1. Look up template from registry (early — needed to resolve recipient)
  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({
        error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Resolve effective recipient: template-level `to` takes precedence over
  // the caller-provided recipientEmail. This allows notification templates
  // to always send to a fixed address (e.g., site owner from env var).
  let effectiveRecipient = template.to || recipientEmail

  // Redirect rule: all mail for instructor@drivingklass.com is routed to drivingklass@gmail.com
  const EMAIL_REDIRECTS: Record<string, string> = {
    'instructor@drivingklass.com': 'drivingklass@gmail.com',
  }
  if (effectiveRecipient && EMAIL_REDIRECTS[effectiveRecipient.toLowerCase()]) {
    const redirected = EMAIL_REDIRECTS[effectiveRecipient.toLowerCase()]
    console.log(`Redirecting email from ${effectiveRecipient} to ${redirected}`)
    effectiveRecipient = redirected
  }

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Create Supabase client with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Render the email once — every recipient copy is identical.
  const html = await renderAsync(
    React.createElement(template.component, templateData)
  )
  const plainText = await renderAsync(
    React.createElement(template.component, templateData),
    { plainText: true }
  )
  const resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  // Fan out to any secondary (alias) emails linked to the recipient's account.
  // Templates with a fixed internal `to` (admin notifications) never fan out.
  const recipients = template.to
    ? [effectiveRecipient]
    : await resolveRecipientEmails(supabase, effectiveRecipient)

  async function deliver(recipient: string, index: number) {
    const perMessageId = index === 0 ? messageId : crypto.randomUUID()
    const perIdempotencyKey = index === 0 ? idempotencyKey : `${idempotencyKey}-alias-${index}`
    const normalizedEmail = recipient.toLowerCase()

    // Suppression check (fail-closed for this recipient only)
    const { data: suppressed, error: suppressionError } = await supabase
      .from('suppressed_emails')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (suppressionError) {
      console.error('Suppression check failed — refusing to send', { error: suppressionError, recipient })
      return { recipient, status: 'failed', reason: 'suppression_check_failed' }
    }

    if (suppressed) {
      await supabase.from('email_send_log').insert({
        message_id: perMessageId,
        template_name: templateName,
        recipient_email: recipient,
        status: 'suppressed',
      })
      return { recipient, status: 'suppressed' }
    }

    // Get or create an unsubscribe token for this address
    let unsubscribeToken: string
    const { data: existingToken, error: tokenLookupError } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token, used_at')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (tokenLookupError) {
      await supabase.from('email_send_log').insert({
        message_id: perMessageId,
        template_name: templateName,
        recipient_email: recipient,
        status: 'failed',
        error_message: 'Failed to look up unsubscribe token',
      })
      return { recipient, status: 'failed', reason: 'token_lookup_failed' }
    }

    if (existingToken && !existingToken.used_at) {
      unsubscribeToken = existingToken.token
    } else if (!existingToken) {
      const fresh = generateToken()
      const { error: tokenError } = await supabase
        .from('email_unsubscribe_tokens')
        .upsert({ token: fresh, email: normalizedEmail }, { onConflict: 'email', ignoreDuplicates: true })

      if (tokenError) {
        await supabase.from('email_send_log').insert({
          message_id: perMessageId,
          template_name: templateName,
          recipient_email: recipient,
          status: 'failed',
          error_message: 'Failed to create unsubscribe token',
        })
        return { recipient, status: 'failed', reason: 'token_create_failed' }
      }

      const { data: storedToken, error: reReadError } = await supabase
        .from('email_unsubscribe_tokens')
        .select('token')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (reReadError || !storedToken) {
        await supabase.from('email_send_log').insert({
          message_id: perMessageId,
          template_name: templateName,
          recipient_email: recipient,
          status: 'failed',
          error_message: 'Failed to confirm unsubscribe token storage',
        })
        return { recipient, status: 'failed', reason: 'token_readback_failed' }
      }
      unsubscribeToken = storedToken.token
    } else {
      console.warn('Unsubscribe token already used but email not suppressed', { email: normalizedEmail })
      await supabase.from('email_send_log').insert({
        message_id: perMessageId,
        template_name: templateName,
        recipient_email: recipient,
        status: 'suppressed',
        error_message: 'Unsubscribe token used but email missing from suppressed list',
      })
      return { recipient, status: 'suppressed' }
    }

    await supabase.from('email_send_log').insert({
      message_id: perMessageId,
      template_name: templateName,
      recipient_email: recipient,
      status: 'pending',
      metadata: {
        subject: resolvedSubject,
        html,
        text: plainText,
        template_data: templateData,
      },
    })

    const { error: enqueueError } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: perMessageId,
        to: recipient,
        from: `${template.fromName ?? SITE_NAME} <${template.fromLocal ?? 'noreply'}@${FROM_DOMAIN}>`,
        ...(template.replyTo ? { reply_to: template.replyTo } : {}),
        sender_domain: SENDER_DOMAIN,
        subject: resolvedSubject,
        html,
        text: plainText,
        purpose: 'transactional',
        label: templateName,
        idempotency_key: perIdempotencyKey,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    })

    if (enqueueError) {
      console.error('Failed to enqueue email', { error: enqueueError, templateName, recipient })
      await supabase.from('email_send_log').insert({
        message_id: perMessageId,
        template_name: templateName,
        recipient_email: recipient,
        status: 'failed',
        error_message: 'Failed to enqueue email',
      })
      return { recipient, status: 'failed', reason: 'enqueue_failed' }
    }

    return { recipient, status: 'queued' }
  }

  const results = []
  for (let i = 0; i < recipients.length; i++) {
    results.push(await deliver(recipients[i], i))
  }

  const queued = results.filter((r) => r.status === 'queued')
  console.log('Transactional email processed', { templateName, results })

  if (queued.length === 0) {
    const firstFailure = results.find((r) => r.status === 'failed')
    if (firstFailure) {
      return new Response(JSON.stringify({ error: 'Failed to enqueue email', results }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ success: false, reason: 'email_suppressed', results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({ success: true, queued: true, recipients: queued.map((r) => r.recipient), results }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
