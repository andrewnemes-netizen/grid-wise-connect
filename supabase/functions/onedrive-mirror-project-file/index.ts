import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { buildAdmin, mirrorToOneDrive } from '../_shared/onedrive.ts'

interface Body {
  project_file_id: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  )
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.project_file_id) return json({ error: 'project_file_id required' }, 400)

  const admin = buildAdmin()
  const { data: file } = await admin
    .from('project_files')
    .select('id, project_id, storage_path, filename, mime')
    .eq('id', body.project_file_id)
    .maybeSingle()
  if (!file) return json({ error: 'File not found' }, 404)

  const { data: blob, error: dlErr } = await admin.storage
    .from('project-files')
    .download(file.storage_path)
  if (dlErr || !blob) return json({ error: 'Download failed', details: dlErr?.message }, 500)
  const bytes = new Uint8Array(await blob.arrayBuffer())

  const result = await mirrorToOneDrive(admin, {
    entity_type: 'project_file',
    entity_id: file.id,
    project_id: file.project_id,
    category: 'project_file',
    filename: file.filename || 'file',
    bytes,
    contentType: file.mime || 'application/octet-stream',
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