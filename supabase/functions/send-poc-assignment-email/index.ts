import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { template as pocTemplate } from '../_shared/transactional-email-templates/poc-assignment.tsx'

interface Body {
  recipientEmail: string
  recipientName?: string
  subject?: string
  templateData?: Record<string, unknown>
  cc_emails?: string[]
  attachment?: {
    filename: string
    contentBase64: string
    contentType?: string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!body.recipientEmail || !emailRe.test(body.recipientEmail)) {
    return json({ error: 'valid recipientEmail required' }, 400)
  }

  const templateData = (body.templateData ?? {}) as Record<string, unknown>

  // Compute subject (poc-assignment template.subject is a function of data)
  const subject =
    body.subject?.trim() ||
    (typeof pocTemplate.subject === 'function'
      ? (pocTemplate.subject as (d: Record<string, any>) => string)(templateData)
      : String(pocTemplate.subject ?? 'POC application requested'))

  // Outlook connector credentials
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
  const outlookKey = Deno.env.get('MICROSOFT_OUTLOOK_API_KEY')
  if (!lovableApiKey || !outlookKey) {
    return json({ error: 'Outlook connector not configured' }, 500)
  }

  // Render branded React Email template to HTML
  const htmlBody = await renderAsync(
    React.createElement(pocTemplate.component, {
      ...templateData,
      recipientName: (templateData as any).recipientName ?? body.recipientName,
    }),
  )

  const toRecipients = [{ emailAddress: { address: body.recipientEmail } }]
  const ccRecipients = (body.cc_emails ?? []).map((e) => ({ emailAddress: { address: e } }))

  const attachments =
    body.attachment && body.attachment.filename && body.attachment.contentBase64
      ? [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: body.attachment.filename,
            contentType:
              body.attachment.contentType ??
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            contentBytes: body.attachment.contentBase64,
          },
        ]
      : undefined

  const outlookRes = await fetch(
    'https://connector-gateway.lovable.dev/microsoft_outlook/me/sendMail',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        'X-Connection-Api-Key': outlookKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: htmlBody },
          toRecipients,
          ccRecipients,
          ...(attachments ? { attachments } : {}),
        },
        saveToSentItems: true,
      }),
    },
  )

  if (!outlookRes.ok) {
    const errText = await outlookRes.text()
    console.error(`Outlook sendMail failed [${outlookRes.status}]: ${errText}`)
    return json(
      { error: 'Outlook send failed', status: outlookRes.status, details: errText },
      502,
    )
  }

  return json({ success: true })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}