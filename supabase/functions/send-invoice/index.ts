import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface Body {
  invoice_id: string
  storage_path: string
  recipient_email: string
  recipient_name?: string
  subject?: string
  message?: string
  cc_emails?: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
  const outlookKey = Deno.env.get('MICROSOFT_OUTLOOK_API_KEY')

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
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!body.invoice_id || !body.storage_path || !body.recipient_email || !emailRe.test(body.recipient_email)) {
    return json({ error: 'invoice_id, storage_path and valid recipient_email required' }, 400)
  }
  if (!lovableApiKey || !outlookKey) {
    return json({ error: 'Outlook connector not configured' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: invoice, error: invErr } = await admin
    .from('revenue_invoices')
    .select('id, invoice_number, doc_type, gross_amount, org_id, status')
    .eq('id', body.invoice_id)
    .maybeSingle()
  if (invErr || !invoice) return json({ error: 'Invoice not found' }, 404)

  const { data: profile } = await admin
    .from('profiles').select('display_name, email').eq('id', userId).maybeSingle()

  // Download PDF and base64-encode (chunked)
  const { data: pdfBlob, error: dlErr } = await admin.storage
    .from('invoices')
    .download(body.storage_path)
  if (dlErr || !pdfBlob) return json({ error: 'Failed to download PDF', details: dlErr?.message }, 500)
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < pdfBytes.length; i += chunk) {
    binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk))
  }
  const pdfB64 = btoa(binary)

  const isPA = invoice.doc_type === 'payment_application'
  const label = isPA ? 'Payment application' : 'Invoice'
  const grandTotal = new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2,
  }).format(Number(invoice.gross_amount) || 0)

  const subject = body.subject?.trim() || `${label} ${invoice.invoice_number} — EcoPower UK`
  const greeting = body.recipient_name ? `Hi ${body.recipient_name},` : 'Hello,'
  const bodyText = (body.message ?? `Please find attached ${label.toLowerCase()} ${invoice.invoice_number}.`).replace(/\n/g, '<br/>')
  const signature = profile?.display_name
    ? `Kind regards,<br/>${profile.display_name}<br/>EcoPower UK`
    : 'Kind regards,<br/>EcoPower UK'
  const htmlBody = `<p>${greeting}</p><p>${bodyText}</p><p><strong>Total due:</strong> ${grandTotal}</p><p>${signature}</p>`

  const safeName = String(invoice.invoice_number ?? 'invoice').replace(/[^a-z0-9-_]/gi, '_') + '.pdf'

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
        toRecipients: [{ emailAddress: { address: body.recipient_email } }],
        ccRecipients: (body.cc_emails ?? []).map((e) => ({ emailAddress: { address: e } })),
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: safeName,
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
    return json({ error: 'Outlook send failed', status: outlookRes.status, details: errText }, 502)
  }

  // If invoice is still draft, mark as submitted
  if (invoice.status === 'draft') {
    await admin.from('revenue_invoices').update({ status: 'submitted' }).eq('id', invoice.id)
  }

  return json({ success: true })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}