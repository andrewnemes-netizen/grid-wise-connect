import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function clientFor(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function geocode(q: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const m = q.trim().match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[3]), label: q };
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { "User-Agent": "gridwise-mcp/1.0" } });
  if (!r.ok) return null;
  const j = await r.json();
  if (!Array.isArray(j) || j.length === 0) return null;
  return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), label: j[0].display_name };
}

export default defineTool({
  name: "search_grid_assets",
  title: "Search UK grid assets",
  description:
    "Find UK substations near a place, postcode or 'lat,lng'. Optionally filter by minimum headroom (kW), maximum utilisation (%), and local authority. Returns ranked results with distance.",
  inputSchema: {
    location: z.string().describe("Place name, postcode, or 'lat,lng'."),
    radius_km: z.number().min(0.1).max(100).optional().describe("Search radius in km (default 10)."),
    min_headroom_kw: z.number().optional(),
    max_utilisation_pct: z.number().optional(),
    local_authority: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const loc = await geocode(args.location);
    if (!loc) {
      return {
        content: [{ type: "text", text: `Could not geocode "${args.location}".` }],
        isError: true,
      };
    }
    const radius_m = Math.round((args.radius_km ?? 10) * 1000);
    const max_rows = args.limit ?? 50;
    const { data, error } = await clientFor(ctx).rpc("advisor_search_site_utilisation", {
      center_lng: loc.lng,
      center_lat: loc.lat,
      radius_m,
      min_headroom: args.min_headroom_kw ?? null,
      max_util: args.max_utilisation_pct ?? null,
      la: args.local_authority ?? null,
      max_rows,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const results = Array.isArray(data) ? data : [];
    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} substations near ${loc.label}.\n\n${JSON.stringify(results, null, 2)}`,
        },
      ],
      structuredContent: { resolved_location: loc, results },
    };
  },
});