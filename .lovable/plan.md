
# Gridwise Assistant → Action Agent

Turn the read-only Assistant into a **tool-using agent that proposes writes and executes them after the user clicks Approve**. All writes run **as the signed-in user** through Supabase (RLS enforced — the Assistant can never do anything the user couldn't do in the UI). Every proposal and execution is written to an audit log.

Phase 1 ships on-demand (chat-driven). Phase 2 adds a scheduled/triggered agent runner reusing the same tools.

---

## Phase 1 — On-demand write agent (this slice)

### 1. Tool registry (server, shared)

New Edge Function tool library in `supabase/functions/_shared/agent-tools/`, one file per tool. Each tool declares:

- `name`, `description`, Zod `inputSchema`
- `mode`: `"read"` (auto-runs) or `"write"` (requires approval)
- `preview(input, ctx)` → human-readable diff string ("Will move site *Rutger Place* from **Intake → PoC Application** and notify **Liam French**")
- `execute(input, ctx)` → runs via a Supabase client bound to the caller's JWT (RLS enforced)

**First tools (small, high-leverage subset from your 4 categories):**

| Category | Tool | Mode |
|---|---|---|
| Site & WP | `search_sites`, `add_sites_to_wp`, `remove_sites_from_wp`, `update_site_fields` | read / write / write / write |
| Pre-Con stages | `list_stage_status`, `mark_stage_done`, `mark_stage_received`, `mark_stage_delayed`, `assign_next_stage_owner` | read / write × 4 |
| Surveys & tasks | `list_open_tasks`, `queue_survey`, `reassign_task`, `resend_survey_link` | read / write × 3 |
| Estimates & docs | `list_estimates`, `create_draft_estimate`, `apply_bulk_markup`, `generate_estimate_pdf` | read / write × 3 |

Every write tool reuses the **existing RPC / service function** it corresponds to (e.g. `bulk_complete_stage_and_assign_next`, `queue_survey`, `archive_entity`) — no duplicate business logic.

### 2. Assistant edge function (rewritten)

`supabase/functions/gridwise-assistant/index.ts` becomes an AI-SDK tool-calling loop:

- Auth: `supabase.auth.getUser()` from the bearer token — reject if no session.
- Loads the tool registry. **Read tools** are exposed with `execute`. **Write tools** are exposed with `needsApproval: true` (AI SDK native approval mechanism).
- `streamText({ model: gateway("google/gemini-3.5-flash"), tools, stopWhen: stepCountIs(50), toolChoice: "auto" })`.
- Streams via `toUIMessageStreamResponse` so the client sees text + tool call parts + approval requests.

### 3. Approval UI (new)

Extends `src/components/assistant/AssistantChat.tsx`:

- Renders tool-call parts inline (using existing `ai-elements/tool.tsx`).
- When a write tool is called, shows a **proposal card** with the tool's `preview` string + Approve / Reject buttons.
- Approve → sends `addToolResult` continuing the stream, which triggers `execute` server-side.
- Reject → sends a "rejected" tool result; assistant apologises / offers alternatives.
- Removes the "READ-ONLY" badge; renames to "Gridwise Assistant" with a small "Acts as you" tooltip.

### 4. Audit log

New table `assistant_action_log`:

```
id, user_id, thread_id, tool_name, input jsonb, preview text,
status (proposed|approved|rejected|executed|failed),
result jsonb, error text, created_at, executed_at
```

RLS: users see their own rows; platform admins see all. Rendered in a new **Admin → Assistant Activity** panel (later slice).

### 5. Safety rails (non-negotiable)

- **All writes go through the user-scoped Supabase client** (`Authorization: Bearer <user JWT>`). No service-role client in the tool path.
- Destructive tools (`remove_sites_from_wp`, delete-style) require explicit confirmation text match ("delete 3 sites") in the approval.
- Rate limit: max 20 tool calls per assistant turn (via `stopWhen`), max 5 concurrent write approvals per thread.
- Tools never see or return the JWT.
- The assistant system prompt forbids: privilege escalation, bulk deletes without explicit user request, cross-org data access, and inventing engineering/commercial values.

---

## Phase 2 — Scheduled/triggered agents (next slice, not this one)

Once Phase 1 is live and audited, add:

- `agent_definitions` table (name, schedule cron, prompt, allowed_tools, owner_user_id, enabled).
- `agent_runs` table (definition_id, started_at, finished_at, status, transcript, actions_taken).
- Supabase cron → `run-agent` edge function that runs the same tool loop **without human approval** but restricted to a per-agent tool allowlist and acting under the definition's owner.
- Event triggers (e.g. "when PoC offer arrives", "every weekday 8am") that enqueue an agent run.
- Admin UI in `/admin/agents` to author agents, view runs, disable them.

Out of scope for this PR.

---

## Files touched (Phase 1)

**New**
- `supabase/functions/_shared/agent-tools/index.ts` (registry)
- `supabase/functions/_shared/agent-tools/{sites,stages,surveys,estimates}.ts`
- `supabase/functions/_shared/user-supabase.ts` (JWT-bound client factory)
- `src/components/assistant/ToolProposalCard.tsx`
- Migration: `assistant_action_log` + RLS + grants

**Modified**
- `supabase/functions/gridwise-assistant/index.ts` (rewrite — tool loop)
- `src/components/assistant/AssistantChat.tsx` (render tool parts, approval UI, remove READ-ONLY badge)
- `src/pages/Assistant.tsx` (badge label change)

---

## Acceptance

- User asks "Mark 'PoC Application' done for Rutger Place and notify Liam" → assistant proposes → user clicks Approve → stage advances in the matrix in real time → audit row written.
- User asks "Delete all sites in Gloucester" → assistant proposes with destructive confirmation → user must type "delete 4 sites" → executes only if RLS allows.
- Signing in as a Client (no admin capability) and asking for admin-only actions → tool call fails with the same RLS error the UI would show; assistant reports it honestly.
- Old chat threads still open; new threads use the write-capable assistant.
