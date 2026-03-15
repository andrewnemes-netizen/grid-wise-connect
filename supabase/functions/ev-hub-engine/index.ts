import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * EV Hub Engine Edge Function
 * Runs the full EV hub feasibility pipeline server-side.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth check ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const input = await req.json();
    const {
      site_lat,
      site_lng,
      charger_count,
      charger_kw_each,
      diversity_factor = 1.0,
      extraneous_within_2p5m = false,
      dno_override,
      network_headroom_kva,
      fault_level_ka,
      transformer_loading_pct,
      transformer_capacity_kva,
      route_segments = [],
      route_crossings = [],
      cable_candidates = [],
      site_has_metallic_services = false,
    } = input;

    if (!site_lat || !site_lng || !charger_count || !charger_kw_each) {
      return new Response(
        JSON.stringify({ error: "site_lat, site_lng, charger_count, charger_kw_each are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── A) DNO Anchor ──
    // In production: ST_Intersects against licence area polygons
    // For now: require dno_override
    const dnoKey = dno_override || "UKPN";
    const ruleSetId = "DNO_EV_HUB_V1";

    // ── B) Load Rules ──
    let { data: ruleset } = await supabase
      .from("ev_hub_rulesets")
      .select("*")
      .eq("dno_key", dnoKey)
      .eq("rule_set_id", ruleSetId)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ruleset) {
      const { data: baseline } = await supabase
        .from("ev_hub_rulesets")
        .select("*")
        .eq("dno_key", "UK_ALL")
        .eq("rule_set_id", ruleSetId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      ruleset = baseline;
    }

    if (!ruleset) {
      return new Response(
        JSON.stringify({ error: "No active EV hub ruleset found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rules = ruleset.rules_json as Record<string, any>;

    // ── E) Electrical Sizing ──
    const rawDemandKw = charger_count * charger_kw_each;
    const diversifiedKw = rawDemandKw * diversity_factor;
    const totalDemandKva = diversifiedKw / 0.95;
    const lvMaxKva = rules.lv_max_demand_kva?.value ?? 276;
    const reason_codes: string[] = [];

    let feasibilityState = "LV_OK";

    if (totalDemandKva > lvMaxKva) {
      feasibilityState = "HV_CONNECTION_REQUIRED";
      reason_codes.push("DEMAND_EXCEEDS_LV_THRESHOLD");
    }

    if (extraneous_within_2p5m) {
      feasibilityState = "ENGINEERING_REVIEW_REQUIRED";
      reason_codes.push("EXTRANEOUS_WITHIN_2P5M");
    }

    if (network_headroom_kva != null && totalDemandKva > network_headroom_kva) {
      if (feasibilityState === "LV_OK") feasibilityState = "LV_REINFORCEMENT_REQUIRED";
      reason_codes.push("EXCEEDS_NETWORK_HEADROOM");
    }

    // Check pending critical fields
    const pendingFields: string[] = [];
    for (const [key, field] of Object.entries(rules)) {
      if (field && typeof field === "object" && (field as any).pending) {
        pendingFields.push(key);
      }
    }

    if (pendingFields.length > 0 && feasibilityState === "LV_OK") {
      feasibilityState = "DNO_STUDY_REQUIRED";
      reason_codes.push("CRITICAL_RULE_FIELDS_PENDING");
    }

    // ── F) Earthing ──
    const earthing = {
      selected: "UNCONFIRMED",
      review_required: extraneous_within_2p5m || site_has_metallic_services,
      reason_codes: [
        ...(extraneous_within_2p5m ? ["EXTRANEOUS_WITHIN_2P5M"] : []),
        ...(site_has_metallic_services ? ["METALLIC_SERVICES_PRESENT"] : []),
      ],
      warnings: extraneous_within_2p5m
        ? ["Extraneous conductive parts detected. Engineering review required."]
        : [],
    };

    // ── G) Reinforcement ──
    let reinforcementState = "NO_REINFORCEMENT";
    if (network_headroom_kva != null && totalDemandKva > network_headroom_kva) {
      reinforcementState = "LV_REINFORCEMENT_REQUIRED";
    } else if (network_headroom_kva == null) {
      reinforcementState = "STUDY_REQUIRED";
    }

    // ── D) Route Segmentation (passthrough) ──
    const totalRouteLength = route_segments.reduce((s: number, seg: any) => s + (seg.length_m || 0), 0);

    // ── H) Split BOQ ──
    const maxServiceLength = (rules.max_service_length_m?.value as number) ?? 25;
    const needsMainExtension = totalRouteLength > maxServiceLength;

    const electricalBoq: any[] = [
      { item_code: "E001", description: "Service cable", unit: "m", quantity: needsMainExtension ? maxServiceLength : totalRouteLength, category: "electrical" },
      { item_code: "E003", description: "Cable termination", unit: "ea", quantity: 2, category: "electrical" },
      { item_code: "E004", description: "Feeder pillar", unit: "ea", quantity: 1, category: "electrical" },
      { item_code: "E005", description: "Earthing installation", unit: "lot", quantity: 1, category: "electrical" },
      { item_code: "E006", description: "CT metering", unit: "ea", quantity: 1, category: "electrical" },
    ];

    if (needsMainExtension) {
      electricalBoq.push({ item_code: "E007", description: "LV main cable extension", unit: "m", quantity: totalRouteLength - maxServiceLength, category: "electrical" });
      electricalBoq.push({ item_code: "E008", description: "Service/main cable joint", unit: "ea", quantity: 1, category: "electrical" });
    }

    if (earthing.review_required && earthing.selected === "UNCONFIRMED") {
      electricalBoq.push({ item_code: "E009", description: "Earthing allowance (non-standard, TBC)", unit: "lot", quantity: 1, category: "electrical" });
    }

    const boq = {
      electrical: electricalBoq,
      civils: route_segments.map((seg: any, i: number) => ({
        item_code: `C_SEG_${i + 1}`,
        description: `Excavation — ${seg.surface_type || "FOOTWAY"}`,
        unit: "m",
        quantity: seg.length_m || 0,
        category: "civils",
      })),
      traffic_mgmt: route_segments.some((s: any) => s.surface_type === "CARRIAGEWAY")
        ? [{ item_code: "TM001", description: "Traffic management setup", unit: "ea", quantity: 1, category: "traffic_mgmt" }]
        : [],
      fees: [
        { item_code: "F001", description: "Design fee", unit: "lot", quantity: 1, category: "fees" },
        { item_code: "F002", description: "Project management", unit: "lot", quantity: 1, category: "fees" },
        { item_code: "F003", description: "Contingency", unit: "lot", quantity: 1, category: "fees" },
      ],
    };

    // ── I) Audit ──
    const confidenceByField: Record<string, string> = {};
    for (const [key, field] of Object.entries(rules)) {
      if (field && typeof field === "object" && "confidence" in (field as any)) {
        confidenceByField[key] = (field as any).confidence;
      }
    }

    // Confidence escalation
    const safetyCritical = ["extraneous_distance_threshold_m", "lv_max_demand_kva", "fault_level_thresholds", "protection_grading", "transformer_loading_thresholds"];
    for (const f of safetyCritical) {
      if (confidenceByField[f] && confidenceByField[f] !== "HIGH" && feasibilityState === "LV_OK") {
        feasibilityState = "DNO_STUDY_REQUIRED";
        reason_codes.push("SAFETY_CRITICAL_LOW_CONFIDENCE");
        break;
      }
    }

    const result = {
      version: "EV_HUB_ENGINE_V1_FRAMEWORK",
      dno_anchor: { dno_key: dnoKey, rule_set_id: ruleSetId },
      cable_selection: {
        candidate_poc: cable_candidates.length > 0 ? cable_candidates[0] : null,
        alternatives: cable_candidates.slice(1),
        warnings: cable_candidates.length === 0 ? ["NO_LV_CABLES_IN_RANGE"] : [],
      },
      route_quantities: {
        segments: route_segments,
        crossings: route_crossings,
        total_length_m: totalRouteLength,
        traffic_management_required: route_segments.some((s: any) => s.surface_type === "CARRIAGEWAY"),
      },
      electrical_sizing: {
        state: feasibilityState,
        total_demand_kva: Math.round(totalDemandKva * 100) / 100,
        service_cable: rules.service_cable_default?.pending ? "PENDING" : String(rules.service_cable_default?.value ?? "PENDING"),
        lv_main_cable: rules.lv_main_cables?.pending ? "PENDING" : String(rules.lv_main_cables?.value ?? "PENDING"),
        protection_grading: { status: rules.protection_grading?.pending ? "REVIEW_REQUIRED" : "PASS", notes: [] },
        reinforcement_trigger: feasibilityState === "LV_REINFORCEMENT_REQUIRED" || feasibilityState === "HV_CONNECTION_REQUIRED",
        reason_codes,
      },
      earthing,
      reinforcement: {
        state: reinforcementState,
        headroom_remaining_kva: network_headroom_kva != null ? network_headroom_kva - totalDemandKva : null,
        fault_level_ok: null,
        transformer_loading_pct: transformer_loading_pct ?? null,
        mitigation_steps: [],
        reason_codes: reinforcementState !== "NO_REINFORCEMENT" ? [reinforcementState] : [],
      },
      boq,
      feasibility_state: feasibilityState,
      audit: {
        reason_codes: [...new Set(reason_codes)],
        warnings: earthing.warnings,
        pending_fields: pendingFields,
        confidence_by_field: confidenceByField,
        engine_trace: {
          charger_count,
          charger_kw_each,
          diversity_factor,
          total_demand_kva: Math.round(totalDemandKva * 100) / 100,
          lv_max_kva: lvMaxKva,
          route_total_length_m: totalRouteLength,
        },
        engine_version: "EV_HUB_ENGINE_V1_FRAMEWORK",
        timestamp: new Date().toISOString(),
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
