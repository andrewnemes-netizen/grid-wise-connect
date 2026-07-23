import { supabase } from "@/integrations/supabase/client";

export type Kpis = {
  window: { from: string; to: string };
  sitesTotal: number;
  sitesDelivered: number;
  sitesBehind: number;
  readyForConstruction: number;
  readyForEnergisation: number;
  pocSubmitted: number;
  pocApproved: number;
  pocOutstanding: number;
  surveysRequested: number;
  surveysCompleted: number;
  designsIssued: number;
  designsApproved: number;
  revenueMonthNet: number;
  revenueMonthGross: number;
  actualCostsMonth: number;
  grossMargin: number;
  pipelineValue: number;
  variationValue: number;
  avgDaysPerStage: number;
  programmeHealth: "GREEN" | "AMBER" | "RED";
  sitesByStage: { stage: string; count: number }[];
  revenueByMonth: { month: string; net: number }[];
};

function monthWindow(monthISO?: string) {
  const now = monthISO ? new Date(`${monthISO}-01T00:00:00Z`) : new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function loadKpis(opts?: { clientId?: string | null; monthISO?: string }): Promise<Kpis> {
  const { from, to } = monthWindow(opts?.monthISO);

  // Optional client scope: filter by work_packages.programmes.account -> clients (via programmes.account_id)
  let siteFilterIds: string[] | null = null;
  if (opts?.clientId) {
    // sites <- wp_sites <- work_packages <- programmes.account_id (clients.id via accounts.client_id?)
    // Simplified: sites where client_org = clients.name
    const { data: client } = await supabase.from("clients").select("name").eq("id", opts.clientId).maybeSingle();
    if (client?.name) {
      const { data: rows } = await supabase.from("sites").select("id").eq("client_org", client.name).limit(5000);
      siteFilterIds = (rows ?? []).map((r: any) => r.id);
      if (siteFilterIds.length === 0) siteFilterIds = ["00000000-0000-0000-0000-000000000000"];
    }
  }

  const sitesQ = supabase.from("sites").select("id, current_stage_id, blocker_reason", { count: "exact" });
  if (siteFilterIds) sitesQ.in("id", siteFilterIds);
  const sitesRes = await sitesQ;
  const sitesTotal = sitesRes.count ?? 0;
  const sitesBehind = (sitesRes.data ?? []).filter((s: any) => s.blocker_reason).length;

  // Stage distribution
  const stageBuckets: Record<string, number> = {};
  const stageStatusQ = supabase.from("site_stage_status").select("stage, workflow_status, site_id");
  if (siteFilterIds) stageStatusQ.in("site_id", siteFilterIds);
  const { data: stageRows } = await stageStatusQ;
  const bestStagePerSite = new Map<string, string>();
  (stageRows ?? []).forEach((r: any) => {
    if (r.workflow_status === "complete" || r.workflow_status === "in_progress") {
      bestStagePerSite.set(r.site_id, r.stage);
    }
  });
  bestStagePerSite.forEach((stage) => {
    stageBuckets[stage] = (stageBuckets[stage] ?? 0) + 1;
  });
  const sitesByStage = Object.entries(stageBuckets).map(([stage, count]) => ({ stage, count }));
  const readyForConstruction = stageBuckets["construction_ready"] ?? stageBuckets["ready_for_delivery"] ?? 0;
  const readyForEnergisation = stageBuckets["energisation_ready"] ?? stageBuckets["commissioning"] ?? 0;
  const sitesDelivered = stageBuckets["handover"] ?? stageBuckets["complete"] ?? stageBuckets["closed"] ?? 0;

  // POC: dno_offers
  const dnoQ = supabase.from("dno_offers").select("status, received_at");
  const { data: dnoRows } = await dnoQ;
  const pocSubmitted = (dnoRows ?? []).length;
  const pocApproved = (dnoRows ?? []).filter((r: any) => r.status === "accepted" || r.status === "approved").length;
  const pocOutstanding = (dnoRows ?? []).filter((r: any) => r.status === "pending" || r.status === "submitted").length;

  // Surveys
  const { count: surveysRequested } = await supabase.from("site_surveys").select("id", { count: "exact", head: true });
  const { count: surveysCompleted } = await supabase
    .from("site_surveys")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed");

  // Designs
  const { count: designsIssued } = await supabase.from("design_submissions").select("id", { count: "exact", head: true });
  const { count: designsApproved } = await supabase
    .from("design_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");

  // Revenue this month
  const { data: invRows } = await supabase
    .from("revenue_invoices")
    .select("net_amount, gross_amount, issue_date")
    .gte("issue_date", from.slice(0, 10))
    .lt("issue_date", to.slice(0, 10));
  const revenueMonthNet = (invRows ?? []).reduce((s: number, r: any) => s + Number(r.net_amount ?? 0), 0);
  const revenueMonthGross = (invRows ?? []).reduce((s: number, r: any) => s + Number(r.gross_amount ?? 0), 0);

  // Actuals this month
  const { data: actRows } = await supabase
    .from("actual_costs")
    .select("amount, incurred_on")
    .gte("incurred_on", from.slice(0, 10))
    .lt("incurred_on", to.slice(0, 10));
  const actualCostsMonth = (actRows ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const grossMargin = revenueMonthNet ? (revenueMonthNet - actualCostsMonth) / revenueMonthNet : 0;

  // Pipeline value: read the same commercial-position view the WP Overview uses so
  // Intelligence and Overview always agree. awarded_price = latest APPROVED WP-level
  // estimate (falling back to summed APPROVED site_estimates); poc_price = latest
  // APPROVED poc-kind estimates. The old standalone `estimates` table is not summed.
  const { data: commRows } = await (supabase as any)
    .from("v_wp_commercial_position")
    .select("work_package_id, awarded_price, poc_price");
  const pipelineValue = (commRows ?? []).reduce(
    (s: number, r: any) => s + Number(r.awarded_price ?? 0) + Number(r.poc_price ?? 0),
    0,
  );

  // Variations
  const { data: varRows } = await supabase
    .from("wp_estimate_variations")
    .select("total_price_delta, status")
    .not("status", "eq", "rejected");
  const variationValue = (varRows ?? []).reduce((s: number, r: any) => s + Number(r.total_price_delta ?? 0), 0);

  // Avg days per stage from history (last 90d)
  const cutoff = new Date(Date.now() - 90 * 86400e3).toISOString();
  const { data: hist } = await supabase
    .from("site_stage_history")
    .select("site_id, changed_at")
    .gte("changed_at", cutoff)
    .order("changed_at", { ascending: true });
  const diffs: number[] = [];
  const bySite = new Map<string, number>();
  (hist ?? []).forEach((r: any) => {
    const t = new Date(r.changed_at).getTime();
    if (bySite.has(r.site_id)) diffs.push((t - (bySite.get(r.site_id) as number)) / 86400e3);
    bySite.set(r.site_id, t);
  });
  const avgDaysPerStage = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;

  // Revenue trend: last 6 months
  const trend: { month: string; net: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("revenue_invoices")
      .select("net_amount")
      .gte("issue_date", s)
      .lt("issue_date", e);
    trend.push({
      month: d.toLocaleDateString(undefined, { month: "short" }),
      net: (data ?? []).reduce((sum: number, r: any) => sum + Number(r.net_amount ?? 0), 0),
    });
  }

  const programmeHealth: Kpis["programmeHealth"] =
    sitesBehind === 0
      ? "GREEN"
      : sitesBehind / Math.max(sitesTotal, 1) > 0.2
      ? "RED"
      : "AMBER";

  return {
    window: { from, to },
    sitesTotal,
    sitesDelivered,
    sitesBehind,
    readyForConstruction,
    readyForEnergisation,
    pocSubmitted,
    pocApproved,
    pocOutstanding,
    surveysRequested: surveysRequested ?? 0,
    surveysCompleted: surveysCompleted ?? 0,
    designsIssued: designsIssued ?? 0,
    designsApproved: designsApproved ?? 0,
    revenueMonthNet,
    revenueMonthGross,
    actualCostsMonth,
    grossMargin,
    pipelineValue,
    variationValue,
    avgDaysPerStage,
    programmeHealth,
    sitesByStage,
    revenueByMonth: trend,
  };
}
