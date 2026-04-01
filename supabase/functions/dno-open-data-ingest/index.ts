import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * DNO API Registry — config-driven dataset definitions for each DNO's Opendatasoft portal.
 * Each entry maps source fields → Gridwise schema fields.
 */
interface FieldMapping {
  /** Source field name (dot-notation for nested, e.g. "substation_location.lat") */
  source: string;
  /** Target Gridwise field */
  target: string;
  /** Optional multiplier (e.g. MW→kW = 1000) */
  multiply?: number;
}

interface DatasetConfig {
  dataset_id: string;
  storage_table: string;
  geometry_type: string;
  /** How to extract geometry: "latlon_field" (object with lat/lon), "geo_point_2d" (string "lat,lon"), "geo_shape" (GeoJSON Feature) */
  geometry_mode: "latlon_field" | "geo_point_2d" | "geo_shape";
  geometry_field: string;
  field_mappings: FieldMapping[];
  /** Extra properties to store in attrs_json */
  attrs_fields?: string[];
}

interface DnoConfig {
  base_url: string;
  datasets: Record<string, DatasetConfig>;
}

const DNO_REGISTRY: Record<string, DnoConfig> = {
  NPG: {
    base_url: "https://northernpowergrid.opendatasoft.com/api/explore/v2.1",
    datasets: {
      primary_substations: {
        dataset_id: "heatmapdatatable",
        storage_table: "geo_substations",
        geometry_type: "Point",
        geometry_mode: "latlon_field",
        geometry_field: "substation_location",
        field_mappings: [
          { source: "psp_name", target: "name" },
          { source: "firm_cap", target: "capacity_kw", multiply: 1000 },
          { source: "maxdemand", target: "demand_kw", multiply: 1000 },
          { source: "demhr", target: "headroom_kw", multiply: 1000 },
          { source: "fault_level_", target: "utilisation_pct" },
          { source: "pvoltage", target: "voltage_kv" },
        ],
        attrs_fields: [
          "genhr", "gentot", "demtot", "rpf", "fl", "worst_tap",
          "gen_voltage_constraint", "dem_voltage_constraint",
          "genconstraint", "demconstraint",
          "worst_case_constraint_gen_colour", "worst_case_constraint_dem_colour",
          "upstreamname", "gsp_name", "typetable",
          "fl_break_d", "fl_break_r", "fl_make_d", "fl_make_r",
        ],
      },
      supply_areas: {
        dataset_id: "heatmapsubstationareas",
        storage_table: "geo_polygons",
        geometry_type: "MultiPolygon",
        geometry_mode: "geo_shape",
        geometry_field: "geo_shape",
        field_mappings: [
          { source: "psp_name", target: "name" },
        ],
        attrs_fields: [],
      },
      ehv_feeders: {
        dataset_id: "npg-ehv-feeders",
        storage_table: "geo_feeders",
        geometry_type: "LineString",
        geometry_mode: "geo_shape",
        geometry_field: "geo_shape",
        field_mappings: [
          { source: "circuit_id", target: "feeder_ref" },
        ],
        attrs_fields: [],
      },
      lv_supports: {
        dataset_id: "lv-support-locations",
        storage_table: "geo_points",
        geometry_type: "Point",
        geometry_mode: "geo_point_2d",
        geometry_field: "geo_point_2d",
        field_mappings: [
          { source: "support_type", target: "name" },
        ],
        attrs_fields: [],
      },
    },
  },
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate user auth
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { dno, dataset_key, layer_id, batch_size = 100 } = body;

    console.log(`[dno-ingest] dno=${dno} dataset=${dataset_key} layer_id=${layer_id}`);

    if (!dno || !dataset_key || !layer_id) {
      return new Response(
        JSON.stringify({ error: "dno, dataset_key, and layer_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dnoConfig = DNO_REGISTRY[dno];
    if (!dnoConfig) {
      return new Response(
        JSON.stringify({ error: `Unknown DNO: ${dno}. Available: ${Object.keys(DNO_REGISTRY).join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dsConfig = dnoConfig.datasets[dataset_key];
    if (!dsConfig) {
      return new Response(
        JSON.stringify({ error: `Unknown dataset: ${dataset_key}. Available: ${Object.keys(dnoConfig.datasets).join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify layer exists in registry
    const { data: layerRow, error: layerErr } = await supabase
      .from("layer_registry")
      .select("id, storage_table")
      .eq("id", layer_id)
      .single();

    if (layerErr || !layerRow) {
      return new Response(
        JSON.stringify({ error: "Layer not found in registry", layer_id }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine total record count first
    const apiBase = `${dnoConfig.base_url}/catalog/datasets/${dsConfig.dataset_id}/records`;
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalRecords = 0;

    // Check total count
    const countResp = await fetch(`${apiBase}?limit=0`);
    if (countResp.ok) {
      const countData = await countResp.json();
      totalRecords = countData.total_count || 0;
    }
    console.log(`[dno-ingest] Total records available: ${totalRecords}`);

    if (totalRecords > 10000) {
      // Use bulk GeoJSON export endpoint for large datasets
      const exportUrl = `${dnoConfig.base_url}/catalog/datasets/${dsConfig.dataset_id}/exports/geojson`;
      console.log(`[dno-ingest] Using streaming export (${totalRecords} records): ${exportUrl}`);

      const exportResp = await fetch(exportUrl);
      if (!exportResp.ok) {
        const errText = await exportResp.text();
        console.error(`[dno-ingest] Export endpoint error ${exportResp.status}: ${errText}`);
        return new Response(
          JSON.stringify({ error: `Export endpoint error: ${exportResp.status}`, detail: errText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Stream-parse GeoJSON features
      const reader = exportResp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let inFeatures = false;
      let depth = 0;
      let featureStart = -1;
      let featureBatch: any[] = [];

      const flushBatch = async () => {
        if (featureBatch.length === 0) return;
        const features = featureBatch
          .map((f: any) => {
            const props = f.properties || {};
            const geom = f.geometry;
            const rec = { ...props };
            // Re-attach geometry fields for convertRecord
            if (dsConfig.geometry_mode === "geo_shape") {
              rec[dsConfig.geometry_field] = f;
            } else if (dsConfig.geometry_mode === "geo_point_2d" && geom?.type === "Point") {
              rec[dsConfig.geometry_field] = { lat: geom.coordinates[1], lon: geom.coordinates[0] };
            } else if (dsConfig.geometry_mode === "latlon_field" && geom?.type === "Point") {
              rec[dsConfig.geometry_field] = { lat: geom.coordinates[1], lon: geom.coordinates[0] };
            }
            return convertRecord(rec, dsConfig, dno, layer_id);
          })
          .filter(Boolean);

        if (features.length > 0) {
          const { data: inserted, error: rpcError } = await supabase.rpc("batch_insert_geo_features", {
            _table_name: dsConfig.storage_table,
            _features_json: JSON.stringify(features),
          });
          if (rpcError) {
            console.error(`[dno-ingest] RPC error during streaming:`, rpcError);
            throw new Error(rpcError.message);
          }
          totalInserted += inserted ?? features.length;
        }
        totalSkipped += featureBatch.length - features.length;
        featureBatch = [];
        console.log(`[dno-ingest] Stream progress: ${totalInserted} inserted`);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        if (!inFeatures) {
          const idx = buffer.indexOf('"features"');
          if (idx === -1) {
            if (buffer.length > 1000) buffer = buffer.slice(-200);
            continue;
          }
          const bracketIdx = buffer.indexOf("[", idx);
          if (bracketIdx === -1) continue;
          inFeatures = true;
          buffer = buffer.slice(bracketIdx + 1);
          depth = 0;
          featureStart = -1;
        }

        let i = 0;
        while (i < buffer.length) {
          const ch = buffer[i];
          if (ch === "{") {
            if (depth === 0) featureStart = i;
            depth++;
          } else if (ch === "}") {
            depth--;
            if (depth === 0 && featureStart !== -1) {
              const featureStr = buffer.slice(featureStart, i + 1);
              try {
                featureBatch.push(JSON.parse(featureStr));
              } catch { /* skip malformed */ }
              featureStart = -1;
              if (featureBatch.length >= 500) {
                await flushBatch();
              }
            }
          } else if (ch === "]" && depth === 0) {
            break;
          }
          i++;
        }

        if (featureStart !== -1) {
          buffer = buffer.slice(featureStart);
          featureStart = 0;
        } else {
          buffer = "";
        }
      }

      // Flush remaining
      await flushBatch();
    } else {
      // Standard paginated path for datasets <= 10k
      let offset = 0;

      while (true) {
        const url = `${apiBase}?limit=${batch_size}&offset=${offset}`;
        console.log(`[dno-ingest] Fetching ${url}`);

        const resp = await fetch(url);
        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`[dno-ingest] API error ${resp.status}: ${errText}`);
          return new Response(
            JSON.stringify({ error: `DNO API error: ${resp.status}`, detail: errText, inserted: totalInserted }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const data = await resp.json();
        if (offset === 0) {
          totalRecords = data.total_count || totalRecords;
        }

        const records = data.results || [];
        if (records.length === 0) break;

        const features = records.map((rec: any) => convertRecord(rec, dsConfig, dno, layer_id)).filter(Boolean);

        if (features.length > 0) {
          const { data: inserted, error: rpcError } = await supabase.rpc("batch_insert_geo_features", {
            _table_name: dsConfig.storage_table,
            _features_json: JSON.stringify(features),
          });

          if (rpcError) {
            console.error(`[dno-ingest] RPC error at offset ${offset}:`, rpcError);
            return new Response(
              JSON.stringify({ error: rpcError.message, inserted: totalInserted, offset }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          totalInserted += inserted ?? features.length;
        }

        totalSkipped += records.length - features.length;
        offset += records.length;

        if (offset >= totalRecords) break;
      }
    }

    // Update feature count in layer_registry
    const { count } = await supabase
      .from(dsConfig.storage_table)
      .select("*", { count: "exact", head: true })
      .eq("layer_id", layer_id);

    await supabase
      .from("layer_registry")
      .update({ feature_count: count ?? 0, updated_at: new Date().toISOString() })
      .eq("id", layer_id);

    // Log to audit
    await supabase.from("audit_log").insert({
      action: "dno_api_ingest",
      user_id: user.id,
      meta_json: {
        dno,
        dataset_key,
        layer_id,
        total_records: totalRecords,
        inserted: totalInserted,
        skipped: totalSkipped,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        dno,
        dataset_key,
        total_api_records: totalRecords,
        inserted: totalInserted,
        skipped: totalSkipped,
        total_in_layer: count,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[dno-ingest] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Get a nested value from an object using dot notation */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

/** Convert an Opendatasoft record into the format expected by batch_insert_geo_features */
function convertRecord(
  rec: any,
  config: DatasetConfig,
  dno: string,
  layerId: string
): any | null {
  // Extract geometry
  let geom: any = null;

  if (config.geometry_mode === "latlon_field") {
    const locObj = getNestedValue(rec, config.geometry_field);
    if (!locObj || locObj.lat == null || locObj.lon == null) return null;
    geom = { type: "Point", coordinates: [locObj.lon, locObj.lat] };
  } else if (config.geometry_mode === "geo_point_2d") {
    const raw = rec[config.geometry_field];
    if (!raw) return null;
    if (typeof raw === "string") {
      const [lat, lon] = raw.split(",").map(Number);
      if (isNaN(lat) || isNaN(lon)) return null;
      geom = { type: "Point", coordinates: [lon, lat] };
    } else if (raw.lat != null && raw.lon != null) {
      geom = { type: "Point", coordinates: [raw.lon, raw.lat] };
    } else {
      return null;
    }
  } else if (config.geometry_mode === "geo_shape") {
    const shape = rec[config.geometry_field];
    if (!shape) return null;
    // Opendatasoft wraps geometry in a GeoJSON Feature
    geom = shape.geometry || shape;
    if (!geom || !geom.type || !geom.coordinates) return null;
  }

  if (!geom) return null;

  // Auto-promote single → multi for line/polygon tables
  if (geom.type === "LineString" && config.geometry_type === "LineString") {
    geom = { type: "MultiLineString", coordinates: [geom.coordinates] };
  }
  if (geom.type === "Polygon" && config.geometry_type === "MultiPolygon") {
    geom = { type: "MultiPolygon", coordinates: [geom.coordinates] };
  }

  // Apply field mappings
  const result: any = {
    geom_geojson: JSON.stringify(geom),
    layer_id: layerId,
    dno,
    name: null,
    asset_id: null,
    status: "active",
    attrs_json: {},
  };

  for (const mapping of config.field_mappings) {
    let value = getNestedValue(rec, mapping.source);
    if (value != null && mapping.multiply) {
      value = Number(value) * mapping.multiply;
    }
    result[mapping.target] = value ?? null;
  }

  // Collect additional attrs
  if (config.attrs_fields) {
    for (const field of config.attrs_fields) {
      const val = rec[field];
      if (val != null) {
        result.attrs_json[field] = val;
      }
    }
  }

  // Also store all original properties in attrs for reference
  const skipFields = new Set([config.geometry_field, "geo_point_2d", "geo_shape"]);
  for (const [key, val] of Object.entries(rec)) {
    if (!skipFields.has(key) && val != null && typeof val !== "object") {
      result.attrs_json[key] = val;
    }
  }

  return result;
}
