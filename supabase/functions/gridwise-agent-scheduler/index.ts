// Background scheduler for Pre-Con waiting/counter stage escalations.
// Invoked by pg_cron every 15 minutes. Finds overdue stages, blocks them,
// and sends one aggregated notification per owner.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_LIMIT = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    return json({ error: "Missing service role key" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    {
      global: { headers: { Authorization: `Bearer ${serviceKey}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Find active waiting/counter stages that are overdue
    const { data: overdueRows, error: findErr } = await supabase
      .from("site_stage_status")
      .select(
        "id, site_id, work_package_id, stage, workflow_status, owner_id, recipient_user_ids, wait_started_at, wait_target_date, wait_delay_reason",
      )
      .in("workflow_status", ["in_progress", "review"])
      .or(`wait_target_date.lt.${today},and(wait_target_date.is.null,wait_started_at.not.is.null)`)
      .limit(BATCH_LIMIT);

    if (findErr) throw findErr;

    const rows = overdueRows ?? [];
    const notificationsByUser = new Map<string, typeof rows>();

    for (const row of rows) {
      // Mark as blocked if not already
      if (row.workflow_status !== "blocked") {
        const { error: updErr } = await supabase
          .from("site_stage_status")
          .update({
            workflow_status: "blocked",
            blocked_reason: row.wait_target_date
              ? `Overdue: ${row.stage} (target ${row.wait_target_date})`
              : `Overdue: ${row.stage} (no target date)`,
          })
          .eq("id", row.id);
        if (updErr) console.error("Failed to block overdue stage", row.id, updErr.message);
      }

      // Aggregate by owner
      const owner = row.owner_id ?? (row.recipient_user_ids?.[0] ?? null);
      if (owner) {
        const list = notificationsByUser.get(owner) ?? [];
        list.push(row);
        notificationsByUser.set(owner, list);
      }

      // Log auto-execution
      await supabase.from("agent_auto_execution_log").insert({
        agent_id: "precon",
        tool_name: "escalate_overdue_stage",
        params: {
          site_stage_status_id: row.id,
          site_id: row.site_id,
          work_package_id: row.work_package_id,
          stage: row.stage,
        },
        user_id: owner ?? "00000000-0000-0000-0000-000000000000",
        status: "ok",
        result_summary: `Escalated ${row.stage} to blocked`,
      });
    }

    // Send aggregated notifications
    for (const [userId, userRows] of notificationsByUser.entries()) {
      const siteIds = [...new Set(userRows.map((r) => r.site_id))];
      const stages = [...new Set(userRows.map((r) => r.stage))];
      await supabase.from("notifications").insert({
        user_id: userId,
        type: "agent_escalation",
        title: `${userRows.length} overdue Pre-Con stage${userRows.length === 1 ? "" : "s"}`,
        message: `Stages requiring attention: ${stages.join(", ")} for ${siteIds.length} site${siteIds.length === 1 ? "" : "s"}.`,
        data: { agent_id: "precon", site_ids: siteIds, stages },
        link: userRows[0]?.work_package_id ? `/wp/${userRows[0].work_package_id}` : null,
      });
    }

    return json({ escalated: rows.length, notified: notificationsByUser.size });
  } catch (e) {
    console.error("gridwise-agent-scheduler error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
