import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * NaPTAN Transport Nodes Ingestion
 *
 * Fetches bus stops, rail stations, tram stops etc from the NaPTAN API
 * and stores them as geo_points for the transport accessibility layer.
 *
 * Actions:
 *  - ingest: Paginate all access nodes, write to geo_points
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
    const userId = userData.user.id;
    const { data: isAdmin } = await serviceClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find layer registry entry
    const { data: layerMeta } = await serviceClient
      .from("layer_registry")
      .select("id")
      .eq("slug", "naptan_transport_nodes")
      .single();

    if (!layerMeta) {
      return new Response(JSON.stringify({ error: "Layer registry entry not found for naptan_transport_nodes" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const layerId = layerMeta.id;
    let totalInserted = 0;
    let pageNum = 1;
    const pageSize = 1000;

    // Filter to main stop types: bus (BCT), rail (RLY), tram/metro (MET, PLT), ferry (FER)
    const stopTypes = ["BCT", "RLY", "MET", "PLT", "FER"];

    for (const stopType of stopTypes) {
      pageNum = 1;
      while (true) {
        const offset = (pageNum - 1) * pageSize;
        const url = `https://naptan.api.dft.gov.uk/v1/access-nodes?stopTypes=${stopType}&page=${pageNum}&pageSize=${pageSize}`;
        console.log(`Fetching NaPTAN ${stopType} page ${pageNum}: ${url}`);

        let resp: Response;
        try {
          resp = await fetch(url, {
            headers: { "Accept": "application/json" },
          });
        } catch (fetchErr) {
          console.error(`Fetch error for ${stopType} page ${pageNum}:`, fetchErr);
          break;
        }

        if (!resp.ok) {
          console.error(`NaPTAN API error on ${stopType} page ${pageNum}: ${resp.status}`);
          // Try to consume response body
          try { await resp.text(); } catch {}
          break;
        }

        let nodes: any[];
        try {
          const json = await resp.json();
          nodes = Array.isArray(json) ? json : (json.stops || json.data || json.member || []);
        } catch {
          console.error(`JSON parse error for ${stopType} page ${pageNum}`);
          break;
        }

        if (nodes.length === 0) break;

        const geoRows = nodes
          .filter((n: any) => n.latitude && n.longitude)
          .map((n: any) => ({
            layer_id: layerId,
            dno: "National",
            asset_id: n.atcoCode || n.naptanCode || String(n.id),
            name: n.commonName || n.localityName || `${stopType} Stop`,
            geom: `SRID=4326;POINT(${n.longitude} ${n.latitude})`,
            attrs_json: {
              atco_code: n.atcoCode,
              naptan_code: n.naptanCode,
              stop_type: n.stopType || stopType,
              bearing: n.bearing,
              locality_name: n.localityName,
              parent_locality: n.parentLocalityName,
              indicator: n.indicator,
              street: n.street,
              status: n.status,
              node_type: stopType === "RLY" ? "rail" : stopType === "BCT" ? "bus" : stopType === "MET" || stopType === "PLT" ? "tram" : "ferry",
            },
          }));

        if (geoRows.length > 0) {
          // Batch in chunks of 500
          for (let i = 0; i < geoRows.length; i += 500) {
            const batch = geoRows.slice(i, i + 500);
            const { error: insertErr } = await serviceClient
              .from("geo_points")
              .upsert(batch, { onConflict: "layer_id,asset_id", ignoreDuplicates: true });
            if (insertErr) {
              console.error(`Insert error ${stopType} page ${pageNum} batch ${i}:`, insertErr);
            } else {
              totalInserted += batch.length;
            }
          }
        }

        if (nodes.length < pageSize) break;
        pageNum++;
        // Rate limit
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Update feature count
    await serviceClient
      .from("layer_registry")
      .update({ feature_count: totalInserted, updated_at: new Date().toISOString() })
      .eq("id", layerId);

    return new Response(
      JSON.stringify({ success: true, total_inserted: totalInserted }),
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
