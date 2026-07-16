import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { adminClient } from '../_shared/xero.ts'

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

  const admin = adminClient()
  await admin.from('xero_connection').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  return json({ success: true })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}