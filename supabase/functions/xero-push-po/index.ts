import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { adminClient, xeroFetch } from '../_shared/xero.ts'

interface Body {
  po_id: string
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
  if (!body.po_id) return json({ error: 'po_id required' }, 400)

  const admin = adminClient()
  const { data: po, error: poErr } = await admin
    .from('purchase_orders')
    .select('*, work_packages(name, wp_code)')
    .eq('id', body.po_id)
    .maybeSingle()
  if (poErr || !po) return json({ error: 'PO not found' }, 404)

  const { data: lines } = await admin
    .from('po_lines')
    .select('description, line_value')
    .eq('po_id', po.id)
    .order('sort_index')

  const contactName = body.contact_name?.trim() || 'Supplier'
  const contactEmail = body.contact_email?.trim()

  const wp = (po as any).work_packages
  const wpLabel = wp ? [wp.wp_code, wp.name].filter(Boolean).join(' — ') : undefined

  const lineItems = (lines && lines.length > 0)
    ? lines.map((l) => ({
        Description: l.description || 'Line item',
        Quantity: 1,
        UnitAmount: Number(l.line_value) || 0,
      }))
    : [{
        Description: wpLabel || `Purchase order ${po.po_number}`,
        Quantity: 1,
        UnitAmount: Number(po.order_value) || 0,
      }]

  const payload = {
    Contact: contactEmail
      ? { Name: contactName, EmailAddress: contactEmail }
      : { Name: contactName },
    Date: po.issued_at ? new Date(po.issued_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    DeliveryDate: undefined,
    PurchaseOrderNumber: po.po_number,
    Reference: wpLabel,
    Status: 'DRAFT',
    LineAmountTypes: 'Exclusive',
    LineItems: lineItems,
  }

  const method = po.xero_purchase_order_id ? 'POST' : 'PUT'
  const path = po.xero_purchase_order_id ? `/PurchaseOrders/${po.xero_purchase_order_id}` : '/PurchaseOrders'

  const res = await xeroFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    console.error(`Xero push PO failed [${res.status}]: ${bodyText}`)
    return json({ error: 'Xero push failed', status: res.status, details: bodyText }, res.status)
  }
  const parsed = JSON.parse(bodyText)
  const xPo = parsed.PurchaseOrders?.[0]
  if (!xPo) return json({ error: 'Xero returned no PO', details: parsed }, 502)

  await admin.from('purchase_orders').update({
    xero_purchase_order_id: xPo.PurchaseOrderID,
    xero_status: xPo.Status,
    xero_synced_at: new Date().toISOString(),
  }).eq('id', po.id)

  return json({ success: true, xero_purchase_order_id: xPo.PurchaseOrderID, xero_status: xPo.Status })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}