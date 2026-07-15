
# Gridwise AI Platform — MCP Server (Phase 1 Architecture)

Read-only Phase 1. No write tools. Builds on the existing `@lovable.dev/mcp-js` server at `src/lib/mcp/` (bundled to `supabase/functions/mcp/index.ts`) that already has Supabase OAuth 2.1, `/.well-known/oauth-protected-resource`, and 3 tools (`search_grid_assets`, `list_my_sites`, `list_my_studies`).

---

## 1. MCP Architecture

```
AI Assistant (Claude / ChatGPT / Gemini / Cursor)
        │ HTTPS + OAuth 2.1 bearer
        ▼
Supabase Edge Function: /functions/v1/mcp   (@lovable.dev/mcp-js)
        │  token verify → user_id, client_id, claims
        ▼
Tool Registry  (src/lib/mcp/tools/*)
        │  permission gate → audit start
        ▼
Domain layer (existing, unchanged)
  ├─ Supabase RLS (per-user + per-org)
  ├─ PostGIS RPCs (advisor_search_*, ST_DWithin)
  ├─ Engineering: src/lib/gridwise/*, src/lib/evHub/*
  ├─ Estimating:  src/lib/connectionCosts.ts, unit_rates, rate_items
  ├─ PM:          projects, work_packages, project_tasks
  └─ Documents:   Supabase Storage buckets
        │  result
        ▼
Audit log write → response to AI
```

**Boundaries**
- MCP function = thin dispatcher; no engineering math lives in the function.
- Tools call existing RPCs / edge functions / lib helpers — never re-implement.
- All DB access uses the per-request Supabase client with the user's forwarded token, so RLS applies as that user.

---

## 2. Tool Registry (Phase 1 — read-only subset)

Each `defineTool` file under `src/lib/mcp/tools/`. Registered in `src/lib/mcp/index.ts`.

| Category | Phase-1 tools | Backing implementation |
|---|---|---|
| GIS | `search_sites`, `search_substations`, `search_feeder_pillars`, `search_lv_assets`, `search_hv_assets`, `search_transformers`, `search_postcodes`, `search_local_authorities`, `find_sites_within_radius`, `rank_candidate_sites` | PostGIS RPCs on `sites`, `geo_substations`, `geo_points`, `geo_cables`, `site_utilisation`; Nominatim geocode; `advisor_search_site_utilisation` |
| Grid Connection | `run_capacity_assessment`, `find_best_connection`, `calculate_headroom`, `calculate_distance` | `feasibilityEngine`, `assetEngine`, existing edge fn `dno-capacity-lookup` |
| Engineering (read-only) | `run_voltage_drop`, `run_fault_level`, `run_cable_selection`, `run_dno_rules`, `run_g81_validation`, `validate_route`, `calculate_cable_lengths` | `electricalEngine`, `evHub/electricalSizing`, `evHub/cableSelection`, `apply-dno-rules` edge fn, `roadRoute` |
| Estimating (read-only) | `get_rate_card`, `get_recipe`, `calculate_boq`, `calculate_cost`, `compare_estimates` | `unit_rates`, `rate_items`, `estimate_recipes`, `evHub/boqGenerator`, `connectionCosts` |
| PM (read-only) | `get_project_summary`, `get_work_package_summary`, `get_delivery_risk`, `list_my_programmes`, `list_my_projects` | `projects`, `work_packages`, `project_tasks` |
| Reporting | `generate_estimate_pdf`, `generate_client_report` (returns signed Storage URL) | `quotation-pdf`, `generateAssessmentPdf` invoked server-side |
| Documents | `find_documents`, `read_document`, `summarise_document` | `project_files`, `site_handover_docs`, Storage signed URLs, Lovable AI Gateway for summarise |
| Commercial (read-only) | `project_budget`, `variation_summary`, `invoice_summary` | `revenue_projects`, `revenue_invoices`, `wp_estimate_variations` |
| AI Search | `semantic_search`, `natural_language_query`, `search_everything` | pgvector table (new — see §9) + Lovable AI embeddings |

**Deferred to Phase 2+ (write tools):** every `create_*`, `update_*`, `assign_*`, `approve_*`, `run_gridwise_connect`, `run_ev_hub`, `calculate_reinforcement`, `calculate_connection_cost` (persisted), `attach_document`, `upload_photo`, `generate_dno_pack`, `generate_construction_pack`, `generate_excel_export`.

Missing categories that exist in the request but have **no backing data today** and are dropped from Phase 1 with a note in the summary: `search_joint_bays`, `search_roads`, `assign_resources`, `forecast_margin`, `forecast_cashflow`, `procurement_summary`, `retrieve_photo`. These re-enter once the underlying tables/features exist.

---

## 3. Tool Schemas (conventions)

Every tool file exports `defineTool({ name, title, description, inputSchema, annotations, handler })`.

- `inputSchema`: Zod object, small & flat, no `.min/.max` chains on strings the model must produce (schema limits stated in `description` instead).
- `annotations`: always set `readOnlyHint: true, idempotentHint: true, openWorldHint: <bool>` for Phase 1.
- Response shape: `{ content: [{type:"text", text: humanSummary}], structuredContent: {…machine JSON…}, isError? }`.
- Never include tokens, service-role responses, or other users' rows in `structuredContent`.
- Every tool starts with `if (!ctx.isAuthenticated()) return { isError:true, … }`.

---

## 4. Authentication

Already active — reuse it, do not rebuild.
- **OAuth 2.1** via `supabase--configure_oauth_server` (done). Consent route: to add at `/.lovable/oauth/consent` (currently missing — Phase 1 gap, required before Claude/ChatGPT can complete auth).
- **JWT verification**: `@lovable.dev/mcp-js` verifies Supabase-issued access tokens against `https://<ref>.supabase.co/auth/v1` with audience `authenticated`.
- **API keys**: Phase 1 uses OAuth tokens only. A separate `mcp_api_keys` table (hashed, scoped, revocable) is designed but not implemented until Phase 2.
- No service-role key anywhere in `src/lib/mcp/**` — enforced by convention + a lint rule.

---

## 5. Permissions

Two layers, both required:

1. **RLS (existing)** — every tool query runs as the caller. `user_roles`, `org_members`, `sites.org_id`, `studies.org_id` policies already scope data.
2. **Tool-level role gate** — new helper `assertToolAllowed(ctx, toolName)` reads roles from `user_roles` + `profiles.is_platform_admin` and checks against a matrix:

| Role | GIS | GridConn | Eng | Estimating | PM read | Commercial | Reporting | Docs | Search |
|---|---|---|---|---|---|---|---|---|---|
| Admin / MD | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Commercial | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Estimator | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ |
| Designer / Engineer | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ |
| Programme / Project Mgr | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Supervisor / Installer | ✓ | – | – | – | site-scope | – | site-only | ✓ | ✓ |
| Client | own sites | own sites | – | own | own | own | own | own | own |
| DNO | assigned only | assigned | – | – | – | – | assigned | assigned | ✓ |

New role enum values required: `managing_director`, `commercial`, `estimator`, `designer`, `programme_manager`, `project_manager`, `supervisor`, `installer`, `dno`. Existing app_role enum has `admin | engineer | client` — extended in the same migration.

---

## 6. Conversation Context Model

MCP is stateless per call, so context = OAuth client claims + explicit args + a small server-side session table.

New table `mcp_sessions`:
- `id` uuid PK, `user_id`, `client_id` (OAuth client), `account_id` nullable, `current_programme_id`, `current_work_package_id`, `current_site_id`, `current_estimate_id`, `current_project_id`, `updated_at`.
- Two Phase-1 tools manipulate it: `set_context({...ids})` and `get_context()`. All other tools accept explicit ids in args AND fall back to session ids when absent — so the AI never has to re-ask.
- RLS: user reads/writes own rows only.

---

## 7. Audit Model

New table `mcp_audit_log`:
- `id`, `user_id`, `client_id` (AI platform id from OAuth), `client_name`, `tool_name`, `params_json`, `result_summary` (short), `record_ids` (uuid[] of records touched), `execution_ms`, `status` (`ok`|`denied`|`error`), `error_code`, `created_at`.
- Written by a wrapper `withAudit(tool)` applied to every registered tool — no per-tool boilerplate.
- Prompt text is NOT captured (MCP does not receive it). We log tool name + params, which is the audit unit MCP actually has.
- RLS: users read own rows; admins read all; append-only (no update/delete).
- Retention: 12 months, pruned by a cron job (Phase 2).

---

## 8. API Structure

- `/functions/v1/mcp` — MCP Streamable HTTP (existing).
- `/functions/v1/mcp/.well-known/oauth-protected-resource` — existing.
- `/.lovable/oauth/consent` — **new client route** (React page in `src/pages/`) using `supabase.auth.oauth.{getAuthorizationDetails|approveAuthorization|denyAuthorization}`. Preserves consent URL through login/signup/Google OAuth per Lovable knowledge.
- All tool files stay under `src/lib/mcp/tools/` and are default-exported; the Vite plugin re-bundles the Deno function on save; `supabase--deploy_edge_functions` deploys after every change.

---

## 9. Database Additions (migrations, in order, with GRANTs)

1. Extend `app_role` enum with the 9 new roles above.
2. `mcp_sessions` table + RLS (self-only) + GRANT.
3. `mcp_audit_log` table + RLS (self read / admin read / append only) + GRANT.
4. `mcp_api_keys` table skeleton (created, not used in Phase 1) — hashed key, scopes[], revoked_at.
5. `search_documents` (pgvector) — `id`, `source_table`, `source_id`, `org_id`, `chunk`, `embedding vector(1536)`, `metadata jsonb`. HNSW index. Populated by a Phase-1 backfill edge fn `index-search-corpus` covering `sites`, `studies`, `project_files.text_content`, `estimates`.
6. Read-only PostGIS RPCs where a matching one is missing: `mcp_search_sites`, `mcp_search_feeder_pillars`, `mcp_rank_candidate_sites` — SECURITY INVOKER so RLS applies.

No changes to existing tables' columns.

---

## 10. Phased Implementation Plan

**Phase 1a — Foundations (this iteration)**
1. Migration: roles enum extension, `mcp_sessions`, `mcp_audit_log`, `mcp_api_keys` skeleton, `search_documents` + HNSW.
2. `src/lib/mcp/lib/permissions.ts` (role matrix + `assertToolAllowed`).
3. `src/lib/mcp/lib/audit.ts` (`withAudit` wrapper).
4. `src/lib/mcp/lib/context.ts` (session read/write helpers).
5. Consent route `src/pages/OAuthConsent.tsx` + router entry `/.lovable/oauth/consent`, with next-preservation across email/password + Google.
6. Refactor existing 3 tools onto `withAudit` + `assertToolAllowed`.

**Phase 1b — GIS + PM read tools**
7. Add GIS tools (10) + PM read tools (5). Each ≤ 60 lines, calls existing RPC or edge fn.

**Phase 1c — Engineering + Estimating read tools**
8. Wrap `electricalEngine`, `evHub/*`, `connectionCosts`, `apply-dno-rules` behind read tools. No new math.

**Phase 1d — Search + Docs + Reporting + Commercial**
9. `index-search-corpus` backfill fn + `semantic_search`/`natural_language_query`/`search_everything`.
10. Document tools returning signed URLs. Reporting tools call existing PDF generators, store to Storage, return URL.
11. Commercial read tools.

**Phase 1e — Verify**
12. `app_mcp_server--extract_mcp_manifest` after each batch; deploy `mcp` function.
13. End-to-end smoke: local `curl` against `/functions/v1/mcp` with a real OAuth token from Claude Desktop or MCP Inspector.

**Phase 2 (later, gated on user approval)** — Write tools, API-key auth, retention job, `run_gridwise_connect` / `run_ev_hub` as job-runners (async pattern, since these exceed MCP sync timeout).

---

## Out of Scope for Phase 1

- Any write / mutation tool.
- Long-running engines (`run_gridwise_connect`, `run_ev_hub`) — MCP sync-timeout risk; deferred with the async-job pattern.
- Building a Claude-specific chatbot inside the app (explicitly not wanted).
- API-key auth surface (table exists, no endpoint).
- Photo upload/retrieve (no schema today).

## Technical Notes

- Existing MCP OAuth issuer is `https://xqmrnfimcuktyyltikoy.supabase.co/auth/v1` — kept as-is; must not be a `.lovable.cloud` proxy.
- Every migration adding a `public` table includes `GRANT ... TO authenticated; GRANT ALL ... TO service_role;` before `ENABLE ROW LEVEL SECURITY`.
- Tools never accept `user_id`/`org_id` from input; they read from `ctx` and RLS.
- Embeddings via Lovable AI Gateway (`openai/text-embedding-3-small`, 1536 dims) — no user key.
- Manifest regen + function deploy are non-negotiable on every MCP change.
