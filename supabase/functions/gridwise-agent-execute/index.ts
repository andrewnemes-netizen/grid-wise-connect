// Executes an approved Gridwise Assistant write action as the signed-in user.
// The client calls this ONLY after the user clicks Approve on a proposal card.
// All writes run through a Supabase client bound to the caller's JWT — RLS
// enforces that the caller could have performed the same write in the UI.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  executeWriteTool,
  previewFor,
  WRITE_TOOL_NAMES,
  type WriteToolName,
} from "../_shared/agent-write-tools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null) as
      | { tool?: string; input?: unknown; tool_call_id?: string; thread_id?: string; decision?: "approve" | "reject" }
      | null;
    if (!body?.tool || !body.decision) return json({ error: "tool and decision required" }, 400);
    if (!WRITE_TOOL_NAMES.includes(body.tool as WriteToolName)) {
      return json({ error: `Unknown tool: ${body.tool}` }, 400);
    }
    const tool = body.tool as WriteToolName;
    const started = Date.now();
    const preview = previewFor(tool, body.input);

    // Always log the proposal outcome
    async function log(status: "rejected" | "executed" | "error", extra: { result_summary?: string; error_message?: string; record_ids?: string[] } = {}) {
      await supabase.from("assistant_tool_calls").insert({
        thread_id: body?.thread_id ?? null,
        user_id: userId,
        tool_name: tool,
        params: body?.input ?? null,
        tool_call_id: body?.tool_call_id ?? null,
        preview,
        status,
        result_summary: extra.result_summary ?? null,
        error_message: extra.error_message ?? null,
        record_ids: extra.record_ids ?? null,
        execution_ms: Date.now() - started,
        executed_at: status === "executed" ? new Date().toISOString() : null,
      });
    }

    if (body.decision === "reject") {
      await log("rejected");
      return json({ ok: true, decision: "reject", output: { rejected: true, message: "User declined the action." } });
    }

    // decision === approve → execute
    const outcome = await executeWriteTool(supabase, tool, body.input);
    if (!outcome.ok) {
      await log("error", { error_message: outcome.error });
      return json({ ok: false, decision: "approve", error: outcome.error, output: { error: outcome.error } }, 200);
    }
    await log("executed", { result_summary: preview.slice(0, 500) });
    return json({ ok: true, decision: "approve", output: outcome.result });
  } catch (e) {
    console.error("gridwise-agent-execute error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}