import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

function pathFromUrl(u: string): string | null {
  try {
    const url = new URL(u)
    // .../storage/v1/object/{public|sign}/{bucket}/{path...}
    const m = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/)
    if (!m) return null
    return decodeURIComponent(m[2])
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const userId = userData.user.id

  const url = new URL(req.url)
  const responseId = url.searchParams.get('response_id')
  if (!responseId) return json({ error: 'response_id required' }, 400)

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: row, error: rowErr } = await admin
    .from('site_survey_responses')
    .select('id, site_id, pdf_storage_path, pdf_url')
    .eq('id', responseId)
    .maybeSingle()
  if (rowErr || !row) return json({ error: 'not found' }, 404)

  // Access check: admin/engineer role, or project member of the site's project.
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' })
  const { data: isEng } = await admin.rpc('has_role', { _user_id: userId, _role: 'engineer' })
  let allowed = Boolean(isAdmin) || Boolean(isEng)
  if (!allowed) {
    const { data: site } = await admin.from('sites').select('project_id').eq('id', row.site_id).maybeSingle()
    if (site?.project_id) {
      const { data: member } = await admin
        .from('project_members')
        .select('user_id')
        .eq('project_id', site.project_id)
        .eq('user_id', userId)
        .maybeSingle()
      allowed = Boolean(member)
    }
  }
  if (!allowed) return json({ error: 'forbidden' }, 403)

  const storagePath = row.pdf_storage_path ?? (row.pdf_url ? pathFromUrl(row.pdf_url) : null)
  if (!storagePath) return json({ error: 'no pdf' }, 404)

  const { data: blob, error: dlErr } = await admin.storage.from('site-surveys').download(storagePath)
  if (dlErr || !blob) return json({ error: 'download failed', detail: dlErr?.message }, 502)

  const bytes = new Uint8Array(await blob.arrayBuffer())
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="survey-${responseId}.pdf"`,
      'Cache-Control': 'private, max-age=60',
    },
  })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}