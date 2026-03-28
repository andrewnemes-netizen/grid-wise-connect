import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NAPTAN_CSV_URL =
  "https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv";

// Key stop types to ingest
const KEEP_STOP_TYPES = new Set(["BCT", "RLY", "MET", "PLT", "FER", "RSE", "TMU"]);

// Map stop type codes to friendly node_type
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

    // Background processing
    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processNaptan(serviceClient, layerMeta.id));

    return new Response(
      JSON.stringify({
        success: true,
        message: "NaPTAN ingestion started in background. Check layer_registry feature_count for progress.",
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

async function processNaptan(serviceClient: any, layerId: string) {
  try {
    console.log("Downloading NaPTAN CSV...");
    const csvResp = await fetch(NAPTAN_CSV_URL);
    if (!csvResp.ok) {
      console.error(`NaPTAN CSV download failed: ${csvResp.status}`);
      return;
    }

    const csvText = await csvResp.text();
    const lines = csvText.split("\n");
    const header = lines[0].split(",").map((h: string) => h.trim().replace(/"/g, ""));

    // Find column indices
    const idx = (name: string) => header.findIndex((h: string) => h === name);
    const iAtco = idx("ATCOCode");
    const iNaptan = idx("NaptanCode");
    const iName = idx("CommonName");
    const iLat = idx("Latitude");
    const iLon = idx("Longitude");
    const iStopType = idx("StopType");
    const iLocality = idx("LocalityName");
    const iParentLocality = idx("ParentLocalityName");
    const iStreet = idx("Street");
    const iIndicator = idx("Indicator");
    const iBearing = idx("Bearing");
    const iStatus = idx("Status");

    console.log(`NaPTAN CSV: ${lines.length - 1} rows, ${header.length} cols`);

    let totalInserted = 0;
    let skipped = 0;
    const batchSize = 500;
    let batch: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(",").map((c: string) => c.trim().replace(/"/g, ""));

      const stopType = cols[iStopType];
      if (!KEEP_STOP_TYPES.has(stopType)) {
        skipped++;
        continue;
      }

      // Check status — skip inactive
      const status = cols[iStatus];
      if (status && status.toLowerCase() !== "active" && status.toLowerCase() !== "new") {
        skipped++;
        continue;
      }

      const lat = parseFloat(cols[iLat]);
      const lon = parseFloat(cols[iLon]);
      if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        skipped++;
        continue;
      }

      const atcoCode = cols[iAtco] || `naptan_${i}`;

      batch.push({
        layer_id: layerId,
        dno: "National",
        asset_id: atcoCode,
        name: cols[iName] || `${stopType} Stop`,
        geom: `SRID=4326;POINT(${lon} ${lat})`,
        attrs_json: {
          atco_code: atcoCode,
          naptan_code: cols[iNaptan] || null,
          stop_type: stopType,
          node_type: NODE_TYPE_MAP[stopType] || "bus",
          locality_name: cols[iLocality] || null,
          parent_locality: cols[iParentLocality] || null,
          street: cols[iStreet] || null,
          indicator: cols[iIndicator] || null,
          bearing: cols[iBearing] || null,
          status: status || null,
        },
      });

      if (batch.length >= batchSize) {
        const { error: insertErr } = await serviceClient
          .from("geo_points")
          .upsert(batch, { onConflict: "layer_id,asset_id", ignoreDuplicates: true });
        if (insertErr) {
          console.error(`NaPTAN insert error at row ${i}:`, insertErr);
        } else {
          totalInserted += batch.length;
        }
        batch = [];

        if (totalInserted % 10000 === 0) {
          console.log(`NaPTAN progress: ${totalInserted} inserted, ${skipped} skipped`);
          await serviceClient
            .from("layer_registry")
            .update({ feature_count: totalInserted, updated_at: new Date().toISOString() })
            .eq("id", layerId);
        }
      }
    }

    // Final batch
    if (batch.length > 0) {
      const { error: insertErr } = await serviceClient
        .from("geo_points")
        .upsert(batch, { onConflict: "layer_id,asset_id", ignoreDuplicates: true });
      if (insertErr) {
        console.error("NaPTAN final batch error:", insertErr);
      } else {
        totalInserted += batch.length;
      }
    }

    await serviceClient
      .from("layer_registry")
      .update({ feature_count: totalInserted, updated_at: new Date().toISOString() })
      .eq("id", layerId);

    console.log(`NaPTAN complete: ${totalInserted} inserted, ${skipped} skipped`);
  } catch (err) {
    console.error("NaPTAN background processing error:", err);
  }
}
