import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface Recipient { email: string; name?: string }
interface Body {
  site_ids: string[]
  recipients: Recipient[]
  message?: string
  save_as_default?: boolean
  survey_base_url?: string
  expires_in_days?: number
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)
  const userId = userData.user.id

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  if (!Array.isArray(body.site_ids) || body.site_ids.length === 0) {
    return json({ error: 'site_ids required' }, 400)
  }
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return json({ error: 'recipients required' }, 400)
  }
  const validRecipients = body.recipients.filter((r) => r?.email && emailRe.test(r.email))
  if (validRecipients.length === 0) return json({ error: 'No valid recipient emails' }, 400)

  const admin = createClient(supabaseUrl, serviceKey)

  // Load sites (respect RLS via user client)
  const { data: sites, error: sitesErr } = await userClient
    .from('sites')
    .select('id, site_name, postcode, org_id, surveyor_email')
    .in('id', body.site_ids)
  if (sitesErr) return json({ error: 'Failed to load sites', details: sitesErr.message }, 500)
  if (!sites || sites.length === 0) return json({ error: 'No accessible sites found' }, 404)

  // Sender profile
  const { data: profile } = await admin
    .from('profiles').select('display_name, full_name, email').eq('id', userId).maybeSingle()
  const senderName = profile?.display_name ?? profile?.full_name ?? undefined

  const expiresDays = Math.max(1, Math.min(180, body.expires_in_days ?? 30))
  const expiresAt = new Date(Date.now() + expiresDays * 86400_000)
  const baseUrl = (body.survey_base_url ?? '').replace(/\/$/, '')

  const results: any[] = []

  for (const site of sites) {
    for (const r of validRecipients) {
      // Insert survey record
      const { data: survey, error: sErr } = await admin
        .from('site_surveys')
        .insert({
          site_id: site.id,
          org_id: site.org_id,
          sent_to_email: r.email,
          sent_to_name: r.name ?? null,
          sent_by: userId,
          message: body.message ?? null,
          expires_at: expiresAt.toISOString(),
        })
        .select('id, token, expires_at')
        .single()

      if (sErr || !survey) {
        results.push({ site_id: site.id, email: r.email, ok: false, error: sErr?.message })
        continue
      }

      const surveyUrl = baseUrl ? `${baseUrl}/survey/${survey.token}` : `/survey/${survey.token}`

      const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: 'site-survey-invite',
          recipientEmail: r.email,
          idempotencyKey: `site-survey-invite-${survey.id}`,
          templateData: {
            recipientName: r.name,
            senderName,
            companyName: 'EcoPower UK',
            siteName: site.site_name,
            postcode: site.postcode ?? undefined,
            message: body.message,
            surveyUrl,
            expiresAt: new Date(survey.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
          },
        }),
      })

      if (!sendRes.ok) {
        const errText = await sendRes.text()
        await admin.from('site_surveys').update({ status: 'cancelled' }).eq('id', survey.id)
        results.push({ site_id: site.id, email: r.email, ok: false, error: `email failed: ${errText}` })
        continue
      }

      // Optionally save recipient email as site default
      if (body.save_as_default && !site.surveyor_email) {
        await admin.from('sites').update({ surveyor_email: r.email }).eq('id', site.id)
      }

      results.push({ site_id: site.id, email: r.email, ok: true, survey_id: survey.id, survey_url: surveyUrl })
    }
  }

  return json({ success: true, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}