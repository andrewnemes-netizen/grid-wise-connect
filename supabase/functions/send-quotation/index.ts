import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

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

  // Invoke send-transactional-email
  const templateData = {
    recipientName: body.recipient_name,
    senderName: profile?.display_name ?? undefined,
    companyName: 'EcoPower UK',
    estimateName: estimate.name,
    estimateRef: estimate.ref,
    grandTotal,
    message: body.message,
    pdfUrl: signed.signedUrl,
    siteName,
  }

  const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      templateName: 'quotation',
      recipientEmail: body.recipient_email,
      idempotencyKey: `quotation-${logRow.id}`,
      templateData,
    }),
  })

  if (!sendRes.ok) {
    const errText = await sendRes.text()
    await admin
      .from('quotation_sends')
      .update({ status: 'failed', error_message: errText })
      .eq('id', logRow.id)
    return json({ error: 'Failed to enqueue email', status: sendRes.status, details: errText }, 502)
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