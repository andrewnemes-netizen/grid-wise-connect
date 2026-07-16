import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { template as invoiceTemplate } from '../_shared/transactional-email-templates/invoice.tsx'

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
    .select('id, invoice_number, doc_type, gross_amount, org_id, status, due_date, project_id')
    .eq('id', body.invoice_id)
    .maybeSingle()
  if (invErr || !invoice) return json({ error: 'Invoice not found' }, 404)

  const { data: profile } = await admin
    .from('profiles').select('display_name, email').eq('id', userId).maybeSingle()

  // Best-effort project name for the email header/summary
  let projectName: string | undefined
  if ((invoice as any).project_id) {
    const { data: proj } = await admin
      .from('projects').select('name').eq('id', (invoice as any).project_id).maybeSingle()
    if (proj?.name) projectName = proj.name
  }

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
  const dueLabel = (invoice as any).due_date
    ? new Date((invoice as any).due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : undefined

  const htmlBody = await renderAsync(
    React.createElement(invoiceTemplate.component, {
      recipientName: body.recipient_name,
      senderName: profile?.display_name,
      companyName: 'EcoPower UK',
      docLabel: label,
      invoiceNumber: invoice.invoice_number,
      projectName,
      grandTotal,
      dueDate: dueLabel,
      message: body.message,
    })
  )

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

  // Best-effort push to Xero (never blocks the email)
  try {
    await fetch(`${supabaseUrl}/functions/v1/xero-push-invoice`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoice_id: invoice.id,
        contact_name: body.recipient_name,
        contact_email: body.recipient_email,
      }),
    })
  } catch (e) {
    console.warn('Xero push (invoice) failed:', e instanceof Error ? e.message : e)
  }

  return json({ success: true })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}