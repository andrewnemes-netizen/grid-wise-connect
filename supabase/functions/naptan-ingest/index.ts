import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NAPTAN_CSV_URL =
  "https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv";

const KEEP_STOP_TYPES = new Set(["BCT", "RLY", "MET", "PLT", "FER", "RSE", "TMU"]);

const NODE_TYPE_MAP: Record<string, string> = {
  BCT: "bus", RLY: "rail", RSE: "rail", MET: "tram", PLT: "tram", TMU: "tram", FER: "ferry",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action !== "ingest") {
      return new Response(JSON.stringify({ error: "Unknown action. Use 'ingest'." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isAdmin } = await serviceClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: layerMeta } = await serviceClient
      .from("layer_registry")
      .select("id")
      .eq("slug", "naptan_transport_nodes")
      .single();

    if (!layerMeta) {
      return new Response(JSON.stringify({ error: "Layer not found for naptan_transport_nodes" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processNaptanStreaming(serviceClient, layerMeta.id));

    return new Response(
      JSON.stringify({
        success: true,
        message: "NaPTAN ingestion started in background (streaming mode). Check layer_registry feature_count for progress.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("NaPTAN ingest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Parse a single CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        cols.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  cols.push(cur.trim());
  return cols;
}

async function processNaptanStreaming(serviceClient: any, layerId: string) {
  try {
    console.log("Downloading NaPTAN CSV (streaming)...");
    const csvResp = await fetch(NAPTAN_CSV_URL);
    if (!csvResp.ok || !csvResp.body) {
      console.error(`NaPTAN CSV download failed: ${csvResp.status}`);
      return;
    }

    const reader = csvResp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let header: string[] | null = null;
    let headerIndices: Record<string, number> = {};

    let totalInserted = 0;
    let skipped = 0;
    let batch: any[] = [];
    const batchSize = 500;
    let lineNum = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      const { error: insertErr } = await serviceClient
        .from("geo_points")
        .upsert(batch, { onConflict: "layer_id,asset_id", ignoreDuplicates: true });
      if (insertErr) {
        console.error(`NaPTAN insert error at ~line ${lineNum}:`, insertErr);
      } else {
        totalInserted += batch.length;
      }
      batch = [];
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      // Keep last partial line in buffer
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        lineNum++;

        // First line is header
        if (!header) {
          header = parseCSVLine(line);
          for (let i = 0; i < header.length; i++) {
            headerIndices[header[i]] = i;
          }
          console.log(`NaPTAN header parsed: ${header.length} cols`);
          continue;
        }

        const cols = parseCSVLine(line);

        const stopType = cols[headerIndices["StopType"]] || "";
        if (!KEEP_STOP_TYPES.has(stopType)) { skipped++; continue; }

        const status = cols[headerIndices["Status"]] || "";
        if (status && status.toLowerCase() !== "active" && status.toLowerCase() !== "new") { skipped++; continue; }

        const lat = parseFloat(cols[headerIndices["Latitude"]] || "");
        const lon = parseFloat(cols[headerIndices["Longitude"]] || "");
        if (!lat || !lon || isNaN(lat) || isNaN(lon)) { skipped++; continue; }

        const atcoCode = cols[headerIndices["ATCOCode"]] || `naptan_${lineNum}`;

        batch.push({
          layer_id: layerId,
          dno: "National",
          asset_id: atcoCode,
          name: cols[headerIndices["CommonName"]] || `${stopType} Stop`,
          geom: `SRID=4326;POINT(${lon} ${lat})`,
          attrs_json: {
            atco_code: atcoCode,
            naptan_code: cols[headerIndices["NaptanCode"]] || null,
            stop_type: stopType,
            node_type: NODE_TYPE_MAP[stopType] || "bus",
            locality_name: cols[headerIndices["LocalityName"]] || null,
            parent_locality: cols[headerIndices["ParentLocalityName"]] || null,
            street: cols[headerIndices["Street"]] || null,
            indicator: cols[headerIndices["Indicator"]] || null,
            bearing: cols[headerIndices["Bearing"]] || null,
            status: status || null,
          },
        });

        if (batch.length >= batchSize) {
          await flush();
          if (totalInserted % 10000 === 0 && totalInserted > 0) {
            console.log(`NaPTAN progress: ${totalInserted} inserted, ${skipped} skipped`);
            await serviceClient
              .from("layer_registry")
              .update({ feature_count: totalInserted, updated_at: new Date().toISOString() })
              .eq("id", layerId);
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim() && header) {
      const cols = parseCSVLine(buffer.trim());
      const stopType = cols[headerIndices["StopType"]] || "";
      if (KEEP_STOP_TYPES.has(stopType)) {
        const status = cols[headerIndices["Status"]] || "";
        const lat = parseFloat(cols[headerIndices["Latitude"]] || "");
        const lon = parseFloat(cols[headerIndices["Longitude"]] || "");
        if (lat && lon && !isNaN(lat) && !isNaN(lon) &&
            (!status || status.toLowerCase() === "active" || status.toLowerCase() === "new")) {
          const atcoCode = cols[headerIndices["ATCOCode"]] || `naptan_final`;
          batch.push({
            layer_id: layerId, dno: "National", asset_id: atcoCode,
            name: cols[headerIndices["CommonName"]] || `${stopType} Stop`,
            geom: `SRID=4326;POINT(${lon} ${lat})`,
            attrs_json: {
              atco_code: atcoCode, naptan_code: cols[headerIndices["NaptanCode"]] || null,
              stop_type: stopType, node_type: NODE_TYPE_MAP[stopType] || "bus",
              locality_name: cols[headerIndices["LocalityName"]] || null,
              parent_locality: cols[headerIndices["ParentLocalityName"]] || null,
              street: cols[headerIndices["Street"]] || null,
              indicator: cols[headerIndices["Indicator"]] || null,
              bearing: cols[headerIndices["Bearing"]] || null, status: status || null,
            },
          });
        }
      }
    }

    // Final flush
    await flush();

    await serviceClient
      .from("layer_registry")
      .update({ feature_count: totalInserted, updated_at: new Date().toISOString() })
      .eq("id", layerId);

    console.log(`NaPTAN complete: ${totalInserted} inserted, ${skipped} skipped`);
  } catch (err) {
    console.error("NaPTAN streaming error:", err);
  }
}
