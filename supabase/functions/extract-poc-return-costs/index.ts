// Extracts rate line items from a submitted POC designer return by feeding the
// client-side-parsed content (PDF text or XLSX rows) to the Lovable AI Gateway.
// Writes results to the poc_designer_return_lines staging table only —
// never to real rate_items.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { generateText, Output } from 'npm:ai@^5'
import { z } from 'npm:zod@^3'
import { createLovableAiGatewayProvider } from '../_shared/ai-gateway.ts'

interface Body { return_id: string }

const LineSchema = z.object({
  lines: z.array(z.object({
    rate_code: z.string().nullable(),
    description: z.string(),
    designer_cost: z.number().nullable(),
    extraction_confidence: z.number().nullable(),
  })),
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const lovableKey = Deno.env.get('LOVABLE_API_KEY')
  if (!lovableKey) return json({ error: 'LOVABLE_API_KEY missing' }, 500)

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Unauthorized' }, 401)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id)
  if (!(roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'engineer')) {
    return json({ error: 'Forbidden — staff only' }, 403)
  }

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.return_id) return json({ error: 'return_id required' }, 400)

  const { data: files, error: fErr } = await admin
    .from('poc_designer_return_files')
    .select('id, file_type, original_filename, parsed_content')
    .eq('return_id', body.return_id)
  if (fErr) return json({ error: fErr.message }, 500)
  if (!files || files.length === 0) return json({ error: 'No files for this return' }, 404)

  const gateway = createLovableAiGatewayProvider(lovableKey, { structuredOutputs: false })
  const model = gateway('google/gemini-3.6-flash')

  const allExtracted: Array<{
    rate_code: string | null; description: string; designer_cost: number | null;
    extraction_confidence: number | null; source_file_id: string;
  }> = []

  for (const f of files as any[]) {
    const contentPreview = (() => {
      if (!f.parsed_content) return ''
      if (f.file_type === 'pdf') return String(f.parsed_content).slice(0, 60_000)
      // xlsx: rows as JSON
      try { return JSON.stringify(f.parsed_content).slice(0, 60_000) } catch { return '' }
    })()
    if (!contentPreview) continue

    const prompt = `You are extracting cost line items from a designer's POC submission.
File: ${f.original_filename} (${f.file_type})

Content:
"""
${contentPreview}
"""

Return an array of rate line items. Each item must have:
- rate_code (short SOR-style code if present; otherwise null)
- description (the human-readable description)
- designer_cost (the numeric £ cost for that line, or null if not clearly a cost)
- extraction_confidence (0.0 to 1.0)

Only include lines that are clearly rate/cost items. Skip totals, VAT rows, page headers.
If the designer didn't follow the ICP SOR layout exactly, still infer the code/description/cost columns.`

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: LineSchema }),
        prompt,
      })
      for (const l of output.lines) {
        allExtracted.push({
          rate_code: l.rate_code ?? null,
          description: l.description,
          designer_cost: l.designer_cost ?? null,
          extraction_confidence: l.extraction_confidence ?? null,
          source_file_id: f.id,
        })
      }
    } catch (e) {
      console.error('AI extraction failed for file', f.id, e instanceof Error ? e.message : String(e))
    }
  }

  if (allExtracted.length === 0) {
    return json({ ok: true, inserted: 0, warning: 'No lines could be extracted' })
  }

  // Replace any existing unreviewed lines for this return, keep reviewed ones.
  await admin.from('poc_designer_return_lines')
    .delete().eq('return_id', body.return_id).eq('reviewed', false)

  const rows = allExtracted.map(l => ({ return_id: body.return_id, ...l }))
  const { error: insErr } = await admin.from('poc_designer_return_lines').insert(rows)
  if (insErr) return json({ error: insErr.message }, 500)

  return json({ ok: true, inserted: rows.length })
})