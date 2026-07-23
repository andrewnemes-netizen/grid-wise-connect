import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { startAppUserOAuth, DEFAULT_OUTLOOK_SCOPES } from '../_shared/appUserOutlook.ts'

interface Body {
  return_url: string
  scopes?: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  if (!body.return_url || typeof body.return_url !== 'string') {
    return json({ error: 'return_url required' }, 400)
  }
  try {
    const u = new URL(body.return_url)
    if (!/^https?:$/.test(u.protocol)) return json({ error: 'invalid return_url' }, 400)
  } catch {
    return json({ error: 'invalid return_url' }, 400)
  }

  try {
    const result = await startAppUserOAuth({
      appUserId: userData.user.id,
      returnUrl: body.return_url,
      scopes: Array.isArray(body.scopes) && body.scopes.length > 0 ? body.scopes : DEFAULT_OUTLOOK_SCOPES,
    })
    return json({ authorization_url: result.authorization_url, session_id: result.session_id ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('outlook-connect-start failed:', msg)
    return json({ error: 'Failed to start Outlook OAuth', details: msg }, 500)
  }
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}