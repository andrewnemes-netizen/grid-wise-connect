import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Mode = "merge" | "replace";

function slug(s: string): string {
  return (s || "stage")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "stage";
}

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { return new Date(d.getTime() + n * 86400000); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(url, service);

    const body = await req.json().catch(() => ({}));
    const workPackageId: string = body.work_package_id;
    const estimateId: string = body.estimate_id;
    const siteIds: string[] | undefined = body.site_ids;
    const mode: Mode = body.mode === "replace" ? "replace" : "merge";
    const startDateStr: string | undefined = body.start_date;
    const previewOnly: boolean = !!body.preview;

    if (!workPackageId || !estimateId) {
      return new Response(JSON.stringify({ error: "work_package_id and estimate_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load estimate, groups, lines
    const [{ data: estimate, error: eErr }, { data: groups, error: gErr }, { data: lines, error: lErr }] = await Promise.all([
      admin.from("estimates").select("*").eq("id", estimateId).single(),
      admin.from("estimate_groups").select("*").eq("estimate_id", estimateId).order("sort_index"),
      admin.from("estimate_lines").select("*, rate_items(productivity_qty_per_day, default_crew_size, default_stage, code)").eq("estimate_id", estimateId).order("sort_index"),
    ]);
    if (eErr || gErr || lErr) throw eErr ?? gErr ?? lErr;
    if (!estimate) throw new Error("Estimate not found");

    // Load wp sites
    const { data: wpSites, error: wsErr } = await admin.from("wp_sites")
      .select("id, site_id, sequence, local_ref, sites(site_name)")
      .eq("work_package_id", workPackageId)
      .order("sequence", { ascending: true, nullsFirst: false });
    if (wsErr) throw wsErr;
    const sitesFiltered = (wpSites ?? []).filter((s: any) => !siteIds || siteIds.includes(s.site_id));
    if (!sitesFiltered.length) {
      return new Response(JSON.stringify({ error: "no sites for this work package" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Derive stages from groups (skip empty groups)
    const linesByGroup: Record<string, any[]> = {};
    for (const l of (lines ?? [])) {
      const k = l.group_id ?? "__ungrouped";
      (linesByGroup[k] ??= []).push(l);
    }
    const stageDefs = (groups ?? [])
      .filter((g: any) => (linesByGroup[g.id] ?? []).length > 0)
      .map((g: any, i: number) => ({
        group_id: g.id,
        code: g.stage_code || slug(g.name),
        name: g.name,
        order: g.stage_order ?? g.sort_index ?? i,
        color: g.stage_color || g.color || null,
        predecessor: g.default_predecessor_stage_code || null,
      }))
      .sort((a, b) => a.order - b.order);

    // Build preview / plan
    type WorkRow = { site_id: string; site_name: string; stage_code: string; stage_name: string; line_id: string; title: string; qty: number; uom: string; crew: number; prod: number | null; duration_days: number; fallback: boolean; color: string | null; rate_code: string | null };
    const plan: WorkRow[] = [];
    const warnings: { line_id: string; title: string; reason: string }[] = [];

    for (const s of sitesFiltered) {
      for (const stage of stageDefs) {
        for (const l of linesByGroup[stage.group_id] ?? []) {
          const ri = (l as any).rate_items;
          const prod = Number(ri?.productivity_qty_per_day ?? 0);
          const crew = Math.max(1, Number(ri?.default_crew_size ?? 1));
          const qty = Number(l.qty ?? 0);
          let dur = 1; let fallback = false;
          if (prod > 0 && qty > 0) {
            dur = Math.max(1, Math.ceil(qty / (prod * crew)));
          } else {
            fallback = true;
            warnings.push({ line_id: l.id, title: l.boq_item_name, reason: prod > 0 ? "qty missing" : "no productivity on rate item" });
          }
          plan.push({
            site_id: s.site_id,
            site_name: s.sites?.site_name ?? s.local_ref ?? "Site",
            stage_code: stage.code,
            stage_name: stage.name,
            line_id: l.id,
            title: l.boq_item_name || "Item",
            qty,
            uom: l.uom ?? "",
            crew,
            prod: prod > 0 ? prod : null,
            duration_days: dur,
            fallback,
            color: stage.color,
            rate_code: ri?.code ?? l.rate_code ?? null,
          });
        }
      }
    }

    // Preview summary
    const summary = sitesFiltered.map((s: any) => {
      const byStage = stageDefs.map((st) => {
        const rows = plan.filter((p) => p.site_id === s.site_id && p.stage_code === st.code);
        return { stage_code: st.code, stage_name: st.name, task_count: rows.length, total_days: rows.reduce((sum, r) => sum + r.duration_days, 0) };
      });
      return { site_id: s.site_id, site_name: s.sites?.site_name ?? s.local_ref ?? "Site", stages: byStage };
    });

    if (previewOnly) {
      return new Response(JSON.stringify({ preview: summary, warnings, stage_defs: stageDefs }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Optional replace: drop previously-generated rows from this estimate
    if (mode === "replace") {
      await admin.from("wp_task_dependencies").delete().in(
        "task_id",
        (await admin.from("wp_tasks").select("id").eq("work_package_id", workPackageId).eq("generated_from_estimate_id", estimateId)).data?.map((r: any) => r.id) ?? []
      );
      await admin.from("wp_tasks").delete().eq("work_package_id", workPackageId).eq("generated_from_estimate_id", estimateId);
    }

    // Schedule
    const wpStart = startDateStr ? new Date(startDateStr) : new Date();
    wpStart.setHours(0, 0, 0, 0);

    // Site summary upsert helper
    async function upsertSummary(site_id: string, stage_code: string | null, kind: "site_summary" | "stage_summary", title: string, parentId: string | null, color: string | null) {
      const { data: existing } = await admin.from("wp_tasks").select("id")
        .eq("work_package_id", workPackageId)
        .eq("task_kind", kind)
        .eq("site_id", site_id)
        .eq("stage_code", stage_code ?? "")
        .maybeSingle();
      if (existing?.id) return existing.id as string;
      const { data: ins, error } = await admin.from("wp_tasks").insert({
        work_package_id: workPackageId,
        title,
        task_kind: kind,
        site_id,
        stage_code: stage_code ?? "",
        parent_task_id: parentId,
        generated_from_estimate_id: estimateId,
        gantt_color: color ?? undefined,
      }).select("id").single();
      if (error) throw error;
      return ins!.id as string;
    }

    let created = 0, updated = 0;

    for (const s of sitesFiltered) {
      const siteTitle = s.sites?.site_name ? (s.local_ref ? `${s.local_ref} · ${s.sites.site_name}` : s.sites.site_name) : (s.local_ref ?? "Site");
      const siteSumId = await upsertSummary(s.site_id, "", "site_summary", siteTitle, null, null);

      let stageCursor = new Date(wpStart);
      let prevStageEnd: Date | null = null;
      const stageEnds: Record<string, Date> = {};

      for (const stage of stageDefs) {
        const stageRows = plan.filter((p) => p.site_id === s.site_id && p.stage_code === stage.code);
        if (!stageRows.length) continue;

        // Stage start: after predecessor if specified, else after previous stage
        let stageStart = stageCursor;
        if (stage.predecessor && stageEnds[stage.predecessor]) {
          stageStart = addDays(stageEnds[stage.predecessor], 1);
        } else if (prevStageEnd) {
          stageStart = addDays(prevStageEnd, 1);
        }

        const stageSumId = await upsertSummary(s.site_id, stage.code, "stage_summary", `${stage.name}`, siteSumId, stage.color);

        let cursor = new Date(stageStart);
        for (const r of stageRows) {
          const start = new Date(cursor);
          const end = addDays(start, Math.max(0, r.duration_days - 1));
          const payload = {
            work_package_id: workPackageId,
            site_id: r.site_id,
            stage_code: r.stage_code,
            estimate_line_id: r.line_id,
            generated_from_estimate_id: estimateId,
            task_kind: "work" as const,
            parent_task_id: stageSumId,
            title: r.title,
            qty: r.qty,
            uom: r.uom,
            crew_size: r.crew,
            productivity_qty_per_day: r.prod,
            duration_days: r.duration_days,
            start_date: iso(start),
            due_date: iso(end),
            gantt_color: r.color ?? undefined,
            description: r.rate_code ? `Rate: ${r.rate_code}` : undefined,
          };
          // upsert by unique (wp, site, stage, estimate_line_id)
          const { data: existing } = await admin.from("wp_tasks").select("id, percent_complete, status")
            .eq("work_package_id", workPackageId)
            .eq("site_id", r.site_id)
            .eq("stage_code", r.stage_code)
            .eq("estimate_line_id", r.line_id)
            .maybeSingle();
          if (existing?.id) {
            const { error } = await admin.from("wp_tasks").update({
              title: payload.title, qty: payload.qty, uom: payload.uom, crew_size: payload.crew_size,
              productivity_qty_per_day: payload.productivity_qty_per_day, duration_days: payload.duration_days,
              start_date: payload.start_date, due_date: payload.due_date, gantt_color: payload.gantt_color,
              parent_task_id: stageSumId, stage_code: payload.stage_code, description: payload.description,
            }).eq("id", existing.id);
            if (error) throw error;
            updated++;
          } else {
            const { error } = await admin.from("wp_tasks").insert(payload);
            if (error) throw error;
            created++;
          }
          cursor = addDays(end, 1);
        }
        prevStageEnd = addDays(cursor, -1);
        stageEnds[stage.code] = prevStageEnd;
        stageCursor = addDays(prevStageEnd, 1);

        // Update stage summary dates
        await admin.from("wp_tasks").update({
          start_date: iso(stageStart), due_date: iso(prevStageEnd),
        }).eq("id", stageSumId);
      }

      // Site summary spans full range
      const siteRows = plan.filter((p) => p.site_id === s.site_id);
      if (siteRows.length) {
        const { data: taskDates } = await admin.from("wp_tasks").select("start_date,due_date")
          .eq("work_package_id", workPackageId).eq("site_id", s.site_id).eq("task_kind", "work");
        const ds = (taskDates ?? []).map((t: any) => t.start_date).filter(Boolean).sort();
        const de = (taskDates ?? []).map((t: any) => t.due_date).filter(Boolean).sort();
        if (ds.length && de.length) {
          await admin.from("wp_tasks").update({ start_date: ds[0], due_date: de[de.length - 1] }).eq("id", siteSumId);
        }
      }

      // Stage-to-stage FS dependencies
      for (let i = 0; i < stageDefs.length; i++) {
        const st = stageDefs[i];
        if (!stageEnds[st.code]) continue;
        const predecessorCode = st.predecessor || (i > 0 ? stageDefs[i - 1].code : null);
        if (!predecessorCode || !stageEnds[predecessorCode]) continue;
        const { data: a } = await admin.from("wp_tasks").select("id").eq("work_package_id", workPackageId).eq("site_id", s.site_id).eq("task_kind", "stage_summary").eq("stage_code", predecessorCode).maybeSingle();
        const { data: b } = await admin.from("wp_tasks").select("id").eq("work_package_id", workPackageId).eq("site_id", s.site_id).eq("task_kind", "stage_summary").eq("stage_code", st.code).maybeSingle();
        if (a?.id && b?.id) {
          const { data: existing } = await admin.from("wp_task_dependencies").select("id").eq("task_id", b.id).eq("depends_on_task_id", a.id).maybeSingle();
          if (!existing) {
            await admin.from("wp_task_dependencies").insert({ task_id: b.id, depends_on_task_id: a.id, link_type: "FS", lag_days: 0 });
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, created, updated, warnings, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("generate-wp-plan error", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});