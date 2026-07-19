import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { template as surveyInviteTemplate } from '../_shared/transactional-email-templates/site-survey-invite.tsx'

interface Recipient { email: string; name?: string }
interface Body {
  site_ids: string[]
  recipients: Recipient[]
  message?: string
  save_as_default?: boolean
  survey_base_url?: string
  expires_in_days?: number
  delivery_mode?: 'email' | 'link_only'
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
  const deliveryMode: 'email' | 'link_only' = body.delivery_mode === 'link_only' ? 'link_only' : 'email'

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

  // Resolve public base URL: app_settings first, then request override, then request origin.
  // Preview/editor origins (id-preview--…lovable.app) require Lovable login for external
  // recipients, so we always prefer the published domain configured by the admin.
  const { data: settingsRow } = await admin
    .from('app_settings')
    .select('public_app_base_url')
    .limit(1)
    .maybeSingle()
  const settingsBase = (settingsRow?.public_app_base_url ?? '').trim().replace(/\/$/, '')
  const requestBase = (body.survey_base_url ?? '').trim().replace(/\/$/, '')
  const originBase = (req.headers.get('origin') ?? '').trim().replace(/\/$/, '')
  const isPreviewHost = (u: string) => /(^|\/\/)(id-preview--|preview--)/i.test(u)
  const baseUrl =
    settingsBase ||
    (requestBase && !isPreviewHost(requestBase) ? requestBase : '') ||
    (originBase && !isPreviewHost(originBase) ? originBase : '')

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

      // Link-only mode: create the token but skip email delivery so the caller
      // can share it manually (WhatsApp / SMS / hand-off).
      if (deliveryMode === 'link_only') {
        if (body.save_as_default && !site.surveyor_email) {
          await admin.from('sites').update({ surveyor_email: r.email }).eq('id', site.id)
        }
        results.push({
          site_id: site.id, site_name: site.site_name, email: r.email,
          ok: true, email_sent: false, survey_id: survey.id, survey_url: surveyUrl,
          expires_at: survey.expires_at,
        })
        continue
      }

      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
      const outlookKey = Deno.env.get('MICROSOFT_OUTLOOK_API_KEY')
      const expiresLabel = new Date(survey.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      const htmlBody = await renderAsync(
        React.createElement(surveyInviteTemplate.component, {
          recipientName: r.name,
          senderName,
          companyName: 'EcoPower UK',
          siteName: site.site_name,
          postcode: site.postcode ?? undefined,
          message: body.message,
          surveyUrl,
          expiresAt: expiresLabel,
        })
      )

      let sendOk = false
      let sendErr = ''
      if (!lovableApiKey || !outlookKey) {
        sendErr = 'Outlook connector not configured'
      } else {
        const outlookRes = await fetch('https://connector-gateway.lovable.dev/microsoft_outlook/me/sendMail', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            'X-Connection-Api-Key': outlookKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              subject: `Site survey — ${site.site_name}`,
              body: { contentType: 'HTML', content: htmlBody },
              toRecipients: [{ emailAddress: { address: r.email } }],
            },
            saveToSentItems: true,
          }),
        })
        if (outlookRes.ok) {
          sendOk = true
        } else {
          sendErr = `[${outlookRes.status}] ${(await outlookRes.text()).slice(0, 200)}`
        }
      }

      if (!sendOk) {
        // Keep the survey row so the link is still usable — caller can share manually.
        results.push({
          site_id: site.id, site_name: site.site_name, email: r.email,
          ok: true, email_sent: false, survey_id: survey.id, survey_url: surveyUrl,
          expires_at: survey.expires_at, error: `email failed: ${sendErr}`,
        })
        continue
      }

      // Optionally save recipient email as site default
      if (body.save_as_default && !site.surveyor_email) {
        await admin.from('sites').update({ surveyor_email: r.email }).eq('id', site.id)
      }

      results.push({
        site_id: site.id, site_name: site.site_name, email: r.email,
        ok: true, email_sent: true, survey_id: survey.id, survey_url: surveyUrl,
        expires_at: survey.expires_at,
      })
    }
  }

  return json({
    success: true,
    delivery_mode: deliveryMode,
    sent: results.filter(r => r.ok && r.email_sent).length,
    generated: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
  })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}