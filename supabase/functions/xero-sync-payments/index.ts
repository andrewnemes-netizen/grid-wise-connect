import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { adminClient, xeroFetch, loadConnection } from '../_shared/xero.ts'

// Runs on-demand or via pg_cron. No JWT check (verify_jwt=false).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const conn = await loadConnection()
  if (!conn) return json({ skipped: true, reason: 'Xero not connected' })

  const admin = adminClient()
  const { data: invoices, error } = await admin
    .from('revenue_invoices')
    .select('id, xero_invoice_id')
    .not('xero_invoice_id', 'is', null)
    .neq('xero_status', 'PAID')
  if (error) return json({ error: error.message }, 500)
  if (!invoices || invoices.length === 0) return json({ success: true, updated: 0 })

  let updated = 0
  // Batch in chunks of 40 IDs
  const chunkSize = 40
  for (let i = 0; i < invoices.length; i += chunkSize) {
    const chunk = invoices.slice(i, i + chunkSize)
    const ids = chunk.map((c) => c.xero_invoice_id).join(',')
    const res = await xeroFetch(`/Invoices?IDs=${encodeURIComponent(ids)}`)
    const bodyText = await res.text()
    if (!res.ok) {
      console.error(`Xero pull invoices failed [${res.status}]: ${bodyText}`)
      continue
    }
    const parsed = JSON.parse(bodyText)
    const xInvs: Array<any> = parsed.Invoices ?? []
    for (const xi of xInvs) {
      const local = chunk.find((c) => c.xero_invoice_id === xi.InvoiceID)
      if (!local) continue
      await admin.from('revenue_invoices').update({
        xero_status: xi.Status,
        xero_amount_paid: xi.AmountPaid ?? 0,
        xero_amount_due: xi.AmountDue ?? null,
        xero_synced_at: new Date().toISOString(),
      }).eq('id', local.id)
      // Also flip app status to 'paid' when Xero says so
      if (xi.Status === 'PAID') {
        await admin.from('revenue_invoices').update({ status: 'paid' }).eq('id', local.id)
      }
      updated++
    }
  }

  return json({ success: true, updated })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}