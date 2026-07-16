import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { adminClient, xeroFetch } from '../_shared/xero.ts'

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

  const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: isAdmin } = await service.rpc('has_role', {
    _user_id: userData.user.id,
    _role: 'admin',
  })
  if (!isAdmin) return json({ error: 'Admins only' }, 403)

  try {
    let page = 1
    let totalSynced = 0
    const admin = adminClient()
    while (page < 50) {
      const res = await xeroFetch(`/Contacts?page=${page}&includeArchived=false`)
      const bodyText = await res.text()
      if (!res.ok) {
        return json({ error: 'Xero contacts fetch failed', status: res.status, details: bodyText }, res.status)
      }
      const parsed = JSON.parse(bodyText)
      const contacts: Array<any> = parsed.Contacts ?? []
      if (!contacts.length) break
      const rows = contacts.map((c) => ({
        xero_contact_id: c.ContactID,
        name: c.Name ?? '(unnamed)',
        email: c.EmailAddress ?? null,
        contact_status: c.ContactStatus ?? null,
        is_customer: !!c.IsCustomer,
        is_supplier: !!c.IsSupplier,
        last_synced_at: new Date().toISOString(),
      }))
      const { error } = await admin
        .from('xero_contacts')
        .upsert(rows, { onConflict: 'xero_contact_id' })
      if (error) throw error
      totalSynced += rows.length
      if (contacts.length < 100) break
      page += 1
    }
    return json({ success: true, synced: totalSynced })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('xero-sync-contacts error:', msg)
    return json({ error: msg }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}