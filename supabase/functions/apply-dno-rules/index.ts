import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dno_code, voltage_level, route_length_m, cable_count } = await req.json();

    if (!dno_code || !voltage_level) {
      return new Response(
        JSON.stringify({ error: "dno_code and voltage_level are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Try DNO-specific first, fall back to UK_ALL baseline
    let { data: ruleset } = await supabase
      .from("dno_rulesets")
      .select("*")
      .eq("dno_code", dno_code)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ruleset) {
      const { data: baseline } = await supabase
        .from("dno_rulesets")
        .select("*")
        .eq("dno_code", "UK_ALL")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      ruleset = baseline;
    }

    if (!ruleset) {
      return new Response(
        JSON.stringify({ error: "No active ruleset found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rules = ruleset.rules_json as Record<string, any>;
    const vl = voltage_level.toUpperCase();
    const cables = cable_count || 1;
    const routeLen = route_length_m || 0;

    // Determine duct size
    const ductKey = cables === 1 ? "single_cable" : cables === 2 ? "two_cables" : "three_cables";
    const ductSize = rules.duct_sizes?.[vl]?.[ductKey] ?? rules.duct_sizes?.[vl]?.single_cable ?? null;

    // Cover depths per surface
    const coverDepths: Record<string, number> = {};
    for (const surface of ["tarmac", "concrete", "grass", "paving"]) {
      coverDepths[surface] = rules.cover_depths_mm?.[surface]?.[vl] ?? 450;
    }

    // Service length cap
    const serviceLengthCap = rules.service_length_cap_m ?? 30;

    // Joint count
    const jointSpacing = rules.joint_spacing_m?.[vl] ?? 500;
    const estimatedJoints = routeLen > 0 ? Math.max(0, Math.floor(routeLen / jointSpacing) - 1) : 0;

    // Warnings
    const warnings = [...(rules.warnings || [])];
    if (routeLen > serviceLengthCap) {
      warnings.push(`Route exceeds service length cap of ${serviceLengthCap}m (route: ${routeLen}m). Hybrid approach required.`);
    }

    const result = {
      dno_code: ruleset.dno_code,
      ruleset_version: ruleset.version,
      voltage_level: vl,
      duct_size_mm: ductSize,
      cover_depths_mm: coverDepths,
      service_length_cap_m: serviceLengthCap,
      joint_spacing_m: jointSpacing,
      estimated_joints: estimatedJoints,
      warnings,
      compliance_flags: rules.compliance_flags || [],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
