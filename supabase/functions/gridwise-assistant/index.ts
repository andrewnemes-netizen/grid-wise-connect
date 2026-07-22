import { createClient } from "npm:@supabase/supabase-js@2";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "npm:ai@^7";
import { z } from "npm:zod@^3";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import {
  writeToolSchemas,
  writeToolDescriptions,
  WRITE_TOOL_NAMES,
} from "../_shared/agent-write-tools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-lovable-aig-run-id",
};

const SYSTEM_PROMPT = `You are the Gridwise Assistant, an AI helper embedded in the Gridwise Connect platform — an EV grid-connection intelligence application for UK utility engineering.

RULES YOU MUST FOLLOW:
1. NEVER invent engineering results, DNO rules, cable specifications, voltage-drop numbers, fault levels, costs, rates, or margins.
2. When asked an engineering or commercial question, CALL A TOOL to get the verified answer from Gridwise. Do not compute from memory.
3. If a tool returns { needs_study: true }, tell the user which page in the app to run the study on. Never fabricate the result.
4. Cite every fact by including the id from the tool result. Sources are rendered automatically from tool outputs — you do not need to format them.
5. All data returned to you is already filtered by the user's permissions. Do not ask for user_id or org_id.
6. Be concise and precise. Use markdown lists and headings. Do not repeat tool JSON verbatim.
7. You CAN take actions using WRITE tools: mark_stage_done_bulk, add_sites_to_wp, remove_sites_from_wp, queue_survey_for_sites, update_site_fields, archive_site, archive_work_package, archive_programme, archive_work_packages_bulk, archive_programmes_bulk. Every write shows an Approve/Reject card to the user before it runs — you cannot bypass this.
8. Before proposing a write, gather the required IDs by calling read tools first (search_sites, search_programmes, get_site_details). Never guess UUIDs. If the user asks to archive/delete "all programmes" or "all work packages", first call search_programmes (with no query) to list them, then propose an archive_programmes_bulk / archive_work_packages_bulk with the real IDs.
9. Confirm phrases must be EXACT: remove_sites_from_wp → "remove N sites"; archive_programmes_bulk → "archive N programmes"; archive_work_packages_bulk → "archive N work packages". N is the array length. Ask the user for a reason string for any archive tool.
10. Do not chain more than 3 write proposals in one turn; wait for the user to review.`;

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

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages required" }, 400);
    }
    if (!threadId) return json({ error: "threadId required" }, 400);

    // Confirm thread ownership
    const { data: thread, error: threadErr } = await supabase
      .from("assistant_threads")
      .select("id, user_id, context_programme_id, context_wp_id, context_site_id")
      .eq("id", threadId)
      .maybeSingle();
    if (threadErr || !thread || thread.user_id !== userId) {
      return json({ error: "Thread not found" }, 404);
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "AI gateway not configured" }, 500);

    const gateway = createLovableAiGatewayProvider(lovableKey);
    const model = gateway("google/gemini-3.1-pro-preview");

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
    async function audit(toolName: string, params: unknown, startedAt: number, status: "ok" | "error", result: { summary?: string; ids?: string[]; error?: string }) {
      await supabase.from("assistant_tool_calls").insert({
        thread_id: threadId,
        user_id: userId,
        tool_name: toolName,
        params: params as any,
        result_summary: result.summary?.slice(0, 500) ?? null,
        record_ids: result.ids ?? null,
        status,
        execution_ms: Date.now() - startedAt,
        model: "google/gemini-3.1-pro-preview",
        error_message: result.error ?? null,
      });
    }

    const contextLine = [
      thread.context_programme_id ? `Programme ${thread.context_programme_id}` : null,
      thread.context_wp_id ? `Work Package ${thread.context_wp_id}` : null,
      thread.context_site_id ? `Site ${thread.context_site_id}` : null,
    ].filter(Boolean).join(", ");

    const system = SYSTEM_PROMPT + (contextLine ? `\n\nCurrent context: ${contextLine}.` : "");

    const tools: Record<string, any> = {
      search_sites: tool({
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
            await audit("search_sites", { query, limit: lim }, started, "error", { error: error.message });
            return { error: error.message };
          }
          const sites = data ?? [];
          await audit("search_sites", { query, limit: lim }, started, "ok", {
            summary: `Found ${sites.length} sites`,
            ids: sites.map((s) => s.id),
          });
          return {
            sites,
            sources: sites.map((s) => ({ table: "sites", id: s.id, url: `/site/${s.id}`, label: s.site_name })),
          };
        },
      }),

      get_site_details: tool({
        description: "Get full details for one Gridwise site by id, including the latest study id if one exists.",
        inputSchema: z.object({ site_id: z.string().uuid() }),
        execute: async ({ site_id }) => {
          const started = Date.now();
          const [siteRes, studyRes] = await Promise.all([
            supabase.from("sites").select("*").eq("id", site_id).maybeSingle(),
            supabase.from("studies").select("id, study_name, status, updated_at").eq("site_id", site_id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
          ]);
          if (siteRes.error || !siteRes.data) {
            await audit("get_site_details", { site_id }, started, "error", { error: siteRes.error?.message ?? "not found" });
            return { error: "Site not found or not accessible" };
          }
          await audit("get_site_details", { site_id }, started, "ok", { summary: siteRes.data.site_name, ids: [site_id] });
          return {
            site: siteRes.data,
            latest_study: studyRes.data ?? null,
            sources: [{ table: "sites", id: site_id, url: `/site/${site_id}`, label: siteRes.data.site_name }],
          };
        },
      }),

      get_site_feasibility: tool({
        description: "Return the stored feasibility / engine output for a site's latest study. Does NOT re-run any engineering engine. If no study exists, returns { needs_study: true } and the user must run the study in the Gridwise app first.",
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
            await audit("get_site_feasibility", { site_id }, started, "error", { error: error.message });
            return { error: error.message };
          }
          if (!study) {
            await audit("get_site_feasibility", { site_id }, started, "ok", { summary: "needs_study" });
            return { needs_study: true, site_id, message: "No study run for this site yet. The user must run one from the Gridwise map or site page." };
          }
          await audit("get_site_feasibility", { site_id }, started, "ok", { summary: `study ${study.id}`, ids: [study.id] });
          return {
            study,
            sources: [{ table: "studies", id: study.id, url: `/study/${study.id}`, label: study.study_name }],
          };
        },
      }),

      search_programmes: tool({
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
            await audit("search_programmes", { query, limit: lim }, started, "error", { error: error.message });
            return { error: error.message };
          }
          const items = data ?? [];
          await audit("search_programmes", { query, limit: lim }, started, "ok", {
            summary: `Found ${items.length} programmes`,
            ids: items.map((p) => p.id),
          });
          return {
            programmes: items,
            sources: items.map((p) => ({ table: "programmes", id: p.id, url: `/delivery/programme/${p.id}`, label: p.name })),
          };
        },
      }),

      search_work_packages: tool({
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
            await audit("search_work_packages", { query, programme_id, limit: lim }, started, "error", { error: error.message });
            return { error: error.message };
          }
          const items = data ?? [];
          await audit("search_work_packages", { query, programme_id, limit: lim }, started, "ok", {
            summary: `Found ${items.length} work packages`,
            ids: items.map((w) => w.id),
          });
          return {
            work_packages: items,
            sources: items.map((w) => ({ table: "work_packages", id: w.id, url: `/wp/${w.id}`, label: w.name })),
          };
        },
      }),
    };

    // WRITE tools — declared WITHOUT `execute` so the AI SDK surfaces them
    // to the client in `input-available` state. The client renders an
    // approval card; on Approve it calls gridwise-agent-execute and then
    // returns the result via addToolResult, which resumes the stream.
    for (const name of WRITE_TOOL_NAMES) {
      tools[name] = tool({
        description: writeToolDescriptions[name],
        inputSchema: writeToolSchemas[name],
        // no execute → human-in-the-loop
      });
    }

    // Log every proposed write for audit as soon as the model asks for it.
    // We use onStepFinish to capture proposals without waiting for execution.

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
                tool_name: call.toolName,
                tool_call_id: call.toolCallId,
                params: call.input as any,
                status: "proposed",
                model: "google/gemini-3.1-pro-preview",
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