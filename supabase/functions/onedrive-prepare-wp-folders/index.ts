import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { buildAdmin } from '../_shared/onedrive.ts'

// Pre-create the destination Work Package's OneDrive folder tree so that
// subsequent uploads (post site-move) land in the right place immediately.
// Fire-and-forget from MoveSiteDialog after a successful move.

const CATEGORIES = ['invoice','payment_application','purchase_order','quotation','survey','project_file'] as const
const GRAPH = 'https://connector-gateway.lovable.dev/microsoft_onedrive'

function sanitize(s: string): string {
  return (s || '').replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'unnamed'
}
function shortId(id?: string | null): string { return (id || '').replace(/-/g, '').slice(0, 6) }
function encodePath(segs: string[]) { return segs.map(encodeURIComponent).join('/') }

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
  const { data: userData } = await userClient.auth.getUser()
  if (!userData?.user) return json({ error: 'Unauthorized' }, 401)

  let body: { work_package_id?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.work_package_id) return json({ error: 'work_package_id required' }, 400)

  const lovableKey = Deno.env.get('LOVABLE_API_KEY')
  const onedriveKey = Deno.env.get('MICROSOFT_ONEDRIVE_API_KEY')
  if (!lovableKey || !onedriveKey) return json({ error: 'OneDrive connector not configured' }, 503)

  const admin = buildAdmin()
  const { data: wp } = await admin
    .from('work_packages')
    .select('id, name, wp_code, project_id, projects(name)')
    .eq('id', body.work_package_id)
    .maybeSingle()
  if (!wp) return json({ error: 'Work package not found' }, 404)

  const { data: settings } = await admin.from('app_settings').select('onedrive_root_folder').limit(1).maybeSingle()
  const root = sanitize((settings as any)?.onedrive_root_folder || 'EcoPower UK')
  const projectName = sanitize(((wp as any).projects?.name as string) || 'Project')
  const projectSeg = `${projectName} [${shortId((wp as any).project_id)}]`
  const wpSeg = sanitize([(wp as any).wp_code, (wp as any).name].filter(Boolean).join(' ') || 'Work Package')

  const results: Array<{ category: string; path: string; ok: boolean; error?: string }> = []
  for (const category of CATEGORIES) {
    const label = ({
      invoice: 'Invoices', payment_application: 'Payment Applications',
      purchase_order: 'Purchase Orders', quotation: 'Quotations',
      survey: 'Surveys', project_file: 'Project Files',
    } as const)[category]
    const segments = [root, 'Projects', projectSeg, wpSeg, label]
    try {
      let parentPath = ''
      let parentItemId: string | null = null
      for (const seg of segments) {
        const createUrl = parentPath
          ? `${GRAPH}/me/drive/root:/${encodePath(parentPath.split('/'))}:/children`
          : `${GRAPH}/me/drive/root/children`
        const res = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableKey}`,
            'X-Connection-Api-Key': onedriveKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: seg, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
        })
        if (res.ok) {
          parentItemId = (await res.json()).id
        } else if (res.status === 409) {
          const nextPath = parentPath ? `${parentPath}/${seg}` : seg
          const look = await fetch(`${GRAPH}/me/drive/root:/${encodePath(nextPath.split('/'))}`, {
            headers: { 'Authorization': `Bearer ${lovableKey}`, 'X-Connection-Api-Key': onedriveKey },
          })
          if (!look.ok) throw new Error(`lookup ${look.status}: ${(await look.text()).slice(0, 200)}`)
          parentItemId = (await look.json()).id
        } else {
          throw new Error(`create ${res.status}: ${(await res.text()).slice(0, 200)}`)
        }
        parentPath = parentPath ? `${parentPath}/${seg}` : seg
      }
      if (parentItemId) {
        await admin.from('onedrive_folder_cache').upsert({
          project_id: (wp as any).project_id,
          work_package_id: wp.id,
          category,
          folder_path: segments.join('/'),
          onedrive_item_id: parentItemId,
        }, { onConflict: 'project_id,work_package_id,category' })
      }
      results.push({ category, path: segments.join('/'), ok: true })
    } catch (e) {
      results.push({ category, path: segments.join('/'), ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return json({ ok: true, work_package_id: wp.id, prepared: results })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}