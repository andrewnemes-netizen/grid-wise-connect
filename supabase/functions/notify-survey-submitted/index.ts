import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface Body {
  token: string
  response_id: string
  pdf_url?: string
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
    .select('id, site_id, sent_by, sent_to_name')
    .eq('token', body.token)
    .maybeSingle()
  if (!survey) return json({ error: 'Survey not found' }, 404)

  const { data: site } = await admin
    .from('sites').select('id, site_name, postcode').eq('id', survey.site_id).maybeSingle()
  const { data: owner } = await admin
    .from('profiles').select('email, display_name, full_name').eq('id', survey.sent_by).maybeSingle()

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