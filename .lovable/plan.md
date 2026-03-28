

## Fix Gas Registry Showing 0 Datasets

### Problem
The Gas Registry tab shows 0 datasets for Cadent even though 413 exist in the database. The useQuery hook inside `GasDatasetRegistry` doesn't fire its network request when the tab is first activated.

### Root Cause
Radix UI `TabsContent` components are lazily mounted — the Gas tab content isn't in the DOM until clicked. When it mounts, React Query may serve a stale empty cache if the query was previously attempted during an earlier session or before auth was ready. Additionally, the browser's query cache from page load may interfere.

### Fix

| # | File | Change |
|---|------|--------|
| 1 | `src/components/admin/GasDatasetRegistry.tsx` | Add `refetchOnMount: "always"` to the datasets useQuery options to force a fresh fetch every time the component mounts (i.e., when the tab is clicked). |
| 2 | `src/components/admin/NpgDatasetRegistry.tsx` | Same fix — add `refetchOnMount: "always"` for consistency across both registries. |

### Code Change (both files, in the useQuery call)

```typescript
const { data: datasets = [], isLoading } = useQuery({
  queryKey: ["gdn-dataset-registry", selectedGdn], // or ["dno-dataset-registry", selectedDno]
  queryFn: async () => { ... },
  refetchOnMount: "always",
});
```

### DNO Registry Status (No Code Changes Needed)
- NPG, ENWL, SPEN, NGED: All healthy, syncing correctly
- UKPN: Reset and actively re-syncing — logs confirm successful ingestion
- No errors or 401s remaining

### Expected Outcome
- Gas Registry tab loads and immediately shows 413 Cadent datasets
- DNO Registry continues working as before with fresh data on every tab switch

