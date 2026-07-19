import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { mirrorToOneDrive } from '../_shared/onedrive.ts'

interface Body {
  token: string
  response_id: string
  pdf_url?: string
  pdf_storage_path?: string
  submitter_name?: string
  submitter_email?: string
  overall_status?: string
  app_base_url?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.token || !body.response_id) return json({ error: 'token and response_id required' }, 400)

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: survey } = await admin
    .from('site_surveys')
    .select('id, site_id, org_id, sent_by, sent_to_name')
    .eq('token', body.token)
    .maybeSingle()
  if (!survey) return json({ error: 'Survey not found' }, 404)

  // Persist pdf_storage_path so the app-origin proxy can stream the PDF without
  // hitting the ad-blocker-prone supabase.co host.
  if (body.pdf_storage_path) {
    await admin
      .from('site_survey_responses')
      .update({ pdf_storage_path: body.pdf_storage_path })
      .eq('id', body.response_id)
  }

  const { data: site } = await admin
    .from('sites').select('id, site_name, postcode, org_id').eq('id', survey.site_id).maybeSingle()
  const { data: owner } = await admin
    .from('profiles').select('email, display_name, full_name').eq('id', survey.sent_by).maybeSingle()

  // Register submitted photos into site_photos so they surface in WP Photos tab.
  try {
    const { data: response } = await admin
      .from('site_survey_responses')
      .select('id, submission, submitted_at')
      .eq('id', body.response_id)
      .maybeSingle()
    const groups = (response?.submission as any)?._photo_groups as
      | Array<{ key?: string; title?: string; photos?: Array<{ url?: string; caption?: string }> }>
      | undefined
    if (response && Array.isArray(groups) && groups.length > 0) {
      // Resolve an active WP for the site (first non-archived membership)
      const { data: memberships } = await admin
        .from('wp_sites')
        .select('work_package_id, work_packages!inner(id, status)')
        .eq('site_id', survey.site_id)
      const activeWp = (memberships ?? []).find((m: any) => {
        const s = String(m.work_packages?.status ?? '').toUpperCase()
        return s && s !== 'ARCHIVED' && s !== 'CANCELLED'
      }) ?? (memberships ?? [])[0]
      const workPackageId = activeWp?.work_package_id ?? null
      const orgId = survey.org_id ?? site?.org_id ?? null

      if (orgId) {
        // Idempotency: skip if already registered for this response
        const { data: existing } = await admin
          .from('site_photos')
          .select('id')
          .eq('site_survey_response_id', response.id)
          .limit(1)
        if (!existing || existing.length === 0) {
          const rows: any[] = []
          for (const g of groups) {
            for (const p of g.photos ?? []) {
              if (!p?.url) continue
              const parts = [g.title ?? g.key, p.caption].filter(Boolean)
              rows.push({
                org_id: orgId,
                work_package_id: workPackageId,
                site_id: survey.site_id,
                photo_url: p.url,
                caption: parts.join(' — ') || null,
                tags: g.key ? [g.key] : null,
                taken_at: response.submitted_at ?? new Date().toISOString(),
                source: 'site_survey',
                site_survey_response_id: response.id,
                created_by: survey.sent_by ?? null,
              })
            }
          }
          if (rows.length > 0) {
            const { error: insErr } = await admin.from('site_photos').insert(rows)
            if (insErr) console.warn('site_photos insert failed:', insErr.message)
          }
        }
      }
    }
  } catch (e) {
    console.warn('site_photos registration failed:', e instanceof Error ? e.message : e)
  }

  // Best-effort mirror survey PDF to OneDrive
  if (body.pdf_storage_path) {
    try {
      const { data: blob } = await admin.storage
        .from('site-surveys')
        .download(body.pdf_storage_path)
      if (blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const siteName = site?.site_name || 'Site'
        await mirrorToOneDrive(admin, {
          entity_type: 'survey',
          entity_id: survey.id,
          category: 'survey',
          filename: `${siteName.replace(/[^a-z0-9-_ ]/gi, '_')} - survey ${new Date().toISOString().slice(0,10)}.pdf`,
          bytes,
          contentType: 'application/pdf',
          folder_segments: ['Sites', siteName, 'Surveys'],
          created_by: survey.sent_by ?? null,
        })
      }
    } catch (e) {
      console.warn('OneDrive mirror (survey) failed:', e instanceof Error ? e.message : e)
    }
  }

  if (!owner?.email) return json({ ok: true, skipped: 'no owner email' })

  const baseUrl = (body.app_base_url ?? '').replace(/\/$/, '')
  const siteUrl = baseUrl ? `${baseUrl}/site/${survey.site_id}` : undefined

  const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      templateName: 'site-survey-submitted',
      recipientEmail: owner.email,
      idempotencyKey: `site-survey-submitted-${body.response_id}`,
      templateData: {
        recipientName: owner.display_name ?? owner.full_name ?? undefined,
        siteName: site?.site_name,
        postcode: site?.postcode ?? undefined,
        submitterName: body.submitter_name,
        submitterEmail: body.submitter_email,
        overallStatus: body.overall_status,
        submittedAt: new Date().toLocaleString('en-GB'),
        pdfUrl: body.pdf_url,
        siteUrl,
      },
    }),
  })

  if (!sendRes.ok) {
    const errText = await sendRes.text()
    console.error('notify email failed', sendRes.status, errText)
    return json({ ok: false, error: errText }, 502)
  }

  return json({ ok: true })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}