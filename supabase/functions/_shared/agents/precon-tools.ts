// Read tools for the Pre-Con Agent.
// These are imported by gridwise-assistant and bound to the request-scoped
// Supabase client so RLS applies automatically.
import { z } from "npm:zod@^3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export function buildPreconReadTools(supabase: SupabaseClient, userId: string, threadId: string) {
  async function audit(toolName: string, params: unknown, startedAt: number, status: "ok" | "error", result: { summary?: string; ids?: string[]; error?: string }) {
    await supabase.from("assistant_tool_calls").insert({
      thread_id: threadId,
      user_id: userId,
      agent_id: "precon",
      tool_name: toolName,
      params: params as any,
      result_summary: result.summary?.slice(0, 500) ?? null,
      record_ids: result.ids ?? null,
      status,
      execution_ms: Date.now() - startedAt,
      model: "google/gemini-3.1-pro-preview",
      error_message: result.error ?? null,
      execution_mode: status === "ok" ? "auto_executed" : "error",
      risk_tier: "safe",
    });
  }

  return {
    list_wp_sites: {
      description: "List sites inside a work package with their current Pre-Con stage summary.",
      inputSchema: z.object({
        work_package_id: z.string().uuid(),
        limit: z.number().int().optional().describe("Max rows, default 100."),
      }),
      execute: async ({ work_package_id, limit }: { work_package_id: string; limit?: number }) => {
        const started = Date.now();
        const lim = Math.min(limit ?? 100, 200);
        const { data: rows, error } = await supabase
          .from("wp_sites")
          .select("site_id, sites(id, site_name, postcode, client_site_code, status)")
          .eq("work_package_id", work_package_id)
          .limit(lim);
        if (error) {
          await audit("list_wp_sites", { work_package_id, limit: lim }, started, "error", { error: error.message });
          return { error: error.message };
        }
        const siteIds = (rows ?? []).map((r: any) => r.site_id).filter(Boolean);
        const { data: stageRows, error: stageErr } = await supabase
          .from("site_stage_status")
          .select("site_id, stage, workflow_status, owner_id, recipient_user_ids, wait_started_at, wait_target_date, wait_delay_reason")
          .in("site_id", siteIds.length ? siteIds : ["00000000-0000-0000-0000-000000000000"]);
        if (stageErr) {
          await audit("list_wp_sites", { work_package_id, limit: lim }, started, "error", { error: stageErr.message });
          return { error: stageErr.message };
        }
        const sites = (rows ?? []).map((r: any) => ({
          site_id: r.site_id,
          ...r.sites,
          stages: (stageRows ?? []).filter((s: any) => s.site_id === r.site_id),
        }));
        await audit("list_wp_sites", { work_package_id, limit: lim }, started, "ok", {
          summary: `${sites.length} sites`,
          ids: siteIds,
        });
        return {
          sites,
          sources: sites.map((s: any) => ({
            table: "sites",
            id: s.site_id,
            url: `/site/${s.site_id}`,
            label: s.site_name ?? "Unnamed site",
          })),
        };
      },
    },

    get_stage_status: {
      description: "Get Pre-Con stage status for one or more sites, including owner, recipients, wait dates, and delay reason.",
      inputSchema: z.object({
        work_package_id: z.string().uuid(),
        site_ids: z.array(z.string().uuid()).min(1).max(200),
        stage_key: z.string().min(1).optional(),
        only_overdue: z.boolean().optional().describe("Only return waiting/counter stages that are past their target date."),
      }),
      execute: async (input: {
        work_package_id: string;
        site_ids: string[];
        stage_key?: string;
        only_overdue?: boolean;
      }) => {
        const started = Date.now();
        let q = supabase
          .from("site_stage_status")
          .select(
            "site_id, stage, workflow_status, owner_id, recipient_user_ids, recipient_contact_ids, blocked_reason, review_notes, wait_started_at, wait_target_date, wait_delay_reason, actual_start_date, actual_finish_date",
          )
          .eq("work_package_id", input.work_package_id)
          .in("site_id", input.site_ids);
        if (input.stage_key) q = q.eq("stage", input.stage_key);
        if (input.only_overdue) {
          q = q.lt("wait_target_date", new Date().toISOString().slice(0, 10)).or("wait_target_date.is.null");
        }
        const { data, error } = await q;
        if (error) {
          await audit("get_stage_status", input, started, "error", { error: error.message });
          return { error: error.message };
        }
        await audit("get_stage_status", input, started, "ok", {
          summary: `${(data ?? []).length} stage rows`,
          ids: input.site_ids,
        });
        return {
          stages: data ?? [],
          sources: (data ?? []).map((s: any) => ({
            table: "site_stage_status",
            id: s.site_id,
            url: `/site/${s.site_id}`,
            label: `${s.stage} @ ${s.site_id.slice(0, 8)}`,
          })),
        };
      },
    },

    list_stage_definitions: {
      description: "Return the full Pre-Con stage definitions (key, label, track, order, requires_owner, allowed_owner_roles).",
      inputSchema: z.object({}),
      execute: async () => {
        const started = Date.now();
        const { data, error } = await supabase
          .from("stage_definitions")
          .select("key, label, category, order_index, requires_owner, allowed_owner_roles, is_terminal")
          .order("order_index", { ascending: true });
        if (error) {
          await audit("list_stage_definitions", {}, started, "error", { error: error.message });
          return { error: error.message };
        }
        await audit("list_stage_definitions", {}, started, "ok", { summary: `${(data ?? []).length} stages` });
        return { stages: data ?? [] };
      },
    },
  };
}
