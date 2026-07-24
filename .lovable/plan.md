## Goal
Apply the three uploaded migrations to introduce **Award Codes** (Civils / ICP / Electrical) on rate items, a **Scope Awards** table keyed to Work Packages + partners, and relax the approved-rate-item immutability rule so `needs_pricing` lines can still be completed after approval.

## Migrations to run (in order)

1. `20260724090000_rate_items_award_code.sql` — add nullable `rate_items.award_code text` with CHECK `C/I/E`.
2. `20260724090100_scope_awards.sql` — new `public.scope_awards` table (work_package_id, award_code, partner_id, notes, awarded_at/by, unique per WP+scope) with GRANTs, RLS, updated_at trigger.
3. `20260724090200_relax_rate_item_pricing_completion.sql` — replace `prevent_approved_rate_item_change()` to allow a narrow update that only fills in `total_unit_cost` / `client_unit_price` when `OLD.needs_pricing = true`.

I'll submit them as one `supabase--migration` call so they land atomically and types regenerate once.

## Verification after types regenerate
- Confirm `rate_items.award_code` and `scope_awards` appear in `src/integrations/supabase/types.ts`.
- No code changes in this plan — the schema is ready for follow-up UI work (award-code column in rate editor, partner assignment UI per WP scope).

## Notes / observations
- `scope_awards` policy is `USING (true)` for authenticated. Matches sibling WP-scoped tables in this project, but flagging: any authenticated user can read/write scope awards across every WP. Happy to tighten to org/role-based RLS if you want — otherwise I'll ship as-uploaded.
- The relaxed trigger correctly checks `OLD.needs_pricing = true` and locks every other column via `IS NOT DISTINCT FROM`. Note it does NOT auto-flip `needs_pricing` to false after completion; if you want that, say the word and I'll add it.

## Out of scope (future turns)
- UI to pick award code on rate lines and to assign partners per scope on a WP.
- Filtering estimates / POs by award code.