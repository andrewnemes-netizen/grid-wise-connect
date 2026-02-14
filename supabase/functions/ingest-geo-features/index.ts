import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_TABLES = new Set([
  "geo_substations",
  "geo_feeders",
  "geo_cables",
  "geo_constraints",
  "geo_points",
  "geo_polygons",
]);

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

    // Verify user & admin role
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleCheck } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { layer_id, storage_table, dno, features } = await req.json();

    if (!layer_id || !storage_table || !dno || !Array.isArray(features) || !features.length) {
      return new Response(
        JSON.stringify({ error: "layer_id, storage_table, dno, and features[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!VALID_TABLES.has(storage_table)) {
      return new Response(JSON.stringify({ error: `Invalid storage_table: ${storage_table}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build rows based on the target table
    const rows = features.map((f: any) => {
      const geomJson = JSON.stringify(f.geometry);
      const props = f.properties || {};

      const base: Record<string, any> = {
        layer_id,
        dno,
        geom: geomJson,
        name: props.name || props.site_name || props.Name || props.SITE_NAME || null,
        asset_id: props.asset_id || props.ASSET_ID || props.site_id || props.SITE_ID || null,
        attrs_json: props,
      };

      // Table-specific fields
      if (storage_table === "geo_substations") {
        base.capacity_kw = parseNum(props.firm_capacity_kw || props.capacity_kw);
        base.demand_kw = parseNum(props.max_demand_kw || props.demand_kw);
        base.headroom_kw = parseNum(props.transformer_headroom_kw || props.headroom_kw);
        base.utilisation_pct = parseNum(props.utilisation_pct);
        base.voltage_kv = parseNum(props.voltage_kv);
        base.status = props.status || "unknown";
      } else if (storage_table === "geo_feeders") {
        base.voltage_kv = parseNum(props.voltage_kv);
        base.feeder_ref = props.feeder_ref || null;
        base.status = props.status || "unknown";
      } else if (storage_table === "geo_cables") {
        base.voltage_kv = parseNum(props.voltage_kv);
        base.capacity_value = parseNum(props.capacity_value);
        base.capacity_unit = props.capacity_unit || null;
        base.capacity_flag = props.capacity_flag || "unknown";
        base.status = props.status || "unknown";
      } else if (storage_table === "geo_constraints") {
        base.constraint_type = props.constraint_type || props.type || null;
        base.status = props.status || "unknown";
      }

      return base;
    });

    // Insert using raw SQL via rpc to handle ST_GeomFromGeoJSON
    // We'll insert in a single batch using the supabase client with geom as text
    // The geom column accepts GeoJSON text which PostGIS auto-converts
    const { error: insertError } = await supabase.from(storage_table).insert(
      rows.map((r: any) => ({
        ...r,
        geom: undefined, // Remove geom from the JS object
      }))
    );

    // Since we can't directly insert GeoJSON via the client easily,
    // use a raw SQL approach via rpc
    // Actually, let's use a different approach: insert without geom, then update geom
    // First insert without geom
    if (insertError) {
      // Try without geom field
      console.error("Insert error:", insertError);
    }

    // Better approach: use SQL function to handle this
    // Let's use a direct SQL insert via a helper RPC
    // For now, let's use individual updates which is slower but reliable

    // Actually the best approach: insert rows with geom as a SQL expression
    // We'll call a dedicated RPC function
    const insertSql = rows.map((r: any) => {
      const geomJson = r.geom;
      delete r.geom;
      return { ...r, geom_geojson: geomJson };
    });

    // Use the batch insert RPC
    const { data: result, error: rpcError } = await supabase.rpc("batch_insert_geo_features", {
      _table_name: storage_table,
      _features_json: JSON.stringify(insertSql),
    });

    if (rpcError) {
      console.error("RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: rpcError.message, inserted: 0 }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update feature count on layer_registry
    const { count } = await supabase
      .from(storage_table)
      .select("*", { count: "exact", head: true })
      .eq("layer_id", layer_id);

    await supabase
      .from("layer_registry")
      .update({ feature_count: count ?? 0, updated_at: new Date().toISOString() })
      .eq("id", layer_id);

    return new Response(
      JSON.stringify({ inserted: features.length, total_in_layer: count }),
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
