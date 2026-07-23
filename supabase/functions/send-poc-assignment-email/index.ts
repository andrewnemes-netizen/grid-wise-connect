import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { template as pocTemplate } from '../_shared/transactional-email-templates/poc-assignment.tsx'

interface Body {
  recipientEmail?: string
  assigneeUserId?: string
  recipientName?: string
  subject?: string
  templateData?: Record<string, unknown>
  cc_emails?: string[]
  // New: multiple attachments. Kept optional for backward compatibility
  // with the older single-attachment shape (see `attachment` below).
  attachments?: Array<{
    filename: string
    contentBase64: string
    contentType?: string
  }>
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
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)
  const userId = userData.user.id

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  let recipientEmail = body.recipientEmail?.trim() ?? ''
  const adminClient = serviceKey ? createClient(supabaseUrl, serviceKey) : null
  // Resolve email from assigneeUserId (internal designer) if not provided
  if (!recipientEmail && body.assigneeUserId) {
    if (adminClient) {
      const { data: u, error: e } = await adminClient.auth.admin.getUserById(body.assigneeUserId)
      if (e || !u?.user?.email) {
        return json({ error: 'Could not resolve assignee email', details: e?.message }, 400)
      }
      recipientEmail = u.user.email
    }
  }
  if (!recipientEmail || !emailRe.test(recipientEmail)) {
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

  const toRecipients = [{ emailAddress: { address: recipientEmail } }]
  const ccRecipients = (body.cc_emails ?? []).map((e) => ({ emailAddress: { address: e } }))

  // Merge new attachments[] with legacy single attachment (attachments[] wins,
  // legacy shape kept working for one release).
  const rawAttachments: Array<{ filename: string; contentBase64: string; contentType?: string }> = []
  if (Array.isArray(body.attachments)) rawAttachments.push(...body.attachments)
  if (body.attachment) rawAttachments.push(body.attachment)
  const graphAttachments = rawAttachments
    .filter((a) => a && a.filename && a.contentBase64)
    .map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType:
        a.contentType ??
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentBytes: a.contentBase64,
    }))
  const attachments = graphAttachments.length > 0 ? graphAttachments : undefined

  const message = {
    subject,
    body: { contentType: 'HTML', content: htmlBody },
    toRecipients,
    ccRecipients,
    ...(attachments ? { attachments } : {}),
  }

  const outlookRes = await fetch(
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
  if (!outlookRes.ok) {
    const errText = await outlookRes.text()
    console.error(`Outlook sendMail failed [${outlookRes.status}]: ${errText}`)
    return json({ error: 'Outlook send failed', status: outlookRes.status, details: errText }, 502)
  }
  return json({ success: true, sender: 'shared' })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}