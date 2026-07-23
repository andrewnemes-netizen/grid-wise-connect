// Notifies a designer when a POC purchase order is cancelled. Renders the
// poc-po-cancellation React Email template and sends via the shared Outlook
// connector — same path as send-poc-assignment-email, minus attachments.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { template as tmpl } from '../_shared/transactional-email-templates/poc-po-cancellation.tsx'

interface Body {
  recipientEmail: string
  recipientName?: string
  senderName?: string
  companyName?: string
  programmeName?: string
  workPackageName?: string
  poNumber?: string
  reason?: string
  cc_emails?: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.recipientEmail)) {
    return json({ error: 'valid recipientEmail required' }, 400)
  }

  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
  const outlookKey = Deno.env.get('MICROSOFT_OUTLOOK_API_KEY')
  if (!lovableApiKey || !outlookKey) return json({ error: 'Outlook connector not configured' }, 500)

  const htmlBody = await renderAsync(React.createElement(tmpl.component, body))
  const subject = typeof tmpl.subject === 'function'
    ? (tmpl.subject as (d: Record<string, any>) => string)(body as any)
    : String(tmpl.subject)

  const message = {
    subject,
    body: { contentType: 'HTML', content: htmlBody },
    toRecipients: [{ emailAddress: { address: body.recipientEmail } }],
    ccRecipients: (body.cc_emails ?? []).map((e) => ({ emailAddress: { address: e } })),
  }
  const res = await fetch(
    'https://connector-gateway.lovable.dev/microsoft_outlook/me/sendMail',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        'X-Connection-Api-Key': outlookKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    },
  )
  if (!res.ok) {
    const errText = await res.text()
    console.error(`Outlook cancellation send failed [${res.status}]: ${errText}`)
    return json({ error: 'Outlook send failed', status: res.status, details: errText }, 502)
  }
  await res.text().catch(() => {})
  return json({ success: true })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}