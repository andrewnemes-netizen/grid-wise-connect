// Second step of POC PO flow: takes a DRAFT PO, sends the designer email with
// PDF + optional XLSX attached, mirrors the PDF to OneDrive, and flips the PO
// to 'issued'. Refuses to run against a non-DRAFT poc_design PO.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { buildAdmin, mirrorToOneDrive } from '../_shared/onedrive.ts'

interface Attachment { filename: string; contentBase64: string; contentType?: string }

interface Body {
  po_id: string
  pdf_base64: string           // required — POC PO PDF
  xlsx_base64?: string | null  // optional site list attachment
  designer_name?: string | null
  designer_email: string
  message?: string | null
  due_date?: string | null
  sites?: unknown              // pass-through to email template
  cc_emails?: string[]
  work_package_id: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)
  const userId = userData.user.id
  const admin = buildAdmin()

  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId)
  if (!(roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'engineer')) {
    return json({ error: 'Forbidden — staff only' }, 403)
  }

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.po_id || !body.pdf_base64 || !body.designer_email || !body.work_package_id) {
    return json({ error: 'po_id, pdf_base64, designer_email, work_package_id required' }, 400)
  }

  // Load PO — must be DRAFT poc_design
  const { data: po, error: poErr } = await admin
    .from('purchase_orders')
    .select('id, po_number, category, status, work_package_id, order_value')
    .eq('id', body.po_id)
    .maybeSingle()
  if (poErr || !po) return json({ error: 'PO not found' }, 404)
  if (po.category !== 'poc_design') return json({ error: 'Not a POC design PO' }, 400)
  if (po.status !== 'draft') return json({ error: `PO already ${po.status}, cannot re-issue` }, 409)

  // Load WP context for the email template
  const { data: wp } = await admin
    .from('work_packages')
    .select('name, wp_code, project_id, programmes:programme_id(name, code, accounts:account_id(name, clients:client_id(name)))')
    .eq('id', body.work_package_id)
    .maybeSingle()

  // Build attachments array (new shape) — send-poc-assignment-email accepts both.
  const attachments: Attachment[] = []
  const pdfName = `${String(po.po_number).replace(/[^a-z0-9\-_]/gi, '_')}.pdf`
  attachments.push({
    filename: pdfName,
    contentBase64: body.pdf_base64,
    contentType: 'application/pdf',
  })
  if (body.xlsx_base64) {
    const today = new Date().toISOString().slice(0, 10)
    attachments.push({
      filename: `POC-sites-${today}.xlsx`,
      contentBase64: body.xlsx_base64,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  }

  // Invoke send-poc-assignment-email with user JWT (RLS-safe)
  const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-poc-assignment-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      recipientEmail: body.designer_email,
      recipientName: body.designer_name ?? undefined,
      cc_emails: body.cc_emails ?? [],
      subject: `POC application requested — PO ${po.po_number}`,
      templateData: {
        recipientName: body.designer_name ?? undefined,
        workPackageName: wp?.wp_code ? `${wp.name ?? ''} (${wp.wp_code})`.trim() : (wp?.name ?? undefined),
        programmeName: (wp as any)?.programmes?.name
          ? `${(wp as any).programmes.name}${(wp as any).programmes?.code ? ` (${(wp as any).programmes.code})` : ''}`
          : undefined,
        companyName: (wp as any)?.programmes?.accounts?.clients?.name
          ?? (wp as any)?.programmes?.accounts?.name ?? undefined,
        message: body.message ?? undefined,
        dueDate: body.due_date ?? undefined,
        sites: body.sites ?? [],
        poNumber: po.po_number,
        orderValue: po.order_value,
      },
      attachments,
    }),
  })
  if (!emailRes.ok) {
    const t = await emailRes.text()
    console.error(`send-poc-assignment-email failed [${emailRes.status}]: ${t}`)
    return json({ error: 'Email send failed', status: emailRes.status, details: t }, 502)
  }
  await emailRes.text().catch(() => {})

  // Mirror the PDF into OneDrive PO folder (best-effort — mirrorToOneDrive never throws)
  const pdfBytes = base64ToBytes(body.pdf_base64)
  const mirror = await mirrorToOneDrive(admin, {
    entity_type: 'purchase_order',
    entity_id: po.id,
    project_id: (wp as any)?.project_id ?? null,
    work_package_id: body.work_package_id,
    category: 'purchase_order',
    filename: pdfName,
    bytes: pdfBytes,
    contentType: 'application/pdf',
    created_by: userId,
  })

  // Flip PO to issued
  const { error: updErr } = await admin
    .from('purchase_orders')
    .update({ status: 'issued', issued_at: new Date().toISOString() })
    .eq('id', po.id)
  if (updErr) {
    console.error('PO status update failed:', updErr.message)
    // Email already sent — surface but don't fail loudly
    return json({ ok: true, warning: 'Email sent but PO status update failed', details: updErr.message, poNumber: po.po_number }, 200)
  }

  // Audit
  await admin.from('audit_log').insert({
    action: 'poc_po.issued',
    entity_type: 'purchase_order',
    entity_id: po.id,
    meta_json: {
      po_number: po.po_number,
      designer_email: body.designer_email,
      work_package_id: body.work_package_id,
      onedrive_ok: mirror.ok,
      onedrive_path: mirror.path,
    },
  }).catch(() => {})

  return json({ ok: true, poNumber: po.po_number, onedrive: { ok: mirror.ok, webUrl: mirror.web_url ?? null } })
})

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}