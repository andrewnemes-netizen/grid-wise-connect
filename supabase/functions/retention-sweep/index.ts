import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Retention sweep: hard-deletes archived entities whose retention_expires_at has passed.
// Invoked by pg_cron or manually. No user context required — uses cron shared secret.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Allow either service-role JWT (cron) or an authenticated admin caller.
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  const cronSecret = Deno.env.get('CRON_SECRET')
  const isCron = !!cronSecret && jwt === cronSecret

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (!isCron) {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    )
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ error: 'Unauthorized' }, 401)
    const { data: isAdmin } = await userClient.rpc('has_role', {
      _user_id: userData.user.id, _role: 'admin',
    })
    if (!isAdmin) return json({ error: 'Forbidden' }, 403)
  }

  const dryRun = new URL(req.url).searchParams.get('dry_run') === '1'

  const { data: expired, error } = await admin
    .from('deleted_entities')
    .select('id, entity_type, entity_id, retention_expires_at')
    .eq('status', 'archived')
    .lt('retention_expires_at', new Date().toISOString())
    .limit(500)
  if (error) return json({ error: 'Query failed', details: error.message }, 500)

  if (dryRun) return json({ ok: true, dry_run: true, would_purge: expired?.length ?? 0, sample: expired?.slice(0, 20) ?? [] })

  let purged = 0
  const failures: Array<{ id: string; error: string }> = []
  for (const row of expired ?? []) {
    const { error: pErr } = await admin.rpc('purge_entity', { _archive_id: row.id })
    if (pErr) failures.push({ id: row.id, error: pErr.message })
    else purged += 1
  }

  return json({ ok: true, purged, failed: failures.length, failures: failures.slice(0, 20) })
})

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}