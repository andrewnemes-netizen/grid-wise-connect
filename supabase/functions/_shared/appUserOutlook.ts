// Helper for calling the Lovable App User Connector gateway for microsoft_outlook.
// Signs a per-user connection token (HS256 JWT) with APP_USER_CONNECTION_KEY_SECRET
// so gateway requests are authenticated as the individual signed-in app user.
//
// Contract (reverse-engineered against connector-gateway.lovable.dev):
//   Authorization: Bearer <LOVABLE_API_KEY>
//   X-Client-Api-Key: <MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY>
//   X-Connection-Api-Key: HS256 JWT{ app_user_id, connector_id, iat, exp }
//     signed with APP_USER_CONNECTION_KEY_SECRET.
//
// If the credential does not exist (user has not completed OAuth yet) the
// gateway returns HTTP 401 "Credential not found" — callers should treat that
// as "not connected" and fall back to the shared connector.

const GATEWAY_ROOT = 'https://connector-gateway.lovable.dev'
const CONNECTOR_ID = 'microsoft_outlook'

/**
 * Only Microsoft accounts whose primary email/UPN ends in this domain are
 * allowed to end up connected as an app-user Outlook mailbox. The Entra app is
 * temporarily registered as multi-tenant (workaround for Lovable's App User
 * Connector gateway not passing tenant= for single-tenant apps — AADSTS50194),
 * so we enforce the tenant restriction ourselves here.
 */
const ALLOWED_EMAIL_DOMAIN = 'ecopoweruk.com'

export const DEFAULT_OUTLOOK_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/User.Read',
]

function b64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function signJwtHs256(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const p1 = b64url(JSON.stringify(header))
  const p2 = b64url(JSON.stringify(payload))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${p1}.${p2}`)),
  )
  return `${p1}.${p2}.${b64url(sig)}`
}

function need(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`${name} is not configured`)
  return v
}

export async function appUserConnectionToken(appUserId: string): Promise<string> {
  const secret = need('APP_USER_CONNECTION_KEY_SECRET')
  const now = Math.floor(Date.now() / 1000)
  return signJwtHs256(
    { app_user_id: appUserId, connector_id: CONNECTOR_ID, iat: now, exp: now + 300 },
    secret,
  )
}

/**
 * Fetch /me from the Microsoft Graph via the connector gateway for the given
 * app user. Returns the identifying email (userPrincipalName / mail) if the
 * credential exists, or null if the gateway rejected the call (401 "Credential
 * not found" ⇒ user has not connected yet).
 */
async function fetchAppUserMe(appUserId: string): Promise<{ status: number; body: any | null }> {
  const lovableKey = need('LOVABLE_API_KEY')
  const clientKey = need('MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY')
  const connKey = await appUserConnectionToken(appUserId)
  const res = await fetch(`${GATEWAY_ROOT}/${CONNECTOR_ID}/me`, {
    headers: baseHeaders(clientKey, lovableKey, connKey),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`Outlook /me failed [${res.status}]: ${text.slice(0, 300)}`)
    return { status: res.status, body: null }
  }
  try { return { status: res.status, body: JSON.parse(text) } }
  catch { return { status: res.status, body: null } }
}

export type TenantCheck =
  | { ok: true; email: string }
  | { ok: false; reason: 'not_connected' | 'wrong_tenant' | 'unknown'; email?: string; status?: number }

/**
 * Verify that the connected Microsoft account for `appUserId` belongs to the
 * allowed tenant/domain (ecopoweruk.com). Reads userPrincipalName/mail from
 * Microsoft Graph — the gateway exposes /me but does not surface tenant id in
 * the response body, so we key off the primary email domain, which for an
 * Entra work account matches the tenant's verified domain.
 */
export async function verifyAppUserTenant(appUserId: string): Promise<TenantCheck> {
  const me = await fetchAppUserMe(appUserId)
  if (!me.body) {
    return {
      ok: false,
      reason: me.status === 401 ? 'not_connected' : 'unknown',
      status: me.status,
    }
  }
  const email: string =
    (me.body.userPrincipalName as string) ||
    (me.body.mail as string) ||
    ''
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  if (domain === ALLOWED_EMAIL_DOMAIN) return { ok: true, email }
  return { ok: false, reason: 'wrong_tenant', email, status: me.status }
}

function baseHeaders(clientKey: string, lovableKey: string, connKey: string) {
  return {
    Authorization: `Bearer ${lovableKey}`,
    'X-Client-Api-Key': clientKey,
    'X-Connection-Api-Key': connKey,
  } as Record<string, string>
}

export interface StartAuthArgs {
  appUserId: string
  returnUrl: string
  scopes?: string[]
}

export async function startAppUserOAuth(args: StartAuthArgs): Promise<{
  authorization_url: string
  session_id?: string
}> {
  const lovableKey = need('LOVABLE_API_KEY')
  const clientKey = need('MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY')
  const res = await fetch(`${GATEWAY_ROOT}/api/v1/app-users/oauth2/authorize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Client-Api-Key': clientKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      connector_id: CONNECTOR_ID,
      app_user_id: args.appUserId,
      return_url: args.returnUrl,
      credentials_configuration: {
        scopes: args.scopes ?? DEFAULT_OUTLOOK_SCOPES,
      },
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`app-user oauth2/authorize failed [${res.status}]: ${text}`)
  }
  try { return JSON.parse(text) } catch { throw new Error(`Bad JSON from oauth2/authorize: ${text}`) }
}

export async function isAppUserConnected(appUserId: string): Promise<boolean> {
  const check = await appUserConnectionCheck(appUserId)
  return check.ok
}

/**
 * Full connection check: returns detailed status so callers/UI can distinguish
 * "not connected" from "connected but wrong tenant". A wrong-tenant credential
 * is treated as NOT connected everywhere in the app.
 */
export async function appUserConnectionCheck(appUserId: string): Promise<TenantCheck> {
  try {
    return await verifyAppUserTenant(appUserId)
  } catch (e) {
    console.error('Outlook app-user status error:', e instanceof Error ? e.message : String(e))
    return { ok: false, reason: 'unknown' }
  }
}

export type SendMailAsUserResult =
  | { ok: true }
  | { ok: false; notConnected: boolean; status: number; error: string }

export async function sendMailAsAppUser(
  appUserId: string,
  message: Record<string, unknown>,
  opts: { saveToSentItems?: boolean } = {},
): Promise<SendMailAsUserResult> {
  let lovableKey: string, clientKey: string, connKey: string
  try {
    lovableKey = need('LOVABLE_API_KEY')
    clientKey = need('MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY')
    connKey = await appUserConnectionToken(appUserId)
  } catch (e) {
    return {
      ok: false,
      notConnected: true,
      status: 0,
      error: e instanceof Error ? e.message : String(e),
    }
  }
  // Defensive tenant check right before the send — a credential might have
  // been established before this gate existed, or the account swapped after.
  const check = await verifyAppUserTenant(appUserId)
  if (!check.ok) {
    if (check.reason === 'wrong_tenant') {
      return {
        ok: false,
        notConnected: true,
        status: 403,
        error: `wrong_tenant: only ${ALLOWED_EMAIL_DOMAIN} accounts can be connected (got ${check.email || 'unknown'})`,
      }
    }
    return {
      ok: false,
      notConnected: check.reason === 'not_connected',
      status: check.status ?? 0,
      error: check.reason,
    }
  }
  const res = await fetch(`${GATEWAY_ROOT}/${CONNECTOR_ID}/me/sendMail`, {
    method: 'POST',
    headers: { ...baseHeaders(clientKey, lovableKey, connKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      saveToSentItems: opts.saveToSentItems ?? true,
    }),
  })
  if (res.ok) return { ok: true }
  const errText = await res.text()
  // 401 "Credential not found" ⇒ user has not connected their Outlook yet
  const notConnected =
    res.status === 401 && /credential\s*not\s*found/i.test(errText)
  return { ok: false, notConnected, status: res.status, error: errText }
}