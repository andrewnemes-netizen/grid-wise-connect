import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { template as quotationTemplate } from '../_shared/transactional-email-templates/quotation.tsx'

interface Body {
  estimate_id: string
  storage_path: string
  recipient_email: string
  recipient_name?: string
  subject?: string
  message?: string
  cc_emails?: string[]
}

const SIGNED_URL_TTL = 60 * 60 * 24 * 30 // 30 days

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

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
  if (
    !body.estimate_id ||
    !body.storage_path ||
    !body.recipient_email ||
    !emailRe.test(body.recipient_email)
  ) {
    return json({ error: 'estimate_id, storage_path and valid recipient_email required' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // Load estimate for context + display info
  const { data: estimate, error: estErr } = await admin
    .from('estimates')
    .select('id, name, ref, currency, grand_total, work_package_id, project_id')
    .eq('id', body.estimate_id)
    .maybeSingle()
  if (estErr || !estimate) return json({ error: 'Estimate not found' }, 404)

  // Sender + org context (best effort)
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, email')
    .eq('id', userId)
    .maybeSingle()

  // Site/WP name (best effort)
  let siteName: string | undefined
  if (estimate.work_package_id) {
    const { data: wp } = await admin
      .from('work_packages')
      .select('name')
      .eq('id', estimate.work_package_id)
      .maybeSingle()
    if (wp?.name) siteName = wp.name
  }

  // Signed URL for PDF
  const { data: signed, error: signErr } = await admin.storage
    .from('quotations')
    .createSignedUrl(body.storage_path, SIGNED_URL_TTL)
  if (signErr || !signed?.signedUrl) {
    return json({ error: 'Failed to create download link', details: signErr?.message }, 500)
  }

  const grandTotal = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: estimate.currency ?? 'GBP',
    minimumFractionDigits: 2,
  }).format(Number(estimate.grand_total) || 0)

  const subject =
    body.subject?.trim() ||
    `Quotation ${estimate.ref ?? estimate.name ?? ''} — EcoPower UK`.trim()

  // Log the send attempt
  const { data: logRow, error: logErr } = await admin
    .from('quotation_sends')
    .insert({
      estimate_id: body.estimate_id,
      recipient_email: body.recipient_email,
      recipient_name: body.recipient_name ?? null,
      cc_emails: body.cc_emails ?? null,
      subject,
      message: body.message ?? null,
      pdf_storage_path: body.storage_path,
      pdf_signed_url: signed.signedUrl,
      status: 'pending',
      sent_by: userId,
    })
    .select('id')
    .single()
  if (logErr) return json({ error: 'Failed to log send', details: logErr.message }, 500)

  // Send via Microsoft Outlook connector (PDF attached)
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
  const outlookKey = Deno.env.get('MICROSOFT_OUTLOOK_API_KEY')
  if (!lovableApiKey || !outlookKey) {
    await admin
      .from('quotation_sends')
      .update({ status: 'failed', error_message: 'Outlook connector not configured' })
      .eq('id', logRow.id)
    return json({ error: 'Outlook connector not configured' }, 500)
  }

  // Download PDF from storage as bytes
  const { data: pdfBlob, error: dlErr } = await admin.storage
    .from('quotations')
    .download(body.storage_path)
  if (dlErr || !pdfBlob) {
    await admin
      .from('quotation_sends')
      .update({ status: 'failed', error_message: `PDF download failed: ${dlErr?.message}` })
      .eq('id', logRow.id)
    return json({ error: 'Failed to download PDF', details: dlErr?.message }, 500)
  }
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer())
  // Base64 encode (chunked to avoid stack overflow on large PDFs)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < pdfBytes.length; i += chunk) {
    binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk))
  }
  const pdfB64 = btoa(binary)

  const fileBase = (estimate.ref ?? estimate.name ?? 'quotation').toString().replace(/[^a-z0-9-_]/gi, '_')
  const attachmentName = `${fileBase}.pdf`

  // Render branded React Email template to HTML
  const htmlBody = await renderAsync(
    React.createElement(quotationTemplate.component, {
      recipientName: body.recipient_name,
      senderName: profile?.display_name,
      companyName: 'EcoPower UK',
      estimateName: estimate.name ?? undefined,
      estimateRef: estimate.ref ?? undefined,
      grandTotal,
      message: body.message,
      siteName,
      // pdfUrl intentionally omitted — PDF is attached, no download button needed
    })
  )

  const toRecipients = [{ emailAddress: { address: body.recipient_email } }]
  const ccRecipients = (body.cc_emails ?? []).map((e) => ({ emailAddress: { address: e } }))

  const outlookRes = await fetch('https://connector-gateway.lovable.dev/microsoft_outlook/me/sendMail', {
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
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: attachmentName,
            contentType: 'application/pdf',
            contentBytes: pdfB64,
          },
        ],
      },
      saveToSentItems: true,
    }),
  })

  if (!outlookRes.ok) {
    const errText = await outlookRes.text()
    console.error(`Outlook sendMail failed [${outlookRes.status}]: ${errText}`)
    await admin
      .from('quotation_sends')
      .update({ status: 'failed', error_message: `[${outlookRes.status}] ${errText}` })
      .eq('id', logRow.id)
    return json({ error: 'Outlook send failed', status: outlookRes.status, details: errText }, 502)
  }

  await admin
    .from('quotation_sends')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', logRow.id)

  return json({ success: true, quotation_send_id: logRow.id, pdf_url: signed.signedUrl })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}