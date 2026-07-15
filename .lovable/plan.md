
# Gridwise Assistant — Embedded Claude (Phase 1, read-only)

Right-side chat panel, available throughout the app. Server-side Anthropic key, permission-aware, audited, no writes. Reuses the tool layer designed for the MCP server so both AI paths share one source of truth.

---

## 0. Two decisions needed before build (chat UI contract)

Defaults chosen — reply if you want different:
1. **Conversation shape:** *threaded* — user can start new conversations, revisit old ones. (Alternative: one rolling conversation per user.)
2. **Storage:** *database (Supabase)*, scoped to user + optional programme/work-package/site context. (Alternatives: browser localStorage, no persistence.)

---

## 1. Proposed Architecture

```
Right-side Assistant panel  (src/components/assistant/*)
        │  useChat (AI SDK) → transport
        ▼
Edge Function  /functions/v1/gridwise-assistant   (streaming)
        │  auth: supabase.auth.getUser(bearer)
        │  load: mcp_sessions context + thread history
        ▼
AI SDK streamText — Anthropic provider (@ai-sdk/anthropic)
   model: claude-sonnet-4-5   (opus-4-1 optional, haiku-4-5 for cheap)
   tools:  Gridwise Tool Registry (shared with MCP)
   stopWhen: stepCountIs(50)
        │  tool call
        ▼
Gridwise Tool Registry   (src/lib/gridwise-tools/*)
        │  assertToolAllowed(user, tool) → withAudit → handler
        ▼
Existing domain layer
   • Supabase RLS (per-user + per-org)
   • PostGIS RPCs
   • Engineering: gridwise/*, evHub/*, electricalEngine
   • Estimating: connectionCosts, unit_rates, rate_items
   • PM: projects, work_packages, project_tasks
   • Documents: Storage
        │
        ▼
Response back to Claude → cited answer streamed to panel
```

The **same tool registry** is exposed by (a) the AI SDK `tools` object here, and (b) the MCP server. One implementation, two adapters.

---

## 2. Tool definitions (Phase 1 — read-only, 9 tools to start)

Each tool: Zod input schema, `execute` calling existing lib/RPC, returns compact JSON + `sources` array of `{ table, id, url }` for citations.

| Tool | Backing implementation | Returns |
|---|---|---|
| `search_programmes` | `programmes` + `work_packages` count | id, name, client, dates, wp_count, status |
| `get_programme_summary` | `programmes` + rollup RPC over `sites`+`project_tasks` | dates, RAG, site counts by stage, blockers |
| `get_work_package_summary` | `work_packages` + `wp_sites` + `wp_tasks` | progress %, forecast completion, overdue tasks, missing docs |
| `search_sites` | `sites` + optional PostGIS radius | site rows (respects RLS) |
| `get_site_details` | `sites` + `site_stage_status` + latest `studies` | full site record + latest study id |
| `get_site_feasibility` | reads latest `studies.result_json` (does **not** re-run engines) | verdict, capacity, DNO rule outcomes, cable spec |
| `get_estimate_summary` | `estimates`+`estimate_lines` or `site_estimates` | totals, margin (permission-filtered), non-standard flag |
| `get_delivery_risks` | RPC aggregating overdue tasks, expiring permits, missing metering, slippage | ranked risk list per programme/WP |
| `draft_client_report` | pulls WP + site rollups + risks, returns markdown draft | markdown + `sources[]`; **labelled AI-assisted** |

Explicit **non-tools**: no `run_ev_hub`, no `calculate_*`, no `create_*`, no `update_*`, no `approve_*`. Claude asks for feasibility → tool returns the **already-computed** study record. If none exists, tool returns `{ needs_study: true, site_id }` and Claude explains that a study must be run in the app first.

---

## 3. Database additions

One migration, all with GRANTs before RLS.

- `assistant_threads`: id uuid PK, user_id, title, context_programme_id/wp_id/site_id (all nullable), created_at, updated_at, archived_at. RLS: owner only.
- `assistant_messages`: id uuid PK, thread_id FK, role (`user|assistant|tool`), parts jsonb (AI SDK `UIMessage.parts`), tool_name, tokens_in, tokens_out, cost_cents, created_at. RLS via thread ownership.
- `assistant_tool_calls` (audit): id, thread_id, message_id, user_id, tool_name, params jsonb, result_summary text, record_ids uuid[], status (`ok|denied|error`), execution_ms, model, created_at. RLS: owner read, admin read, append-only.
- Reuse `mcp_sessions` from previous plan for the "current context" (programme/WP/site) — same table, both AI paths read it.
- No changes to existing tables.

---

## 4. Permission model

Two enforcement points, both required, both reuse what's designed for MCP:

1. **RLS** — edge function creates the Supabase client with the caller's bearer token; every tool query runs as that user.
2. **Tool + field gate** — `assertToolAllowed(user, toolName)` uses the role matrix from the MCP plan (managing_director, commercial, estimator, designer, programme_manager, project_manager, supervisor, installer, client, dno). Additionally, `get_estimate_summary` and `get_work_package_summary` **strip** commercial fields (sell price, margin, mark-up) for non-commercial roles before returning to Claude — so the model never sees data the user isn't allowed to see.

---

## 5. Audit model

Written automatically by a `withAudit(tool)` wrapper — no per-tool boilerplate. Every call records: user, thread, timestamp, tool, params, record ids touched, status, execution ms, model. Prompt text is stored in `assistant_messages` (already persisted per thread), so audit + conversation together reconstruct exactly what Claude did and why.

For write actions (Phase 2+): the same wrapper will add `before_value` / `after_value` / `approved_by` / `approved_at` columns.

---

## 6. Conversation context model

- Thread route: `/assistant/:threadId` (opens the side panel with that thread). Panel is available site-wide via a floating "Ask Gridwise" button; opening it creates or resumes the last active thread.
- Auto-context capture: when the panel opens on `/site/:id`, `/study/:id`, `/delivery/programme/:id`, etc., the thread's `context_*_id` is pre-populated so the user doesn't have to say "for site X".
- Tools accept explicit ids in args AND fall back to the thread's context ids.

---

## 7. API cost controls

- Model default: **claude-sonnet-4-5**; user role admin/MD can opt into opus-4-1 per thread. Cheap-path haiku-4-5 for `search_*` tool-planning-only turns.
- Hard caps per request: `max_tokens: 4096`, `stopWhen: stepCountIs(50)`.
- Per-user daily cost cap (default £5/day/user, admin-configurable in `app_settings`). Enforced in the edge function before calling Anthropic; over-cap returns a friendly error.
- Token+cost recorded per message → nightly rollup view `assistant_usage_daily` for the admin console.
- Rate limit: 20 req/min per user (in-function sliding window in a small `assistant_rate` table or memory).
- Streaming responses to avoid double-billing on retries.

---

## 8. UI plan (right-side panel)

- New component `src/components/assistant/AssistantPanel.tsx`, mounted once in `DashboardLayout`, opens/closes via floating button + `⌘K` shortcut.
- Thread list drawer with new/rename/archive/delete. Route `/assistant/:threadId`.
- Message rendering via `message.parts`: text streams as markdown; `tool-invocation` parts render a small "🔧 called `tool_name` → n records" chip with expandable JSON.
- Every assistant message shows a **Sources** row: chips linking to `/site/:id`, `/study/:id`, `/delivery/work-package/:id` etc., built from the tools' `sources` output.
- Every assistant message carries an "AI-assisted" badge.
- Composer stays focused; disabled while streaming; toast on rate-limit/cost-cap/network.
- Optimistic user bubble + typing indicator on `status === "submitted"`.

---

## 9. Phased implementation

**Phase 1a — foundations (this iteration if approved)**
1. `ANTHROPIC_API_KEY` secret request.
2. Migration: `assistant_threads`, `assistant_messages`, `assistant_tool_calls`, `mcp_sessions`, extended `app_role` enum.
3. `src/lib/gridwise-tools/` — shared tool registry (Zod schemas + handlers + `sources`).
4. Helpers: `assertToolAllowed`, `withAudit`, cost/rate-limit guard.
5. Edge function `gridwise-assistant` — streams with AI SDK + `@ai-sdk/anthropic`, loads/persists thread messages, executes tools.
6. UI: floating button, panel, thread list, `/assistant/:threadId` route, message + citation rendering.
7. Verify: send-message smoke test; confirm tool-call → citation link works end to end.

**Phase 1b — remaining read tools + drafting**
8. `get_delivery_risks` RPC, `draft_client_report` composition, permission-aware field stripping.

**Phase 2 — controlled write actions** (each gated by explicit user preview + confirm; separate approval per tool)
9. `create_tasks_from_template`, `update_task_status`, `assign_owner`, `apply_programme_template`, `move_dates`, `create_work_package_with_sites`. Preview UI shows diff before commit; `withAudit` records before/after.

**Phase 3 — Estimating assistant**
10. `select_recipe`, `apply_rate_card_version`, `generate_site_estimate`, `aggregate_wp_estimate`, `variance_analysis`. All call existing engines only.

**Phase 4 — Scheduled monitoring agent**
11. Nightly cron edge fn runs Claude with a fixed system prompt over each active WP; writes `notifications` rows for overdue/expiring/slippage findings.

**Phase 5 — Public MCP server for external Claude/ChatGPT/etc.**
12. Adapt the same registry into `@lovable.dev/mcp-js` tools (partially done — 3 tools already live). Public OAuth 2.1 already configured; add consent route + remaining tools.

---

## Out of scope for Phase 1

- Any write / mutation tool.
- Re-running engines (`run_ev_hub`, `run_gridwise_connect`) — Claude reads the last stored study; user must run engines from the app UI.
- Scheduled/proactive monitoring.
- MCP server expansion (kept as Phase 5).
- Photo/document upload; only read/summarise existing docs (Phase 1b via `find_documents`+`read_document` if you want it in Phase 1 — flag it and I'll add).

## Technical notes

- Uses **Anthropic API directly** via `@ai-sdk/anthropic` because Claude is not offered through Lovable AI Gateway. Key: `ANTHROPIC_API_KEY` (server-only, never in browser). Model IDs: `claude-sonnet-4-5` / `claude-opus-4-1` / `claude-haiku-4-5`.
- Tool registry is the shared boundary — MCP path (Phase 5) will wrap the same handlers, so we get one audit shape, one permission gate, one set of engineering guarantees.
- Every tool result includes `sources: [{table, id, url}]` so the panel can render citation chips deterministically without asking the model to format them.
- Claude never receives raw commercial fields the user can't see; stripping happens in the tool handler before returning, not in the prompt.

---

**Reply "proceed" (or answer the two questions in §0 if you want non-default choices) and I'll implement Phase 1a.**
