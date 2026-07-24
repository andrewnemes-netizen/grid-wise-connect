## Goal
Allow approving a DRAFT rate card version even when some items still have `needs_pricing = true`. Unpriced items keep their flag so the Quote Builder can still edit them after approval (existing behaviour).

## Changes

1. **Database migration** — relax `public.approve_rate_card_version(_version_id uuid)`:
   - Remove the `v_needs > 0` guard that raises `Cannot approve: N rate item(s) still need pricing`.
   - Keep everything else identical (auth check, DRAFT-only, supersede prior APPROVED, audit log).
   - Items retain `needs_pricing = true`; the already-relaxed `prevent_approved_rate_item_change` trigger continues to permit pricing edits for those items on APPROVED versions.

2. **`src/pages/admin/RateCardDetail.tsx`**:
   - Remove `disabled={needsPricingCount > 0}` on the Approve button.
   - Replace the blocking "Approval is blocked until every item has a unit cost" alert with a non-blocking notice: "N item(s) still need pricing — you can approve now and complete pricing later from the Quote Builder or here."

3. **Quote Builder** — no code change needed. It already lets staff edit any item (including `needs_pricing` ones on approved versions) and clears the flag once cost + price are both set.

## Out of scope
- No change to `prevent_approved_rate_item_change` (already permits `needs_pricing` edits).
- No change to import parsers or `needs_pricing` derivation.
