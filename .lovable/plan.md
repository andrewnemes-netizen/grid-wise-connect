

## Add DfT Traffic Ingest Button + Fix Auth + End-to-End Test

### What's needed

1. **Fix auth in `dft-traffic-proxy`** — Currently uses deprecated `getClaims()`. Replace with `getUser()` to match the standard pattern used across all other edge functions.

2. **Add DfT entry to the DnoApiSources admin panel** — Add a new DNO entry for "DfT Road Traffic" with a one-click "Ingest" button that calls the `dft-traffic-proxy` edge function with `action: "ingest"`. This follows the existing `DNO_REGISTRY` pattern but calls a different edge function endpoint.

3. **Verify layer registry entry exists** — The migration already inserted `dft_traffic_count_points` into `layer_registry`. The ingest function looks it up by slug.

### Implementation Steps

**Step 1: Fix `supabase/functions/dft-traffic-proxy/index.ts`**
- Replace `getClaims(token)` with `getUser(token)` for auth verification
- Extract `user_id` from `user.id` instead of `claims.sub`

**Step 2: Edit `src/components/admin/DnoApiSources.tsx`**
- Add a new entry to `DNO_REGISTRY` for DfT:
  ```
  { key: "DFT", label: "DfT Road Traffic", base_url: "https://roadtraffic.dft.gov.uk", status: "live", datasets: [
    { key: "count_points", label: "Traffic Count Points (AADF)", dataset_id: "count-points", storage_table: "geo_points", geometry_type: "Point", expected_records: 23500 }
  ]}
  ```
- In `handleSync`, add a branch: if `dno.key === "DFT"`, call `dft-traffic-proxy` with `{ action: "ingest" }` instead of `dno-open-data-ingest`

### Files to Change
- `supabase/functions/dft-traffic-proxy/index.ts` — Fix auth method
- `src/components/admin/DnoApiSources.tsx` — Add DfT registry entry + sync handler branch

