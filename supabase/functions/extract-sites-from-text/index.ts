import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CORS = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * POST { text: string, filename?: string }
 * → { csv: string, rows: number, columns: string[], model: string }
 *
 * Uses Lovable AI (Gemini 2.5 Flash) to convert unstructured site-list text
 * (from a PDF or DOCX) into a Gridwise-canonical CSV that the existing
 * import-wizard 'paste' path can consume unchanged.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Server not configured" }, 500);
  if (!lovableKey) return json({ error: "LOVABLE_API_KEY missing on server" }, 500);

  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

  let body: { text?: string; filename?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const text = (body.text ?? "").trim();
  if (!text) return json({ error: "text is required" }, 400);
  if (text.length > 400_000) return json({ error: "Document too large (max ~400KB of text)" }, 400);

  const system = `You are an EV charging site-list extractor. Given raw text scraped from a PDF or DOCX, extract the individual site rows and return ONLY a CSV.

The CSV MUST have a header row and use exactly these column names when the data is present:
site_name,address,postcode,uprn,lat,lng,client_ref,charger_type,proposed_kw,socket_count,dno,lpa,notes

Rules:
- Return CSV only. No prose, no code fences, no explanations.
- Omit columns that never appear in the source; keep headers stable for the ones you include.
- site_name is mandatory for every row; if the source has no name, skip that row.
- Numbers must be plain (e.g. 22, not "22kW"). Put units and any qualifier in notes.
- Postcodes must be UK-style; if a value is not a valid postcode, leave the cell blank and put the raw string in notes.
- One CSV row per site. Do not repeat header rows.
- Do not invent data. If a field is unknown, leave the cell blank.
- If the document is not a site list, return only the header row.`;

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Filename: ${body.filename ?? "(unknown)"}\n\n--- BEGIN DOCUMENT TEXT ---\n${text}\n--- END DOCUMENT TEXT ---`,
        },
      ],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error(`AI gateway ${aiRes.status}: ${errText}`);
    return json({ error: "AI extraction failed", status: aiRes.status, details: errText }, aiRes.status);
  }
  const aiJson = await aiRes.json();
  let csv: string = aiJson?.choices?.[0]?.message?.content ?? "";
  csv = csv.trim();
  // Strip ```csv fences if the model added them despite instructions.
  csv = csv.replace(/^```(?:csv)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!csv || !csv.includes("\n")) {
    return json({ error: "AI returned no rows", raw: csv }, 422);
  }
  const firstLine = csv.split(/\r?\n/, 1)[0];
  const columns = firstLine.split(",").map((s) => s.trim());
  const rowCount = csv.split(/\r?\n/).filter((l) => l.trim()).length - 1;
  return json({ csv, rows: rowCount, columns, model: "google/gemini-2.5-flash" });
});