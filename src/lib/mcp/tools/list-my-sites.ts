import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function clientFor(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_sites",
  title: "List my sites",
  description:
    "List sites in the signed-in user's portfolio. Returns site name, postcode, coordinates, DNO, voltage and creation date. Scoped by the app's RLS policies.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)."),
    search: z.string().optional().describe("Case-insensitive substring match on site name or postcode."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, search }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = clientFor(ctx);
    let q = supabase
      .from("sites")
      .select("id, site_name, postcode, lat, lng, dno, voltage_level, proposed_kw, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or(`site_name.ilike.${s},postcode.ilike.${s}`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { sites: data ?? [] },
    };
  },
});