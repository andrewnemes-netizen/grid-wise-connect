# Rate Cards as a Reusable Library

Today `rate_cards.contract_id` is NOT NULL and there's no category concept. Cards can only exist tied to one client contract. This plan makes cards standalone-capable and category-tagged, then updates the three touchpoints (Import, Library browse, Picker).

## 1. Database migration

- `ALTER TABLE public.rate_cards ALTER COLUMN contract_id DROP NOT NULL;`
- `ALTER TABLE public.rate_cards ADD COLUMN category text;` (free-text tag, e.g. `"ICP"`, `"Build"`, `"LV Civils"`)
- Replace unique constraint `(contract_id, name)` with a partial pair:
  - `UNIQUE (contract_id, name) WHERE contract_id IS NOT NULL`
  - `UNIQUE (name) WHERE contract_id IS NULL` (library names unique on their own)
- Index: `CREATE INDEX idx_rate_cards_category ON public.rate_cards(category);`
- RLS unchanged (existing `rate_cards_staff_all` covers it).

## 2. Admin → Estimating Import (`src/components/admin/EstimatingImport.tsx`)

Replace the single "Contract" selector in `RateLibraryImport` with a **Mode** radio group:

1. **Library card (no contract)** — inputs: `name`, `category` (free text with datalist of existing categories).
2. **New card for a contract** — inputs: `name`, `category` (optional), `contract` (current dropdown).
3. **New version of an existing card** — inputs: `rate_card_id` (searchable select showing `name · category · contract?`). Skips `rate_cards` insert; computes next `version_number = max+1`.

`doImport()` branches on mode:
- Modes 1/2: insert `rate_cards` with `contract_id` null-or-set + `category`, then v1 DRAFT (unchanged).
- Mode 3: insert a new `rate_card_versions` row against the chosen card at `max(version_number)+1`.

Approve-now inline button remains as built.

## 3. Admin → Rate Library (`src/components/admin/RateLibrary.tsx`)

- Extend versions query select to include `rate_card(category)`.
- New **Category** filter dropdown: `All`, distinct categories from loaded rows, plus `Library (no contract)` which filters `contract_id IS NULL`.
- New table column **Category** (badge) between Rate card and Contract; Contract cell shows `—` for library cards.
- Make the **Rate card name** cell a button opening a new `EditRateCardDialog`:
  - Fields: `name`, `category` (free text), `contract_id` (select with `— Library (no contract) —` option).
  - Saves via `UPDATE public.rate_cards SET name, category, contract_id WHERE id`.
  - Invalidates `rate-library-versions`.

## 4. Rate item picker (`src/components/delivery/estimate/RateItemPicker.tsx`)

- Extend `versions` query select to `rate_cards(name, code, category, contract:contracts(name))`.
- Change SelectItem label to: `"{name} — {category ?? (contract?.name ?? 'Library')} · v{version_number} ({status})"` so ICP vs Build vs contract-scoped cards are visually distinct.

## 5. Out of scope / unchanged

- `rate_card_versions`, `rate_items`, approval RPC, quotation flow — untouched.
- No migration of existing rows; they keep their `contract_id` and get `category = NULL`.
- `partners.default_rate_card_id` FK still valid (library cards allowed).

## Technical notes

- Supabase types regenerate after the migration; picker/library/import code that reads new fields must land after approval.
- The `NewSiteEstimateDialog` "no approved rate cards" warning path (built earlier) continues to work — library cards count once approved.
- No changes needed to `EstimatingImport.tsx`'s Recipe importer or to `SiteEstimatesPanel` (contract selection there is orthogonal; library cards will simply appear in the version dropdown regardless of contract).
