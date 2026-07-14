import { supabase } from "@/integrations/supabase/client";
import { BoardAutomation } from "./types";

export async function runAutomations(
  automations: BoardAutomation[],
  taskId: string,
  before: any,
  after: any,
) {
  for (const a of automations) {
    if (!a.enabled) continue;
    const t = a.trigger_json;
    let fired = false;
    if (t.type === "status_changes_to" && before.status !== after.status && after.status === t.status) fired = true;
    if (t.type === "percent_reaches_100" && Number(before.percent_complete) < 100 && Number(after.percent_complete) >= 100) fired = true;
    if (!fired) continue;

    const act = a.action_json;
    const patch: any = {};
    if (act.type === "set_date_today" && act.column) patch[act.column] = new Date().toISOString().slice(0, 10);
    if (act.type === "set_status" && act.status) patch.status = act.status;
    if (Object.keys(patch).length) {
      await supabase.from("project_tasks").update(patch).eq("id", taskId);
    }
  }
}