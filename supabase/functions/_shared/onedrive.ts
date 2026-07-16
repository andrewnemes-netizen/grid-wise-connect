// Shared OneDrive helper for edge functions.
// Uses the Lovable connector gateway → Microsoft Graph.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

const GRAPH = 'https://connector-gateway.lovable.dev/microsoft_onedrive/v1.0'

export type OneDriveCategory =
  | 'invoice'
  | 'payment_application'
  | 'purchase_order'
  | 'quotation'
  | 'survey'
  | 'project_file'

const CATEGORY_LABEL: Record<OneDriveCategory, string> = {
  invoice: 'Invoices',
  payment_application: 'Payment Applications',
  purchase_order: 'Purchase Orders',
  quotation: 'Quotations',
  survey: 'Surveys',
  project_file: 'Project Files',
}

export interface MirrorInput {
  entity_type: string
  entity_id?: string | null
  project_id?: string | null
  work_package_id?: string | null
  category: OneDriveCategory
  filename: string
  bytes: Uint8Array
  contentType?: string
  /** Overrides project/wp folder resolution. */
  folder_segments?: string[]
  created_by?: string | null
}

export interface MirrorResult {
  ok: boolean
  path: string
  web_url?: string
  onedrive_item_id?: string
  error?: string
}

function sanitizeSegment(input: string): string {
  return (input || '')
    .replace(/[\/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'unnamed'
}

function sanitizeFilename(input: string): string {
  return (input || 'file')
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'file'
}

function shortId(id?: string | null): string {
  if (!id) return ''
  return id.replace(/-/g, '').slice(0, 6)
}

async function getRootFolder(admin: SupabaseClient): Promise<string> {
  const { data } = await admin
    .from('app_settings')
    .select('onedrive_root_folder')
    .limit(1)
    .maybeSingle()
  const v = (data as any)?.onedrive_root_folder as string | undefined
  return sanitizeSegment(v || 'EcoPower UK')
}

async function resolveSegments(
  admin: SupabaseClient,
  input: MirrorInput,
): Promise<string[]> {
  if (input.folder_segments && input.folder_segments.length) {
    return input.folder_segments.map(sanitizeSegment).filter(Boolean)
  }

  const segments: string[] = ['Projects']
  let projectName: string | null = null
  let wpLabel: string | null = null

  // Resolve project via work_package if only wp given
  let projectId = input.project_id ?? null
  let wpRow: { name?: string | null; wp_code?: string | null; project_id?: string | null } | null = null
  if (input.work_package_id) {
    const { data } = await admin
      .from('work_packages')
      .select('name, wp_code, project_id')
      .eq('id', input.work_package_id)
      .maybeSingle()
    wpRow = (data as any) ?? null
    if (!projectId && wpRow?.project_id) projectId = wpRow.project_id
    if (wpRow) {
      wpLabel = sanitizeSegment(
        [wpRow.wp_code, wpRow.name].filter(Boolean).join(' ') || 'Work Package',
      )
    }
  }

  if (projectId) {
    const { data } = await admin
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle()
    projectName = sanitizeSegment(((data as any)?.name as string) || 'Project')
    const sid = shortId(projectId)
    segments.push(sid ? `${projectName} [${sid}]` : projectName)
  } else {
    segments.push('Unassigned')
  }

  segments.push(wpLabel || '_General')
  segments.push(CATEGORY_LABEL[input.category])
  return segments
}

async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY')
  const onedriveKey = Deno.env.get('MICROSOFT_ONEDRIVE_API_KEY')
  if (!lovableKey || !onedriveKey) {
    throw new Error('OneDrive connector not configured')
  }
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${lovableKey}`)
  headers.set('X-Connection-Api-Key', onedriveKey)
  return await fetch(`${GRAPH}${path}`, { ...init, headers })
}

function encodePath(segments: string[]): string {
  return segments.map((s) => encodeURIComponent(s)).join('/')
}

async function ensureFolder(
  admin: SupabaseClient,
  projectId: string | null | undefined,
  workPackageId: string | null | undefined,
  category: OneDriveCategory,
  segments: string[],
): Promise<{ itemId: string; folderPath: string }> {
  const folderPath = segments.join('/')

  // Cache lookup (only when we have a project/wp scope; folder_segments overrides skip cache)
  const canCache = !!projectId || !!workPackageId
  if (canCache) {
    const { data: cached } = await admin
      .from('onedrive_folder_cache')
      .select('onedrive_item_id, folder_path')
      .eq('category', category)
      .eq('project_id', projectId ?? '00000000-0000-0000-0000-000000000000')
      .eq('work_package_id', workPackageId ?? '00000000-0000-0000-0000-000000000000')
      .maybeSingle()
    if (cached?.onedrive_item_id && cached.folder_path === folderPath) {
      return { itemId: cached.onedrive_item_id, folderPath }
    }
  }

  // Create segments one by one under root
  let parentPath = ''
  let parentItemId: string | null = null
  for (const seg of segments) {
    const createUrl = parentPath
      ? `/me/drive/root:/${encodePath(parentPath.split('/'))}:/children`
      : `/me/drive/root/children`
    const res = await graphFetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: seg,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    })
    if (res.ok) {
      const created = await res.json()
      parentItemId = created.id
    } else if (res.status === 409) {
      // Already exists — look it up
      const nextPath = parentPath ? `${parentPath}/${seg}` : seg
      const lookup = await graphFetch(`/me/drive/root:/${encodePath(nextPath.split('/'))}`)
      if (!lookup.ok) {
        const t = await lookup.text()
        throw new Error(`Folder lookup failed [${lookup.status}]: ${t}`)
      }
      const item = await lookup.json()
      parentItemId = item.id
    } else {
      const t = await res.text()
      throw new Error(`Folder create failed [${res.status}]: ${t}`)
    }
    parentPath = parentPath ? `${parentPath}/${seg}` : seg
  }

  if (!parentItemId) throw new Error('Folder resolution failed')

  if (canCache) {
    await admin
      .from('onedrive_folder_cache')
      .upsert(
        {
          project_id: projectId ?? null,
          work_package_id: workPackageId ?? null,
          category,
          folder_path: folderPath,
          onedrive_item_id: parentItemId,
        },
        { onConflict: 'project_id,work_package_id,category' },
      )
  }

  return { itemId: parentItemId, folderPath }
}

/**
 * Mirror a file to OneDrive. Never throws — always resolves with a result and
 * always writes an audit row to onedrive_uploads.
 */
export async function mirrorToOneDrive(
  admin: SupabaseClient,
  input: MirrorInput,
): Promise<MirrorResult> {
  try {
    const root = await getRootFolder(admin)
    const inner = await resolveSegments(admin, input)
    const segments = [root, ...inner]
    const { folderPath } = await ensureFolder(
      admin,
      input.project_id ?? null,
      input.work_package_id ?? null,
      input.category,
      segments,
    )

    const filename = sanitizeFilename(input.filename)
    const uploadPath = `${folderPath}/${filename}`
    const encoded = encodePath(uploadPath.split('/'))
    const uploadUrl =
      `/me/drive/root:/${encoded}:/content?@microsoft.graph.conflictBehavior=rename`

    const put = await graphFetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': input.contentType || 'application/octet-stream' },
      body: input.bytes,
    })
    if (!put.ok) {
      const t = await put.text()
      throw new Error(`Upload failed [${put.status}]: ${t}`)
    }
    const item = await put.json()
    const result: MirrorResult = {
      ok: true,
      path: uploadPath,
      web_url: item?.webUrl,
      onedrive_item_id: item?.id,
    }

    await admin.from('onedrive_uploads').insert({
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      project_id: input.project_id ?? null,
      work_package_id: input.work_package_id ?? null,
      onedrive_item_id: result.onedrive_item_id ?? null,
      web_url: result.web_url ?? null,
      path: uploadPath,
      filename,
      status: 'ok',
      created_by: input.created_by ?? null,
    })
    return result
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('OneDrive mirror failed:', msg)
    try {
      await admin.from('onedrive_uploads').insert({
        entity_type: input.entity_type,
        entity_id: input.entity_id ?? null,
        project_id: input.project_id ?? null,
        work_package_id: input.work_package_id ?? null,
        path: `${input.category}/${input.filename}`,
        filename: sanitizeFilename(input.filename),
        status: 'error',
        error: msg.slice(0, 500),
        created_by: input.created_by ?? null,
      })
    } catch { /* swallow */ }
    return { ok: false, path: input.filename, error: msg }
  }
}

/** Convenience: build an admin client. */
export function buildAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

/** Ping OneDrive: returns drive display info. */
export async function getDriveInfo(): Promise<{ ok: boolean; name?: string; owner?: string; quota?: any; error?: string; status?: number }> {
  try {
    const res = await graphFetch('/me/drive')
    if (!res.ok) {
      return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) }
    }
    const j = await res.json()
    return {
      ok: true,
      name: j?.name,
      owner: j?.owner?.user?.displayName,
      quota: j?.quota,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}