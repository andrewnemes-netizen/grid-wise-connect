
## Fix plan: stop registry freezes, make ingestion reliable, and restore gas layers on the map

### What is actually wrong (you’re not doing anything wrong)
1. **Admin freeze is mostly UI overload + polling storm**
   - `GasDatasetRegistry` and `NpgDatasetRegistry` still render large full tables at once.
   - `Sync All` starts many ingests, and each ingest starts its own `pollSyncStatus` loop (up to 60 polls each), causing request floods and tab lockups.
2. **Some ingests fail from runtime limits**
   - Logs show `CPU Time exceeded` in `npg-dataset-ingest`, so heavy datasets can stall/fail.
3. **Gas layers can be hidden by DNO clip logic**
   - `useLayerManager` passes `selectedDno` clipping to all layer fetches, including gas; if electricity DNO is selected, gas layers can return empty.

---

### Implementation steps

1. **Registry performance hardening (Gas + DNO)**
   - Add **server-side pagination** (`count: "exact"` + `.range(...)`) to both registries.
   - Keep list query lightweight (no heavy JSON fields in table query).
   - Load `fields_json` only when row details are expanded (on-demand query).
   - Reduce per-row render weight (avoid full heavy controls for every row where possible).

2. **Fix Sync All request storm**
   - Add a batch mode to `handleIngest` so `Sync All` does **not** spawn per-row poll loops.
   - Replace per-dataset polling with **one global progress poll** (refresh every few seconds).
   - Show progress from registry status counts (`processing/success/error/skipped`) and stop polling when processing reaches 0.

3. **Ingest reliability improvements in edge function**
   - Add guarded execution budget checks inside long loops and fail gracefully with explicit status/error instead of hanging.
   - Ensure all abnormal exits always write registry status (`error` with reason) so rows don’t stay “processing”.
   - Tune batch sizes for heavy geometry paths and keep the existing streaming approach.

4. **Fix gas map visibility bug**
   - In `useLayerManager`, apply `_dno_clip` only to electricity network layers.
   - For gas operators (`CADENT/NGN/SGN/WWU`), force clip to `null` so gas features load regardless of selected electricity DNO filter.

5. **End-to-end validation**
   - Admin → Gas Registry: page responsive, no freeze, paginated list works.
   - Run Sync All Active: limited network traffic, stable UI, statuses progress correctly.
   - Map → Gas tab: Cadent layers render even when a Network DNO filter is selected.
   - Repeat quick regression on DNO Registry to confirm same stability gains.

---

### Files to update
- `src/components/admin/GasDatasetRegistry.tsx`
- `src/components/admin/NpgDatasetRegistry.tsx`
- `src/hooks/useLayerManager.ts`
- `supabase/functions/npg-dataset-ingest/index.ts`

---

### Technical detail (concise)
- Introduce query state: `page`, `pageSize`, `totalCount`, `isPollingBatch`.
- Use registry queries like:
  - table list: selected columns + filters + `.range(from, to)`
  - detail query: `fields_json` fetched only for expanded row id
- Batch sync poll:
  - single timer queries aggregate status (or refresh current page) every 3–5s
  - stop condition: no `processing` rows
- Map clip rule:
  - `const isGas = GAS_OPERATORS.has(layer.dno);`
  - `fetchLayerGeoJSON(layerId, bbox, isGas ? null : selectedDno, cap)`
