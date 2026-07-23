// Creates a DRAFT POC-design purchase order and its lines/site allocations.
// Does NOT send email or mark the PO as issued — that's issue-poc-purchase-order.
//
// Auth: caller must be signed in and hold admin or engineer role.
// PO numbering: POC-YYYY-#### per org, via public.next_poc_po_number(); we retry
// once on unique-violation to survive a race with a concurrent create.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface SiteInput {
  site_id: string
  address?: string | null
  postcode?: string | null
  siteId?: string | null // human site code
  fee?: number | null    // per-site fee, when feeBasis === 'per_site'
}

interface Body {
  work_package_id: string
  source_task_id?: string | null
  designer_name?: string | null
  designer_email: string
  fee: number
  fee_basis: 'per_site' | 'fixed'
  payment_terms?: string | null
  po_terms?: string | null
  due_date?: string | null
  sites: SiteInput[]
  notes?: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)
  const userId = userData.user.id

  // Staff gate: admin or engineer
  const admin = serviceKey ? createClient(supabaseUrl, serviceKey) : userClient
  const { data: roles } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
  const allowed = new Set(['admin', 'engineer'])
  if (!(roles ?? []).some((r: any) => allowed.has(r.role))) {
    return json({ error: 'Forbidden — staff only' }, 403)
  }

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  // Basic validation
  const errs: string[] = []
  if (!body.work_package_id) errs.push('work_package_id required')
  if (!body.designer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.designer_email)) errs.push('valid designer_email required')
  if (!(typeof body.fee === 'number' && body.fee > 0)) errs.push('fee must be > 0')
  if (body.fee_basis !== 'per_site' && body.fee_basis !== 'fixed') errs.push('fee_basis must be per_site or fixed')
  if (!Array.isArray(body.sites) || body.sites.length === 0) errs.push('sites required')
  if (errs.length) return json({ error: 'Validation failed', details: errs }, 400)

  // Resolve org_id from work package
  const { data: wp, error: wpErr } = await admin
    .from('work_packages')
    .select('id, name, code, programme_id, programmes:programme_id(name, code, accounts:account_id(name))')
    .eq('id', body.work_package_id)
    .maybeSingle()
  if (wpErr || !wp) return json({ error: 'Work package not found', details: wpErr?.message }, 404)
  // work_packages has no org_id column in this schema; PO numbering falls back
  // to the shared POC- sequence via `IS NOT DISTINCT FROM null` in the RPC.
  const orgId: string | null = null

  // Line values
  const siteCount = body.sites.length
  const total = Number(body.fee)
  const perSite = body.fee_basis === 'per_site' ? total : total / Math.max(1, siteCount)
  const totalOrderValue = body.fee_basis === 'per_site' ? total * siteCount : total

  // Generate PO number with a retry on unique violation (POC-YYYY-#### per org)
  async function generateAndInsert(): Promise<{ poId: string; poNumber: string }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: nextNumData, error: nextErr } = await admin.rpc('next_poc_po_number', { _org: orgId })
      if (nextErr) throw new Error(`PO number generation failed: ${nextErr.message}`)
      const poNumber = String(nextNumData)

      const { data: poRow, error: insErr } = await admin
        .from('purchase_orders')
        .insert({
          work_package_id: body.work_package_id,
          org_id: orgId,
          po_number: poNumber,
          category: 'poc_design',
          status: 'draft',
          order_value: totalOrderValue,
          supplier_contact_name: body.designer_name ?? null,
          supplier_contact_email: body.designer_email,
          source_task_id: body.source_task_id ?? null,
          notes: body.notes ?? null,
          created_by: userId,
        })
        .select('id, po_number')
        .single()
      if (!insErr && poRow) return { poId: poRow.id, poNumber: poRow.po_number }

      // 23505 = unique_violation; retry with fresh number
      if ((insErr as any)?.code === '23505') continue
      throw new Error(`PO insert failed: ${insErr?.message ?? 'unknown'}`)
    }
    throw new Error('Could not allocate PO number after 3 attempts')
  }

  let created: { poId: string; poNumber: string }
  try { created = await generateAndInsert() }
  catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }

  // Create one PO line per site + line_sites mapping
  const lineRows = body.sites.map((s, idx) => ({
    po_id: created.poId,
    description: `POC application — ${s.address ?? s.siteId ?? s.site_id}`,
    line_value: perSite,
    unit_rate: perSite,
    qty: 1,
    sort_index: idx,
  }))
  const { data: insertedLines, error: linesErr } = await admin
    .from('po_lines')
    .insert(lineRows)
    .select('id, sort_index')
  if (linesErr) return json({ error: 'PO lines insert failed', details: linesErr.message }, 500)

  const linesBySortIndex = new Map<number, string>((insertedLines ?? []).map((r: any) => [r.sort_index, r.id]))
  const linkRows = body.sites.map((s, idx) => ({
    po_line_id: linesBySortIndex.get(idx)!,
    site_id: s.site_id,
    qty: 1,
    value: perSite,
  }))
  const { error: linkErr } = await admin.from('po_line_sites').insert(linkRows)
  if (linkErr) return json({ error: 'po_line_sites insert failed', details: linkErr.message }, 500)

  return json({
    ok: true,
    poId: created.poId,
    poNumber: created.poNumber,
    orderValue: totalOrderValue,
    perSiteFee: perSite,
    workPackage: {
      id: wp.id, name: (wp as any).name, wp_code: (wp as any).code,
      programmeName: (wp as any).programmes?.name ?? null,
      programmeCode: (wp as any).programmes?.code ?? null,
      organisationName: (wp as any).programmes?.accounts?.name ?? null,
    },
  })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}