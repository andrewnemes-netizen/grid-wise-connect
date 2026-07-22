import { createClient } from "npm:@supabase/supabase-js@2";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "npm:ai@^7";
import { z } from "npm:zod@^3";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import {
  writeToolSchemas,
  writeToolDescriptions,
  WRITE_TOOL_NAMES,
  executeWriteTool,
  riskTierFor,
  previewFor,
  type WriteToolName,
} from "../_shared/agent-write-tools.ts";
import { getAgent, isSafeAutoExecute, type AgentId } from "../_shared/agent-registry.ts";
import { buildPreconReadTools } from "../_shared/agents/precon-tools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-lovable-aig-run-id",
};

const MODEL = "google/gemini-3.1-pro-preview";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const messages = body.messages as UIMessage[];
    const threadId: string | undefined = body.threadId;
    const agentId: AgentId = body.agentId ?? "general";
    const autoExecuteSafe: boolean = body.autoExecuteSafe ?? false;

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages required" }, 400);
    }
    if (!threadId) return json({ error: "threadId required" }, 400);

    // Confirm thread ownership and update agent context
    const { data: thread, error: threadErr } = await supabase
      .from("assistant_threads")
      .select("id, user_id, context_programme_id, context_wp_id, context_site_id, agent_id, auto_execute_safe")
      .eq("id", threadId)
      .maybeSingle();
    if (threadErr || !thread || thread.user_id !== userId) {
      return json({ error: "Thread not found" }, 404);
    }

    // Persist agent switch if changed
    if (thread.agent_id !== agentId || thread.auto_execute_safe !== autoExecuteSafe) {
      await supabase
        .from("assistant_threads")
        .update({ agent_id: agentId, auto_execute_safe: autoExecuteSafe })
        .eq("id", threadId);
    }

    const agent = getAgent(agentId);

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "AI gateway not configured" }, 500);

    const gateway = createLovableAiGatewayProvider(lovableKey);
    const model = gateway(MODEL);

    // Persist the last user message immediately
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      await supabase.from("assistant_messages").insert({
        thread_id: threadId,
        role: "user",
        parts: lastMsg.parts ?? [],
      });
    }

    // Build audit helper
    async function audit(toolName: string, params: unknown, startedAt: number, status: "ok" | "error", result: { summary?: string; ids?: string[]; error?: string }, mode: "auto_executed" | "approved" | "error") {
      await supabase.from("assistant_tool_calls").insert({
        thread_id: threadId,
        user_id: userId,
        agent_id: agentId,
        tool_name: toolName,
        params: params as any,
        result_summary: result.summary?.slice(0, 500) ?? null,
        record_ids: result.ids ?? null,
        status,
        execution_ms: Date.now() - startedAt,
        model: MODEL,
        error_message: result.error ?? null,
        execution_mode: mode,
        risk_tier: riskTierFor(toolName as WriteToolName),
      });
    }

    const contextLine = [
      thread.context_programme_id ? `Programme ${thread.context_programme_id}` : null,
      thread.context_wp_id ? `Work Package ${thread.context_wp_id}` : null,
      thread.context_site_id ? `Site ${thread.context_site_id}` : null,
    ].filter(Boolean).join(", ");

    const system = agent.systemPrompt + (contextLine ? `\n\nCurrent context: ${contextLine}.` : "");

    const tools: Record<string, any> = {};

    // Base read tools available to every agent
    tools.search_sites = tool({
      description: "Search the user's Gridwise sites by name, postcode, or client organisation. Returns up to 20 rows scoped by RLS.",
      inputSchema: z.object({
        query: z.string().describe("Case-insensitive substring for site name, postcode, or client org."),
        limit: z.number().int().optional().describe("Max rows, default 20, cap 50."),
      }),
      execute: async ({ query, limit }) => {
        const started = Date.now();
        const lim = Math.min(limit ?? 20, 50);
        const q = `%${query.trim()}%`;
        const { data, error } = await supabase
          .from("sites")
          .select("id, site_name, postcode, client_org, proposed_kw, status, score, viability_index, grid_readiness")
          .or(`site_name.ilike.${q},postcode.ilike.${q},client_org.ilike.${q}`)
          .order("updated_at", { ascending: false })
          .limit(lim);
        if (error) {
          await audit("search_sites", { query, limit: lim }, started, "error", { error: error.message }, "error");
          return { error: error.message };
        }
        const sites = data ?? [];
        await audit("search_sites", { query, limit: lim }, started, "ok", { summary: `Found ${sites.length} sites`, ids: sites.map((s) => s.id) }, "auto_executed");
        return {
          sites,
          sources: sites.map((s) => ({ table: "sites", id: s.id, url: `/site/${s.id}`, label: s.site_name })),
        };
      },
    });

    tools.get_site_details = tool({
      description: "Get full details for one Gridwise site by id, including the latest study id if one exists.",
      inputSchema: z.object({ site_id: z.string().uuid() }),
      execute: async ({ site_id }) => {
        const started = Date.now();
        const [siteRes, studyRes] = await Promise.all([
          supabase.from("sites").select("*").eq("id", site_id).maybeSingle(),
          supabase.from("studies").select("id, study_name, status, updated_at").eq("site_id", site_id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (siteRes.error || !siteRes.data) {
          await audit("get_site_details", { site_id }, started, "error", { error: siteRes.error?.message ?? "not found" }, "error");
          return { error: "Site not found or not accessible" };
        }
        await audit("get_site_details", { site_id }, started, "ok", { summary: siteRes.data.site_name, ids: [site_id] }, "auto_executed");
        return {
          site: siteRes.data,
          latest_study: studyRes.data ?? null,
          sources: [{ table: "sites", id: site_id, url: `/site/${site_id}`, label: siteRes.data.site_name }],
        };
      },
    });

    tools.get_site_feasibility = tool({
      description: "Return the stored feasibility / engine output for a site's latest study. Does NOT re-run any engineering engine. If no study exists, returns { needs_study: true }.",
      inputSchema: z.object({ site_id: z.string().uuid() }),
      execute: async ({ site_id }) => {
        const started = Date.now();
        const { data: study, error } = await supabase
          .from("studies")
          .select("id, study_name, status, dno, voltage_level, proposed_kw, ruleset_version, engine_output_json, cost_estimate_json, updated_at")
          .eq("site_id", site_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          await audit("get_site_feasibility", { site_id }, started, "error", { error: error.message }, "error");
          return { error: error.message };
        }
        if (!study) {
          await audit("get_site_feasibility", { site_id }, started, "ok", { summary: "needs_study" }, "auto_executed");
          return { needs_study: true, site_id, message: "No study run for this site yet. The user must run one from the Gridwise map or site page." };
        }
        await audit("get_site_feasibility", { site_id }, started, "ok", { summary: `study ${study.id}`, ids: [study.id] }, "auto_executed");
        return {
          study,
          sources: [{ table: "studies", id: study.id, url: `/study/${study.id}`, label: study.study_name }],
        };
      },
    });

    tools.search_programmes = tool({
      description: "Search delivery programmes by name or code. Returns id, name, code, dates, status, and target site count.",
      inputSchema: z.object({
        query: z.string().optional().describe("Optional substring match on name or code."),
        limit: z.number().int().optional(),
      }),
      execute: async ({ query, limit }) => {
        const started = Date.now();
        const lim = Math.min(limit ?? 20, 50);
        let q = supabase
          .from("programmes")
          .select("id, name, code, status, start_date, end_date, target_site_count")
          .order("updated_at", { ascending: false })
          .limit(lim);
        if (query?.trim()) {
          const s = `%${query.trim()}%`;
          q = q.or(`name.ilike.${s},code.ilike.${s}`);
        }
        const { data, error } = await q;
        if (error) {
          await audit("search_programmes", { query, limit: lim }, started, "error", { error: error.message }, "error");
          return { error: error.message };
        }
        const items = data ?? [];
        await audit("search_programmes", { query, limit: lim }, started, "ok", { summary: `Found ${items.length} programmes`, ids: items.map((p) => p.id) }, "auto_executed");
        return {
          programmes: items,
          sources: items.map((p) => ({ table: "programmes", id: p.id, url: `/delivery/programme/${p.id}`, label: p.name })),
        };
      },
    });

    tools.search_work_packages = tool({
      description: "Search work packages by name/code, optionally scoped to a programme. Returns id, name, code, programme_id, status.",
      inputSchema: z.object({
        query: z.string().optional(),
        programme_id: z.string().uuid().optional(),
        limit: z.number().int().optional(),
      }),
      execute: async ({ query, programme_id, limit }) => {
        const started = Date.now();
        const lim = Math.min(limit ?? 50, 200);
        let q = supabase
          .from("work_packages")
          .select("id, name, code, programme_id, status")
          .order("updated_at", { ascending: false })
          .limit(lim);
        if (programme_id) q = q.eq("programme_id", programme_id);
        if (query?.trim()) {
          const s = `%${query.trim()}%`;
          q = q.or(`name.ilike.${s},code.ilike.${s}`);
        }
        const { data, error } = await q;
        if (error) {
          await audit("search_work_packages", { query, programme_id, limit: lim }, started, "error", { error: error.message }, "error");
          return { error: error.message };
        }
        const items = data ?? [];
        await audit("search_work_packages", { query, programme_id, limit: lim }, started, "ok", { summary: `Found ${items.length} work packages`, ids: items.map((w) => w.id) }, "auto_executed");
        return {
          work_packages: items,
          sources: items.map((w) => ({ table: "work_packages", id: w.id, url: `/wp/${w.id}`, label: w.name })),
        };
      },
    });

    // Agent-specific read tools
    if (agentId === "precon") {
      const preconTools = buildPreconReadTools(supabase, userId, threadId);
      for (const [name, def] of Object.entries(preconTools)) {
        tools[name] = tool(def as any);
      }
    }

    // WRITE tools
    const agentWriteTools = new Set(agent.writeTools);
    for (const name of WRITE_TOOL_NAMES) {
      if (!agentWriteTools.has(name)) continue;

      if (autoExecuteSafe && isSafeAutoExecute(agent, name)) {
        // Safe + user enabled auto-execution → execute inline
        tools[name] = tool({
          description: writeToolDescriptions[name],
          inputSchema: writeToolSchemas[name],
          execute: async (input: unknown) => {
            const started = Date.now();
            const outcome = await executeWriteTool(supabase, name, input);
            if (!outcome.ok) {
              await audit(name, input, started, "error", { error: outcome.error }, "error");
              return { error: outcome.error, auto_executed: false };
            }
            await audit(name, input, started, "ok", { summary: previewFor(name, input), ids: recordIdsFromResult(outcome.result) }, "auto_executed");
            return { ...outcome.result, auto_executed: true };
          },
        });
      } else {
        // Non-safe or auto-execution disabled → proposal only
        tools[name] = tool({
          description: writeToolDescriptions[name],
          inputSchema: writeToolSchemas[name],
        });
      }
    }

    function recordIdsFromResult(result: any): string[] | undefined {
      if (!result) return undefined;
      if (result.sites) return result.sites.map((s: any) => s.site_id ?? s.id);
      if (result.site?.id) return [result.site.id];
      if (result.archive_id) return [result.archive_id];
      return undefined;
    }

    const modelMessages = await convertToModelMessages(messages);
    const result = streamText({
      model,
      system,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(20),
      onStepFinish: async ({ toolCalls }) => {
        try {
          for (const call of toolCalls ?? []) {
            if (WRITE_TOOL_NAMES.includes(call.toolName as any)) {
              await supabase.from("assistant_tool_calls").insert({
                thread_id: threadId,
                user_id: userId,
                agent_id: agentId,
                tool_name: call.toolName,
                tool_call_id: call.toolCallId,
                params: call.input as any,
                status: "proposed",
                model: MODEL,
                execution_mode: "proposed",
                risk_tier: riskTierFor(call.toolName as WriteToolName),
              });
            }
          }
        } catch (err) {
          console.error("proposal audit failed", err);
        }
      },
      onError: (err) => console.error("streamText error", err),
    });

    return result.toUIMessageStreamResponse({
      headers: corsHeaders,
      originalMessages: messages,
      onFinish: async ({ responseMessage }) => {
        try {
          if (responseMessage) {
            await supabase.from("assistant_messages").insert({
              thread_id: threadId,
              role: "assistant",
              parts: responseMessage.parts ?? [],
            });
          }
          await supabase.from("assistant_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        } catch (e) {
          console.error("Failed to persist assistant message", e);
        }
      },
    });
  } catch (e) {
    console.error("gridwise-assistant error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
