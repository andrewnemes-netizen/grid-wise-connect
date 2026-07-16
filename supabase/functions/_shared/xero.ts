import { createClient } from 'npm:@supabase/supabase-js@2'

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
export const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'
export const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections'

export const XERO_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'email',
  'accounting.transactions',
  'accounting.contacts',
  'accounting.settings',
].join(' ')

export function getRedirectUri(): string {
  const url = Deno.env.get('SUPABASE_URL')!
  return `${url}/functions/v1/xero-oauth-callback`
}

export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

function basicAuthHeader(): string {
  const id = Deno.env.get('XERO_CLIENT_ID')!
  const secret = Deno.env.get('XERO_CLIENT_SECRET')!
  return 'Basic ' + btoa(`${id}:${secret}`)
}

export interface XeroConnectionRow {
  id: string
  tenant_id: string
  tenant_name: string | null
  access_token: string
  refresh_token: string
  expires_at: string
  scopes: string | null
}

export async function loadConnection(): Promise<XeroConnectionRow | null> {
  const admin = adminClient()
  const { data } = await admin
    .from('xero_connection')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as XeroConnectionRow) ?? null
}

async function refreshTokens(row: XeroConnectionRow): Promise<XeroConnectionRow> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    }),
  })
  const body = await res.text()
  if (!res.ok) {
    throw new Error(`Xero token refresh failed [${res.status}]: ${body}`)
  }
  const parsed = JSON.parse(body) as {
    access_token: string
    refresh_token: string
    expires_in: number
    scope?: string
  }
  const expiresAt = new Date(Date.now() + parsed.expires_in * 1000).toISOString()
  const admin = adminClient()
  const { data, error } = await admin
    .from('xero_connection')
    .update({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_at: expiresAt,
      scopes: parsed.scope ?? row.scopes,
    })
    .eq('id', row.id)
    .select('*')
    .single()
  if (error) throw error
  return data as XeroConnectionRow
}

export async function getValidConnection(): Promise<XeroConnectionRow> {
  const row = await loadConnection()
  if (!row) throw new Error('Xero is not connected')
  const expires = new Date(row.expires_at).getTime()
  if (expires - Date.now() < 60_000) {
    return await refreshTokens(row)
  }
  return row
}

export async function xeroFetch(
  path: string,
  init: RequestInit = {},
  connection?: XeroConnectionRow,
): Promise<Response> {
  let conn = connection ?? (await getValidConnection())
  const url = path.startsWith('http') ? path : `${XERO_API_BASE}${path}`
  const doFetch = (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Xero-Tenant-Id': conn.tenant_id,
        Accept: 'application/json',
      },
    })
  let res = await doFetch(conn.access_token)
  if (res.status === 401) {
    conn = await refreshTokens(conn)
    res = await doFetch(conn.access_token)
  }
  return res
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
}> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
    }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Xero token exchange failed [${res.status}]: ${body}`)
  return JSON.parse(body)
}