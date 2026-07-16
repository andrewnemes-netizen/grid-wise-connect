import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { buildAdmin, mirrorToOneDrive } from '../_shared/onedrive.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

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

  const admin = buildAdmin()
  const text = `EcoPower UK OneDrive test upload — ${new Date().toISOString()}`
  const bytes = new TextEncoder().encode(text)
  const result = await mirrorToOneDrive(admin, {
    entity_type: 'test',
    category: 'project_file',
    filename: `onedrive-test-${Date.now()}.txt`,
    bytes,
    contentType: 'text/plain',
    folder_segments: ['_System', 'Tests'],
    created_by: userData.user.id,
  })
  return json(result as any, result.ok ? 200 : 502)
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}