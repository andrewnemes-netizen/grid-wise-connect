import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMySites from "./tools/list-my-sites";
import listMyStudies from "./tools/list-my-studies";
import searchGridAssets from "./tools/search-grid-assets";

// Build the OAuth issuer from the Supabase project ref. This must be the
// direct supabase.co host so the issuer matches the discovery document.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "gridwise-connect-mcp",
  title: "Gridwise Connect",
  version: "0.1.0",
  instructions:
    "Tools for Gridwise Connect — a UK EV grid-connection intelligence platform. Use `search_grid_assets` to find substations near a location, `list_my_sites` for the signed-in user's portfolio sites, and `list_my_studies` for their saved studies. All data is scoped to the signed-in user by row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchGridAssets, listMySites, listMyStudies],
});