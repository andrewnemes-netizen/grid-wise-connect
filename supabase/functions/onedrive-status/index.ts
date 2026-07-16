import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getDriveInfo } from '../_shared/onedrive.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  )
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)

  const configured = !!Deno.env.get('MICROSOFT_ONEDRIVE_API_KEY') && !!Deno.env.get('LOVABLE_API_KEY')
  if (!configured) return json({ connected: false, reason: 'connector_not_linked' })

  const info = await getDriveInfo()
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: settings } = await admin
    .from('app_settings')
    .select('onedrive_root_folder')
    .limit(1)
    .maybeSingle()

  return json({
    connected: info.ok,
    drive_name: info.name,
    owner: info.owner,
    quota: info.quota,
    root_folder: (settings as any)?.onedrive_root_folder ?? 'EcoPower UK',
    error: info.error,
    status: info.status,
  })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}