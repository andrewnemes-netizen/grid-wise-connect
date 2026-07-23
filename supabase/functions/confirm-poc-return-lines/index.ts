// Takes reviewed lines from poc_designer_return_lines and materialises them
// into a DRAFT rate_card_version + rate_items. Goes through the standard
// Rate Library approval flow (no special-casing) — the version is left DRAFT.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface Body {
  return_id: string
  contract_id: string        // where to hang the rate card
  rate_card_name?: string    // defaults to `POC return <PO number>`
  line_ids: string[]         // which staging lines to confirm (must all have confirmed_unit_cost)
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)
  const userId = userData.user.id
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId)
  if (!(roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'engineer')) {
    return json({ error: 'Forbidden — staff only' }, 403)
  }

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.return_id || !body.contract_id || !Array.isArray(body.line_ids) || body.line_ids.length === 0) {
    return json({ error: 'return_id, contract_id and line_ids required' }, 400)
  }

  const { data: ret, error: rErr } = await admin
    .from('poc_designer_returns')
    .select('id, po_id, purchase_orders:po_id(po_number)')
    .eq('id', body.return_id)
    .maybeSingle()
  if (rErr || !ret) return json({ error: 'Return not found' }, 404)

  const { data: lines, error: lErr } = await admin
    .from('poc_designer_return_lines')
    .select('*')
    .eq('return_id', body.return_id)
    .in('id', body.line_ids)
  if (lErr) return json({ error: lErr.message }, 500)
  const missing = (lines ?? []).filter((l: any) => l.confirmed_unit_cost == null || !l.rate_code || !l.description)
  if (missing.length > 0) {
    return json({ error: `${missing.length} line(s) missing rate_code/description/confirmed_unit_cost` }, 400)
  }

  const cardName = body.rate_card_name?.trim()
    || `POC return ${(ret as any).purchase_orders?.po_number ?? ret.id.slice(0, 8)}`

  // Reuse card if it already exists, else create it.
  let cardId: string
  {
    const { data: existing } = await admin
      .from('rate_cards')
      .select('id')
      .eq('contract_id', body.contract_id)
      .eq('name', cardName)
      .maybeSingle()
    if (existing) {
      cardId = (existing as any).id
    } else {
      const { data: created, error: cErr } = await admin
        .from('rate_cards')
        .insert({ contract_id: body.contract_id, name: cardName, description: 'Auto-generated from POC designer return' })
        .select('id').single()
      if (cErr) return json({ error: cErr.message }, 500)
      cardId = (created as any).id
    }
  }

  // Next version number
  const { data: versions } = await admin
    .from('rate_card_versions')
    .select('version_number')
    .eq('rate_card_id', cardId)
    .order('version_number', { ascending: false })
    .limit(1)
  const nextVersion = ((versions?.[0] as any)?.version_number ?? 0) + 1

  const { data: version, error: vErr } = await admin
    .from('rate_card_versions')
    .insert({
      rate_card_id: cardId,
      version_number: nextVersion,
      status: 'DRAFT',
      imported_at: new Date().toISOString(),
      imported_by: userId,
      notes: `Confirmed from POC return ${body.return_id}`,
    })
    .select('id').single()
  if (vErr) return json({ error: vErr.message }, 500)
  const versionId = (version as any).id

  const itemRows = (lines as any[]).map((l) => ({
    rate_card_version_id: versionId,
    rate_code: l.rate_code,
    description: l.description,
    total_unit_cost: l.confirmed_unit_cost,
    source_ser: 'poc_return',
  }))
  const { error: iErr } = await admin.from('rate_items').insert(itemRows)
  if (iErr) return json({ error: iErr.message }, 500)

  await admin.from('poc_designer_return_lines')
    .update({ reviewed: true, reviewer_id: userId, reviewed_at: new Date().toISOString() })
    .in('id', body.line_ids)

  try {
    await admin.from('audit_log').insert({
      action: 'poc_return.confirmed',
      entity_type: 'poc_designer_return',
      entity_id: body.return_id,
      meta_json: { rate_card_id: cardId, rate_card_version_id: versionId, line_count: itemRows.length },
    })
  } catch (e) { console.error('audit_log failed', e) }

  return json({ ok: true, rate_card_id: cardId, rate_card_version_id: versionId, inserted: itemRows.length })
})