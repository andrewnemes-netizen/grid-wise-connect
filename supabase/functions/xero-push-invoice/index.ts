import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { adminClient, xeroFetch } from '../_shared/xero.ts'

interface Body {
  invoice_id: string
  contact_name?: string
  contact_email?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const jwt = auth.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData } = await userClient.auth.getUser()
  if (!userData.user) return json({ error: 'Unauthorized' }, 401)

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.invoice_id) return json({ error: 'invoice_id required' }, 400)

  const admin = adminClient()
  const { data: inv, error: invErr } = await admin
    .from('revenue_invoices')
    .select('*')
    .eq('id', body.invoice_id)
    .maybeSingle()
  if (invErr) {
    console.error('Invoice lookup error:', invErr)
    return json({ error: 'Invoice lookup failed', details: invErr.message }, 500)
  }
  if (!inv) return json({ error: 'Invoice not found', invoice_id: body.invoice_id }, 404)

  let projectRow: { project_code?: string; project_name?: string; client_id?: string } | null = null
  if ((inv as any).project_id) {
    const { data: p } = await admin
      .from('revenue_projects')
      .select('project_code, project_name, client_id')
      .eq('id', (inv as any).project_id)
      .maybeSingle()
    projectRow = p as any
  }
  ;(inv as any).project = projectRow

  // Resolve contact name/email
  let contactName = body.contact_name?.trim()
  let contactEmail = body.contact_email?.trim()
  if ((!contactName || !contactEmail) && (inv as any).project?.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('name, email, contact_name')
      .eq('id', (inv as any).project.client_id)
      .maybeSingle()
    if (client) {
      contactName = contactName || client.name || client.contact_name || undefined
      contactEmail = contactEmail || client.email || undefined
    }
  }
  if (!contactName) contactName = 'Customer'

  const net = Number(inv.net_amount) || 0
  const vatRate = Number(inv.vat_rate) || 0
  const project = (inv as any).project
  const desc = inv.notes?.trim() ||
    (project ? `${project.project_code ?? ''} ${project.project_name ?? ''}`.trim() : '') ||
    `Invoice ${inv.invoice_number}`

  const payload = {
    Type: 'ACCREC',
    Contact: contactEmail
      ? { Name: contactName, EmailAddress: contactEmail }
      : { Name: contactName },
    Date: inv.issue_date ?? new Date().toISOString().slice(0, 10),
    DueDate: inv.due_date ?? undefined,
    InvoiceNumber: inv.invoice_number,
    Reference: project?.project_code ?? undefined,
    Status: 'DRAFT',
    LineAmountTypes: 'Exclusive',
    LineItems: [
      {
        Description: desc,
        Quantity: 1,
        UnitAmount: net,
        TaxType: vatRate > 0 ? 'OUTPUT2' : 'NONE',
      },
    ],
  }

  const method = inv.xero_invoice_id ? 'POST' : 'PUT'
  const path = inv.xero_invoice_id ? `/Invoices/${inv.xero_invoice_id}` : '/Invoices'

  const res = await xeroFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    console.error(`Xero push invoice failed [${res.status}]: ${bodyText}`)
    return json({ error: 'Xero push failed', status: res.status, details: bodyText }, res.status)
  }
  const parsed = JSON.parse(bodyText)
  const xInv = parsed.Invoices?.[0]
  if (!xInv) return json({ error: 'Xero returned no invoice', details: parsed }, 502)

  await admin.from('revenue_invoices').update({
    xero_invoice_id: xInv.InvoiceID,
    xero_status: xInv.Status,
    xero_amount_paid: xInv.AmountPaid ?? 0,
    xero_amount_due: xInv.AmountDue ?? null,
    xero_synced_at: new Date().toISOString(),
  }).eq('id', inv.id)

  return json({ success: true, xero_invoice_id: xInv.InvoiceID, xero_status: xInv.Status })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}