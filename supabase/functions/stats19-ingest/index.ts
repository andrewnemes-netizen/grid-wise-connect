import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STATS19_URL =
  "https://data.dft.gov.uk/road-accidents-safety-data/dft-road-casualty-statistics-collision-last-5-years.csv";

/**
 * STATS19 Road Accident Data Ingestion
 *
 * Downloads the last 5 years of collision data from DfT,
 * parses CSV, and stores as geo_points for the accident hotspot layer.
 */
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

    // Auth check
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

    // Find layer
    const { data: layerMeta } = await serviceClient
      .from("layer_registry")
      .select("id")
      .eq("slug", "stats19_accidents")
      .single();

    if (!layerMeta) {
      return new Response(JSON.stringify({ error: "Layer not found for stats19_accidents" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const layerId = layerMeta.id;

    // Download CSV
    console.log("Downloading STATS19 CSV...");
    const csvResp = await fetch(STATS19_URL);
    if (!csvResp.ok) {
      return new Response(JSON.stringify({ error: `CSV download failed: ${csvResp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const csvText = await csvResp.text();
    const lines = csvText.split("\n");
    const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));

    // Find column indices
    const idxAccidentIndex = header.findIndex((h) => h.toLowerCase().includes("accident_index"));
    const idxLat = header.findIndex((h) => h.toLowerCase() === "latitude");
    const idxLon = header.findIndex((h) => h.toLowerCase() === "longitude");
    const idxSeverity = header.findIndex((h) => h.toLowerCase().includes("accident_severity"));
    const idxDate = header.findIndex((h) => h.toLowerCase() === "date");
    const idxDay = header.findIndex((h) => h.toLowerCase().includes("day_of_week"));
    const idxRoadClass = header.findIndex((h) => h.toLowerCase().includes("road_class") || h.toLowerCase().includes("first_road_class"));
    const idxRoadNumber = header.findIndex((h) => h.toLowerCase().includes("first_road_number"));
    const idxSpeedLimit = header.findIndex((h) => h.toLowerCase().includes("speed_limit"));
    const idxLightConditions = header.findIndex((h) => h.toLowerCase().includes("light_conditions"));
    const idxWeather = header.findIndex((h) => h.toLowerCase().includes("weather_conditions"));
    const idxRoadSurface = header.findIndex((h) => h.toLowerCase().includes("road_surface"));
    const idxCasualties = header.findIndex((h) => h.toLowerCase().includes("number_of_casualties"));
    const idxVehicles = header.findIndex((h) => h.toLowerCase().includes("number_of_vehicles"));
    const idxUrbanRural = header.findIndex((h) => h.toLowerCase().includes("urban_or_rural"));
    const idxLocalAuth = header.findIndex((h) => h.toLowerCase().includes("local_authority"));

    console.log(`CSV has ${lines.length - 1} data rows. Header cols: ${header.length}`);

    let totalInserted = 0;
    let skipped = 0;
    const batchSize = 500;
    let batch: any[] = [];

    // Severity mapping
    const severityMap: Record<string, string> = { "1": "Fatal", "2": "Serious", "3": "Slight" };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Simple CSV parse (DfT data uses simple comma separation)
      const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));

      const lat = parseFloat(cols[idxLat]);
      const lon = parseFloat(cols[idxLon]);
      if (!lat || !lon || isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
        skipped++;
        continue;
      }

      const accidentIndex = cols[idxAccidentIndex] || `stats19_${i}`;
      const severityCode = cols[idxSeverity] || "3";
      const severity = severityMap[severityCode] || "Slight";

      batch.push({
        layer_id: layerId,
        dno: "National",
        asset_id: accidentIndex,
        name: `${severity} collision`,
        geom: `SRID=4326;POINT(${lon} ${lat})`,
        attrs_json: {
          accident_index: accidentIndex,
          severity,
          severity_code: parseInt(severityCode) || 3,
          date: cols[idxDate] || null,
          day_of_week: cols[idxDay] || null,
          road_class: cols[idxRoadClass] || null,
          road_number: cols[idxRoadNumber] || null,
          speed_limit: parseInt(cols[idxSpeedLimit]) || null,
          light_conditions: cols[idxLightConditions] || null,
          weather: cols[idxWeather] || null,
          road_surface: cols[idxRoadSurface] || null,
          number_of_casualties: parseInt(cols[idxCasualties]) || null,
          number_of_vehicles: parseInt(cols[idxVehicles]) || null,
          urban_rural: cols[idxUrbanRural] || null,
          local_authority: cols[idxLocalAuth] || null,
        },
      });

      if (batch.length >= batchSize) {
        const { error: insertErr } = await serviceClient
          .from("geo_points")
          .upsert(batch, { onConflict: "layer_id,asset_id", ignoreDuplicates: true });
        if (insertErr) {
          console.error(`Insert error at row ${i}:`, insertErr);
        } else {
          totalInserted += batch.length;
        }
        batch = [];

        // Log progress every 10k
        if (totalInserted % 10000 === 0) {
          console.log(`STATS19 progress: ${totalInserted} inserted, ${skipped} skipped`);
        }
      }
    }

    // Final batch
    if (batch.length > 0) {
      const { error: insertErr } = await serviceClient
        .from("geo_points")
        .upsert(batch, { onConflict: "layer_id,asset_id", ignoreDuplicates: true });
      if (insertErr) {
        console.error("Final batch error:", insertErr);
      } else {
        totalInserted += batch.length;
      }
    }

    // Update feature count
    await serviceClient
      .from("layer_registry")
      .update({ feature_count: totalInserted, updated_at: new Date().toISOString() })
      .eq("id", layerId);

    return new Response(
      JSON.stringify({ success: true, total_inserted: totalInserted, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("STATS19 ingest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
