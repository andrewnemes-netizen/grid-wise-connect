import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IMAGE_PROMPTS: Record<string, string> = {
  "getting-started":
    "Create a clean UI mockup illustration of a web application login screen. Show an email field, password field, and a green 'Sign In' button. Include a sidebar on the left with navigation icons for Map, Portfolio, LA Programme, Admin, and Training. Title at top says 'Gridwise Connect'. Use a professional dark sidebar with white/green accents. Annotate with callout labels pointing to: 'Email field', 'Password field', 'Sign In button', 'Sidebar navigation'. Clean flat design style, 16:9 aspect ratio.",

  "map-navigation":
    "Create a clean UI mockup illustration of a geographic mapping application. Show a UK map in the center with a search bar labeled 'Search postcode...' in the top-left. Include a basemap switcher in bottom-left showing Street/Satellite/Light/Dark options. Show a DNO dropdown filter, a layer toggle panel on the right side, and a legend in the bottom-right corner showing colour-coded utilisation levels (green to red). Annotate with callout labels: 'Postcode Search', 'Basemap Switcher', 'DNO Filter', 'Layer Panel', 'Map Legend', 'Zoom Controls'. Professional flat design, 16:9 aspect ratio.",

  "map-tools":
    "Create a clean UI mockup illustration showing a vertical toolbar on the right side of a map. The toolbar has 5 tool buttons stacked vertically: Pin icon (Drop Pin), Pentagon icon (Boundary), Cable icon (Connect), Dashed square icon (Polygon Search), Ruler icon (Measure). Also show Clear All (trash) and Reset View (compass) buttons. Each button should have an annotated callout label. Below the toolbar show a small map area with an example drawn polygon and a dropped pin. Professional flat design style, 16:9 aspect ratio.",

  "site-intelligence":
    "Create a clean UI mockup illustration of a site intelligence panel overlaid on a map. The panel is on the left side and shows: a traffic light viability score (GREEN circle with score 78/100), Grid Readiness showing 'Strong' with a green badge, Deployment Class showing 'Fast Deploy', Connection Cost showing '££' band with £45,000 estimate, and buttons for 'Save Assessment' and 'Download PDF'. On the map behind, show a dropped pin marker. Annotate key sections with callout labels. Professional flat design, 16:9 aspect ratio.",

  "connect-assessment":
    "Create a clean UI mockup illustration showing a cable route drawn on a map between two points, with waypoints along roads. On the right side show a Connect Assessment panel with: Route Length (450m), Cable Cost breakdown (LV cable £12,000), Excavation costs (Carriageway £8,000, Footway £3,000), Jointing (£2,500), Switchgear (£15,000), subtotals, Design Fee 8%, PM Fee 5%, Contingency 10%, and Total £52,000. Annotate with callout labels. Professional flat design, 16:9 aspect ratio.",

  "portfolio":
    "Create a clean UI mockup illustration of a portfolio table view. Show a data table with columns: Site Name, Postcode, Proposed kW, Score (with coloured badges GREEN/AMBER/RED), Grid Readiness, Deployment Class, Cost Band, Status. Show 5 example rows with realistic UK site data. Above the table show filter dropdowns and a search bar. Include action buttons: Compare, Export CSV. Each row has an eye icon for detail view. Professional flat design, 16:9 aspect ratio.",

  "quick-estimate":
    "Create a clean UI mockup illustration of a simple Quick Estimate form page. Show a clean white card in the center with: a title 'Quick Estimate', a postcode input field with example 'NE1 4LP', a proposed load input showing '250 kW', and a prominent green button 'Get Instant Assessment'. Below show a result card with Viability Score (Amber, 62/100) and Budget Estimate (££, ~£55,000). Annotate with callout labels. Professional flat design, 16:9 aspect ratio.",

  "la-programme":
    "Create a clean UI mockup illustration of an LA Programme dashboard. Show two tabs: 'CSV Upload' and 'Dashboard'. In the CSV Upload view show a drag-and-drop file upload area with a file icon. In the Dashboard section below show summary statistics cards (Total Sites: 47, Average Score: 71, Green Sites: 23) and a bar chart showing site scores distribution. Annotate with callout labels. Professional flat design, 16:9 aspect ratio.",

  "admin":
    "Create a clean UI mockup illustration of an Admin panel with three tabs: Layer Management, Data Upload, Unit Rates. Show the Layer Management tab active with a table listing layers: columns for Layer Name, DNO, Category, Features, Enabled (toggle switches). Show a few example rows like 'HV Cables - NPEN', 'Primary Substations - NPEN'. Below show a Unit Rates section with input fields for Cable LV (£/m), Cable HV (£/m), Excavation Carriageway (£/m). Annotate with callout labels. Professional flat design, 16:9 aspect ratio.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { sectionId } = await req.json();
    const prompt = IMAGE_PROMPTS[sectionId];
    if (!prompt) {
      return new Response(JSON.stringify({ error: `Unknown section: ${sectionId}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate image using Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Failed to generate image" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "No image generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract base64 data and upload to storage
    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const fileName = `${sectionId}.png`;

    // Use service role to upload
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: uploadError } = await serviceSupabase.storage
      .from("training-images")
      .upload(fileName, binaryData, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to save image" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = serviceSupabase.storage
      .from("training-images")
      .getPublicUrl(fileName);

    return new Response(
      JSON.stringify({ success: true, url: urlData.publicUrl, sectionId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
