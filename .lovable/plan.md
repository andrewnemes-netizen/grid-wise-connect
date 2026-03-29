

## Fix: GIS Map Layers Showing "No Data in This Viewport"

### What's Actually Happening

Database audit shows many layers have **0 features ingested** — the data simply isn't there yet:

| DNO | Layers with data | Empty layers | Total features |
|-----|-----------------|-------------|----------------|
| CADENT | 3 of 7 | 4 | 30,010 |
| NGED | 2 of 26 | 24 | 34,692 |
| ENWL | 16 of 21 | 5 | 442,579 |
| NPG | 16 of 18 | 2 | 961,143 |
| UKPN | 21 of 23 | 2 | 1,012,374 |
| SPEN | 13 of 16 | 3 | 61,817 |

The layers that DO have data (e.g. Cadent Network Zones — 10 polygons, Cadent Gas Pipes Open — 20,000 lines) **work correctly** when the viewport overlaps. The session replay confirms Network Zones rendered and was clickable.

The "No data in this viewport" toast fires because:
1. **Empty layers** (0 features globally) — misleading message, should say "No data available"
2. **Viewport mismatch** — data exists but user is viewing a different region (e.g. Cadent LP Pipes only covers London area lat 51.3–51.7)

### Two Problems, Two Fixes

**Fix 1: Better empty-layer messaging** — Before fetching, check if the layer has any data at all. If the layer's `record_count` in the registry is 0 or the RPC returns 0 features with no bbox filter, show "No data available yet — run Sync in Admin" instead of the misleading viewport message.

**Fix 2: Re-run ingestion for empty NGED layers** — NGED has 24 empty layers out of 26. These need to be synced from Admin. This is an operational step, not a code fix. But we can make the UI clearer about which layers need syncing.

### Implementation

| # | Change | File |
|---|--------|------|
| 1 | Store `feature_count` from layer_registry in the `RegistryLayer` type and fetch it with the layer list | `src/components/map/LayerTogglePanel.tsx` |
| 2 | In `loadLayer`, if layer has 0 known features, show "No data available — sync required" toast instead of "No data in this viewport" | `src/hooks/useLayerManager.ts` |
| 3 | Dim/badge layers with 0 features in the toggle panel so user knows which layers have data | `src/components/map/LayerTogglePanel.tsx` |
| 4 | After successful ingest, update `record_count` on the layer_registry entry so the count stays current | `supabase/functions/npg-dataset-ingest/index.ts` |

### Technical Detail

In `useLayerManager.ts` `loadLayer`:
```typescript
if (geojson.features.length === 0 && showEmptyToast) {
  const hasAnyData = layer.record_count && layer.record_count > 0;
  toast({
    title: layer.display_name,
    description: hasAnyData
      ? "No data in this viewport — try panning to the layer's coverage area."
      : "No data available yet. Run Sync in Admin to ingest this dataset.",
  });
}
```

In `LayerTogglePanel.tsx`, layers with `record_count === 0` get a subtle badge or reduced opacity so users can see at a glance which layers are populated.

### Expected Outcome
- Layers with data render correctly when viewport overlaps (already working)
- Empty layers show clear "needs sync" messaging instead of misleading viewport message
- Layer toggle panel visually indicates which layers have data
- After running Sync All in Admin for NGED/CADENT, new features populate and layers render

