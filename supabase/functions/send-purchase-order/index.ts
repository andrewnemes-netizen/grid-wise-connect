import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { template as poTemplate } from '../_shared/transactional-email-templates/purchase-order.tsx'

interface Body {
  po_id: string
  storage_path: string
  recipient_email: string
  recipient_name?: string
  recipient_company?: string
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
  if (!body.po_id || !body.storage_path || !body.recipient_email || !emailRe.test(body.recipient_email)) {
    return json({ error: 'po_id, storage_path and valid recipient_email required' }, 400)
  }
  if (!lovableApiKey || !outlookKey) {
    return json({ error: 'Outlook connector not configured' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: po, error: poErr } = await admin
    .from('purchase_orders')
    .select('id, po_number, order_value, status, issued_at, work_package_id, org_id')
    .eq('id', body.po_id)
    .maybeSingle()
  if (poErr || !po) return json({ error: 'Purchase order not found' }, 404)

  const { data: profile } = await admin
    .from('profiles').select('display_name, email').eq('id', userId).maybeSingle()

  let workPackageName: string | undefined
  if ((po as any).work_package_id) {
    const { data: wp } = await admin
      .from('work_packages').select('name, wp_code').eq('id', (po as any).work_package_id).maybeSingle()
    if (wp) workPackageName = [wp.wp_code, wp.name].filter(Boolean).join(' — ')
  }

  // Download PDF
  const { data: pdfBlob, error: dlErr } = await admin.storage
    .from('purchase-orders')
    .download(body.storage_path)
  if (dlErr || !pdfBlob) return json({ error: 'Failed to download PDF', details: dlErr?.message }, 500)
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < pdfBytes.length; i += chunk) {
    binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk))
  }
  const pdfB64 = btoa(binary)

  const orderTotal = new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2,
  }).format(Number(po.order_value) || 0)

  const subject = body.subject?.trim() || `Purchase order ${po.po_number} — EcoPower UK`
  const issuedDate = (po as any).issued_at
    ? new Date((po as any).issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  const htmlBody = await renderAsync(
    React.createElement(poTemplate.component, {
      recipientName: body.recipient_name,
      recipientCompany: body.recipient_company,
      senderName: profile?.display_name,
      companyName: 'EcoPower UK',
      poNumber: po.po_number,
      workPackageName,
      orderTotal,
      issuedDate,
      message: body.message,
    })
  )

  const safeName = String(po.po_number ?? 'purchase-order').replace(/[^a-z0-9-_]/gi, '_') + '.pdf'

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

  // Flip draft POs to issued
  const patch: Record<string, unknown> = {}
  if (!po.issued_at) patch.issued_at = new Date().toISOString()
  if (po.status === 'draft') patch.status = 'issued'
  if (Object.keys(patch).length) {
    await admin.from('purchase_orders').update(patch).eq('id', po.id)
  }

  return json({ success: true })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}