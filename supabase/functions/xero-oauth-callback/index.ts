import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import {
  adminClient,
  exchangeCodeForTokens,
  XERO_CONNECTIONS_URL,
} from '../_shared/xero.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  const appUrl = Deno.env.get('APP_PUBLIC_URL') || 'https://ecopoweruk.com'
  const finish = (params: Record<string, string>) => {
    const target = new URL(appUrl + '/admin')
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v)
    return Response.redirect(target.toString(), 302)
  }

  if (errorParam) return finish({ xero: 'error', reason: errorParam })
  if (!code || !stateRaw) return finish({ xero: 'error', reason: 'missing_code' })

  let uid: string | null = null
  try {
    const parsed = JSON.parse(atob(stateRaw))
    uid = parsed.uid ?? null
  } catch {
    return finish({ xero: 'error', reason: 'bad_state' })
  }

  try {
    const tokens = await exchangeCodeForTokens(code)

    // Fetch tenants
    const connRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: 'application/json',
      },
    })
    const connBody = await connRes.text()
    if (!connRes.ok) throw new Error(`Xero /connections failed [${connRes.status}]: ${connBody}`)
    const tenants = JSON.parse(connBody) as Array<{ tenantId: string; tenantName: string }>
    if (!tenants.length) throw new Error('No Xero organisation authorised')
    const tenant = tenants[0]

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    const admin = adminClient()

    // Single-row: delete existing then insert
    await admin.from('xero_connection').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error } = await admin.from('xero_connection').insert({
      tenant_id: tenant.tenantId,
      tenant_name: tenant.tenantName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scopes: tokens.scope ?? null,
      connected_by: uid,
    })
    if (error) throw error

    return finish({ xero: 'connected', tenant: tenant.tenantName })
  } catch (e) {
    console.error('xero-oauth-callback error:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return finish({ xero: 'error', reason: msg.slice(0, 200) })
  }
})