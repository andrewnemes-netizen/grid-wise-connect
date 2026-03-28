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

const CHUNK_LIMIT = 40000; // eligible records per invocation

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action as string;
    const offset = typeof body.offset === "number" ? body.offset : 0;

    if (action !== "ingest") {
      return new Response(JSON.stringify({ error: "Unknown action. Use 'ingest'." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth
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

    // Get layer
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

    // Process synchronously (no waitUntil) so we can return progress
    const result = await processNaptanChunk(serviceClient, layerMeta.id, offset);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("NaPTAN ingest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

async function processNaptanChunk(
  serviceClient: any,
  layerId: string,
  startOffset: number
): Promise<{ done: boolean; next_offset?: number; inserted: number; chunk_inserted: number; message: string }> {
  console.log(`NaPTAN chunk: offset=${startOffset}, limit=${CHUNK_LIMIT}`);

  const csvResp = await fetch(NAPTAN_CSV_URL);
  if (!csvResp.ok || !csvResp.body) {
    throw new Error(`NaPTAN CSV download failed: ${csvResp.status}`);
  }

  const reader = csvResp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let header: string[] | null = null;
  let headerIndices: Record<string, number> = {};

  let lineNum = 0;
  let eligibleCount = 0;
  let chunkInserted = 0;
  let batch: any[] = [];
  const batchSize = 500;

  const flush = async () => {
    if (batch.length === 0) return;
    const { error: insertErr } = await serviceClient
      .from("geo_points")
      .upsert(batch, { onConflict: "layer_id,asset_id", ignoreDuplicates: true });
    if (insertErr) {
      console.error(`NaPTAN insert error at ~line ${lineNum}:`, insertErr);
    } else {
      chunkInserted += batch.length;
    }
    batch = [];
  };

  let reachedEnd = true;
  let nextOffset = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      lineNum++;

      if (!header) {
        header = parseCSVLine(line);
        for (let i = 0; i < header.length; i++) {
          headerIndices[header[i]] = i;
        }
        continue;
      }

      // Skip lines before offset
      if (lineNum <= startOffset) continue;

      const cols = parseCSVLine(line);

      const stopType = cols[headerIndices["StopType"]] || "";
      if (!KEEP_STOP_TYPES.has(stopType)) continue;

      const status = cols[headerIndices["Status"]] || "";
      if (status && status.toLowerCase() !== "active" && status.toLowerCase() !== "new") continue;

      const lat = parseFloat(cols[headerIndices["Latitude"]] || "");
      const lon = parseFloat(cols[headerIndices["Longitude"]] || "");
      if (!lat || !lon || isNaN(lat) || isNaN(lon)) continue;

      eligibleCount++;
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
      }

      // Check chunk limit
      if (eligibleCount >= CHUNK_LIMIT) {
        await flush();
        // Cancel the reader to stop downloading
        await reader.cancel();
        reachedEnd = false;
        nextOffset = lineNum;
        break;
      }
    }

    if (!reachedEnd) break;
  }

  // Process remaining buffer if we haven't hit limit
  if (reachedEnd && buffer.trim() && header) {
    lineNum++;
    if (lineNum > startOffset) {
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
  }

  await flush();

  // Update layer feature count
  const { data: countData } = await serviceClient
    .from("geo_points")
    .select("id", { count: "exact", head: true })
    .eq("layer_id", layerId);

  const totalCount = countData?.length ?? chunkInserted;

  await serviceClient
    .from("layer_registry")
    .update({ feature_count: totalCount, updated_at: new Date().toISOString() })
    .eq("id", layerId);

  console.log(`NaPTAN chunk done: ${chunkInserted} inserted this chunk, reachedEnd=${reachedEnd}`);

  return {
    done: reachedEnd,
    next_offset: reachedEnd ? undefined : nextOffset,
    inserted: totalCount,
    chunk_inserted: chunkInserted,
    message: reachedEnd
      ? `NaPTAN complete: ${totalCount} total records`
      : `NaPTAN chunk: ${chunkInserted} inserted, resuming from offset ${nextOffset}`,
  };
}
