# Plan: Multi-Agent Orchestration for Gridwise

## Goals

1. Split the single Gridwise Assistant into domain-specific agents (Pre-Con, Sales, Delivery, Admin).
2. Expand the Pre-Con agent so it can progress stages, reassign owners, and escalate waiting/counter stages.
3. Introduce **safe auto-execution** for low-risk actions while keeping destructive/costly actions approval-gated.
4. Add a background scheduler that auto-escalates overdue waiting/counter stages and sends reminders.
5. Build an audit/traceability UI for every tool proposal and execution.
6. Generate a user guide for prompting the agents.

## Current state (verified)

- One `gridwise-assistant` Edge Function serves all requests. It mixes read tools (search sites, programmes, work packages) and write tools (archive, stage updates, site edits, surveys).
- Write tools are declared **without `execute`** so the AI SDK surfaces them as proposals; `AssistantChat.tsx` renders `ToolProposalCard.tsx` and calls `gridwise-agent-execute` on approval.
- `assistant_threads` has context fields (`context_programme_id`, `context_wp_id`, `context_site_id`) but no agent identifier.
- `assistant_tool_calls` logs `status: proposed | executed | rejected | error` but has no `agent_id` or `execution_mode` (auto/approved).
- Pre-Con stages live in `site_stage_status` / `stage_definitions`; `src/lib/wp/completeStage.ts` and `bulk_complete_stage_and_assign_next` RPC already handle stage progression.
- Waiting stages (`poc_offer_awaiting`) and counter stages (`survey_po_gate`) already store `wait_started_at`, `wait_target_date`, and `wait_delay_reason`.
- A `pg_cron` job already invokes an Edge Function (`xero-sync-payments-30m`), so the scheduler pattern is proven.
- Docs live under `docs/` (e.g., `docs/gridwise-os/`).

## 1. Schema changes

### `assistant_threads`
- Add `agent_id text` (nullable, default `'general'`).
- Add `auto_execute_safe boolean` default `false`.

### `assistant_tool_calls`
- Add `agent_id text`.
- Add `execution_mode text` (`proposed`, `auto_executed`, `approved`, `rejected`, `error`).
- Add `risk_tier text` (`safe`, `destructive`, `external`, `cost`).

### New table: `agent_auto_execution_log`
- `id uuid`, `agent_id text`, `tool_name text`, `params jsonb`, `user_id uuid`, `status text`, `result_summary text`, `created_at timestamptz`.
- GRANT to authenticated + service_role; RLS enabled; policy scoped to `auth.uid()`.

## 2. Agent registry and routing

Create `supabase/functions/_shared/agent-registry.ts`:
- Define agents: `general`, `precon`, `sales`, `delivery`, `admin`.
- Each agent has: `id`, `name`, `systemPrompt`, `readToolNames`, `writeToolNames`, `safeAutoExecute` predicate.

Refactor `gridwise-assistant/index.ts`:
- Read `agent_id` from request body (default `general`).
- Load the agent's system prompt and tool set from the registry.
- Keep the same streaming/audit pattern.
- Persist `agent_id` on thread and tool-call rows.

## 3. Pre-Con agent tools

Move Pre-Con-specific tools into `supabase/functions/_shared/agents/precon-tools.ts`.

### Read tools
- `list_wp_sites(work_package_id)` — sites in a WP with current stage summary.
- `get_stage_status(work_package_id, site_ids, stage_key)` — current status, owner, recipients, wait dates.
- `list_stage_definitions()` — key, label, track, requires_owner, allowed_owner_roles.

### Write tools
- `mark_stage_done_bulk` (existing) — approval required.
- `set_stage_status_bulk` — set `in_progress` / `blocked` / `review` for many sites; **safe auto-execute** when only changing status within the same stage and no external communication.
- `assign_stage_owner` — assign owner/recipients to a stage; **safe auto-execute**.
- `reassign_waiting_stage_owner` — change owner of an overdue waiting stage; **safe auto-execute**.
- `queue_survey_for_sites` (existing) — approval required (sends email).
- `update_site_fields` (existing) — approval required.

## 4. Safe auto-execution rules

A write tool may auto-execute only when **all** are true:
1. Tool is in the active agent's `safeAutoExecute` allowlist.
2. Action is idempotent (same input → same outcome).
3. No external communication (no email, no survey token, no Xero/OneDrive write).
4. No cost impact (no estimate creation, no PO/invoice).
5. User's role/capability allows the action (verified via `capability_grants` or RLS).
6. Audit row is inserted before execution.

Implementation:
- In `gridwise-assistant`, when a safe tool is called, run it inline via `executeWriteTool` and return the result immediately (no proposal).
- Non-safe tools continue to surface as `ToolProposalCard` for human approval.
- Update `ToolProposalCard` to show a "Safe action — executed automatically" badge when `execution_mode === 'auto_executed'`.

## 5. Background scheduler for waiting/counter stages

Create `supabase/functions/gridwise-agent-scheduler/index.ts`:
- Invoked by a new `pg_cron` job every 15 minutes.
- Finds waiting/counter stages that are:
  - overdue (`wait_target_date < today` or 20 working days elapsed),
  - not already escalated today,
  - assigned to an owner.
- Auto-sets status to `blocked` with reason `"Overdue: <stage label>"`.
- Sends one aggregated notification per owner via the existing notification path.
- Logs to `agent_auto_execution_log`.

Frontend: add a read-only "Agent Activity" panel in `WpMatrixTab.tsx` showing recent auto-executions for the WP.

## 6. Frontend changes

### `AssistantChat.tsx`
- Add an agent selector dropdown (General, Pre-Con, Sales, Delivery, Admin).
- Persist selected agent in `assistant_threads.agent_id`.
- Pass `agent_id` to the Edge Function.
- Render auto-executed tool results inline (no approval card).

### New page: `AgentAuditLog.tsx`
- Route: `/assistant/audit` (Admin-only via `is_platform_admin` or capability check).
- Table: agent, tool, user, params preview, status, execution mode, timestamp.
- Filters by agent, status, date range.

### `WpMatrixTab.tsx`
- Add "Agent Activity" drawer showing last 20 auto-executions for the current WP.
- Add "Ask Pre-Con agent" button that opens the Assistant with `agent_id='precon'` and `context_wp_id` pre-filled.

## 7. User guide

Generate `docs/gridwise-os/AI_AGENT_GUIDE.md`:
- How to switch agents.
- What each agent can do.
- Which actions auto-execute vs require approval.
- Example prompts:
  - "Mark PoC Application done for all sites in WP4 and assign Liam to PoC Offer Due."
  - "Show me overdue waiting stages in Plymouth programme."
  - "Archive all completed programmes from 2024."
- Confirmation phrases for destructive actions.

## 8. Deployment and verification

- Add migration for schema changes.
- Deploy `gridwise-assistant`, `gridwise-agent-execute`, and `gridwise-agent-scheduler`.
- Create `pg_cron` job via `supabase--read_query` (not migration, because it contains project-specific URL/key).
- Verify with Playwright:
  1. Open Assistant, switch to Pre-Con agent.
  2. Ask to mark a stage done → approval card appears.
  3. Ask to assign an owner → auto-executes inline.
  4. Open Agent Audit Log and see both rows.

## Out of scope for this plan

- Replacing the existing approval flow entirely.
- Adding natural-language archive for non-destructive entities beyond what already exists.
- Sales/Delivery/Admin agent full tool registries (only Pre-Con gets expanded tools; others get identity/prompt only).

## Files to create/modify

- New: `supabase/functions/_shared/agent-registry.ts`
- New: `supabase/functions/_shared/agents/precon-tools.ts`
- New: `supabase/functions/gridwise-agent-scheduler/index.ts`
- New: `src/components/assistant/AgentSelector.tsx`
- New: `src/pages/AgentAuditLog.tsx`
- New: `docs/gridwise-os/AI_AGENT_GUIDE.md`
- Modify: `supabase/functions/gridwise-assistant/index.ts`
- Modify: `supabase/functions/gridwise-agent-execute/index.ts`
- Modify: `supabase/functions/_shared/agent-write-tools.ts`
- Modify: `src/components/assistant/AssistantChat.tsx`
- Modify: `src/components/assistant/ToolProposalCard.tsx`
- Modify: `src/pages/Assistant.tsx`
- Modify: `src/components/wp/WpMatrixTab.tsx`
- Migration: add columns to `assistant_threads` / `assistant_tool_calls`; create `agent_auto_execution_log`.