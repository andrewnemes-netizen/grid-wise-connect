import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { layer_id, storage_table: _clientTable, dno, features } = await req.json();

    if (!layer_id || !dno || !Array.isArray(features) || !features.length) {
      return new Response(
        JSON.stringify({ error: "layer_id, dno, and features[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Always look up the authoritative storage_table from the registry
    const { data: layerRow, error: layerErr } = await supabase
      .from("layer_registry")
      .select("storage_table, geometry_type")
      .eq("id", layer_id)
      .single();

    if (layerErr || !layerRow) {
      return new Response(
        JSON.stringify({ error: "Layer not found in registry" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const storage_table = layerRow.storage_table;

    // Use the layer's registered geometry_type first; fall back to table defaults
    const TABLE_GEOM_TYPE: Record<string, string> = {
      geo_substations: "Point",
      geo_points: "Point",
      geo_feeders: "MultiLineString",
      geo_cables: "MultiLineString",
      geo_polygons: "MultiPolygon",
      geo_constraints: "Geometry",
    };
    const registeredType = layerRow.geometry_type;
    // If the registry says "Geometry" (auto-detect) or is missing, use the table default
    const expectedGeomType = (registeredType && registeredType !== "Geometry")
      ? registeredType
      : (TABLE_GEOM_TYPE[storage_table] || "Geometry");

    // Build the features JSON for the batch insert RPC
    const mappedFeatures = features.map((f: any) => {
      const props = f.properties || {};
      let geom = f.geometry;

      // Skip features with no geometry at all
      if (!geom || !geom.type || !geom.coordinates) {
        return null;
      }

      if (geom) {
        // The actual PostGIS column type for the table — always promote to Multi for tables that need it
        const tableGeomType = TABLE_GEOM_TYPE[storage_table] || "Geometry";

        // Auto-promote single → multi variants
        if (geom.type === "LineString" && (expectedGeomType === "MultiLineString" || expectedGeomType === "LineString" || tableGeomType === "MultiLineString")) {
          geom = { type: "MultiLineString", coordinates: [geom.coordinates] };
        }
        if (geom.type === "Polygon" && (expectedGeomType === "MultiPolygon" || expectedGeomType === "Polygon" || tableGeomType === "MultiPolygon")) {
          geom = { type: "MultiPolygon", coordinates: [geom.coordinates] };
        }

        // Auto-convert Polygon/MultiPolygon → Point (centroid) when target expects Point
        if ((expectedGeomType === "Point" || tableGeomType === "Point") && (geom.type === "Polygon" || geom.type === "MultiPolygon")) {
          geom = computeCentroid(geom);
        }

        // Validate geometry family matches target table (use table's actual type for validation)
        const effectiveExpected = tableGeomType !== "Geometry" ? tableGeomType : expectedGeomType;
        const geomFamily = geom.type.replace("Multi", "");
        const expectedFamily = effectiveExpected.replace("Multi", "");
        if (effectiveExpected !== "Geometry" && geomFamily !== expectedFamily) {
          return null;
        }
      }
      return {
        geom_geojson: JSON.stringify(geom),
        layer_id,
        dno,
        name: props.name || props.site_name || props.Name || props.SITE_NAME || props.psp_name || props["Substation Name"] || null,
        asset_id: props.asset_id || props.ASSET_ID || props.site_id || props.SITE_ID || null,
        attrs_json: props,
        status: props.status || "unknown",
        // substation
        capacity_kw: parseNum(props.firm_capacity_kw || props.capacity_kw || props.firm_cap || props["Firm Capacity"]),
        demand_kw: parseNum(props.max_demand_kw || props.demand_kw || props.maxdemand || props["Maximum Demand"]),
        headroom_kw: parseNum(props.transformer_headroom_kw || props.headroom_kw || props.demhr || props["Demand Headroom"]),
        utilisation_pct: parseNum(props.utilisation_pct || props.fault_level_  || props["Fault Level %"]),
        voltage_kv: parseNum(props.voltage_kv || props.voltage || props.pvoltage || props["Downstream Voltage"]),
        // feeder
        feeder_ref: props.feeder_ref || props.circuit_id || props["circuit id"] || null,
        // cable
        capacity_value: parseNum(props.capacity_value),
        capacity_unit: props.capacity_unit || null,
        capacity_flag: props.capacity_flag || "unknown",
        // constraint
        constraint_type: props.constraint_type || props.type || null,
      };
    }).filter(Boolean); // Remove features with incompatible geometry

    if (mappedFeatures.length === 0) {
      // Collect the geometry types found in the source data for a helpful error
      const foundTypes = [...new Set(features.map((f: any) => f.geometry?.type).filter(Boolean))];
      return new Response(
        JSON.stringify({ error: `No features have geometry compatible with ${storage_table} (expects ${expectedGeomType}). Found geometry types: ${foundTypes.join(", ") || "none"}`, inserted: 0 }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const skippedCount = features.length - mappedFeatures.length;

    const { data: inserted, error: rpcError } = await supabase.rpc("batch_insert_geo_features", {
      _table_name: storage_table,
      _features_json: JSON.stringify(mappedFeatures),
    });

    if (rpcError) {
      console.error("RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: rpcError.message, inserted: 0 }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update feature count
    const { count } = await supabase
      .from(storage_table)
      .select("*", { count: "exact", head: true })
      .eq("layer_id", layer_id);

    await supabase
      .from("layer_registry")
      .update({ feature_count: count ?? 0, updated_at: new Date().toISOString() })
      .eq("id", layer_id);

    return new Response(
      JSON.stringify({ inserted: inserted ?? mappedFeatures.length, total_in_layer: count, skipped: skippedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Ingest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function parseNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Compute the centroid of a Polygon or MultiPolygon as a Point geometry. */
function computeCentroid(geom: any): any {
  let rings: number[][][] = [];
  if (geom.type === "Polygon") {
    rings = [geom.coordinates[0]]; // outer ring
  } else if (geom.type === "MultiPolygon") {
    rings = geom.coordinates.map((p: number[][][]) => p[0]); // outer ring of each polygon
  }
  let totalArea = 0;
  let cx = 0;
  let cy = 0;
  for (const ring of rings) {
    // Shoelace-based centroid for each ring
    let area = 0;
    let rx = 0;
    let ry = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      rx += (x0 + x1) * cross;
      ry += (y0 + y1) * cross;
    }
    area /= 2;
    if (Math.abs(area) < 1e-12) continue;
    rx /= (6 * area);
    ry /= (6 * area);
    const absArea = Math.abs(area);
    cx += rx * absArea;
    cy += ry * absArea;
    totalArea += absArea;
  }
  if (totalArea < 1e-12) {
    // Fallback: average of first ring's first coordinate
    const fallback = rings[0]?.[0] || [0, 0];
    return { type: "Point", coordinates: fallback };
  }
  return { type: "Point", coordinates: [cx / totalArea, cy / totalArea] };
}
