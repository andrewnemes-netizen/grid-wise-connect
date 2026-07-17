// Intelligence Summary — AI-generated exec summary for KPI snapshots.
// Accepts { context: 'executive' | 'client_monthly', kpis: object, meta?: object }
// Returns { summary: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import { generateText } from "npm:ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const auth = req.headers.get("authorization") || "";
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { context, kpis, meta } = await req.json();
    if (!context || !kpis) {
      return new Response(JSON.stringify({ error: "context and kpis required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
    const system =
      context === "client_monthly"
        ? `You are a senior programme director writing the executive summary of a monthly client report for a UK EV infrastructure deployment. Tone: confident, factual, plain English, no jargon. Length: 4-6 sentences. Cover: overall RAG, headline deliveries, biggest risk driver, next-month outlook.`
        : `You are the MD's morning briefing. Tone: direct, decision-oriented, plain English. Length: 4-6 short bullets or sentences. Cover: business health signal, biggest risk, biggest win, one recommended action.`;

    const prompt = `Data (JSON):\n${JSON.stringify({ kpis, meta }, null, 2)}\n\nWrite the summary now.`;

    const { text } = await generateText({
      model: gateway("google/gemini-3.5-flash"),
      system,
      prompt,
    });

    return new Response(JSON.stringify({ summary: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("intelligence-summary error", e);
    const msg = e?.message ?? String(e);
    const status = /rate|429/i.test(msg) ? 429 : /402|credit/i.test(msg) ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
