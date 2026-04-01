

## Fix: Lat/Lng Coordinate Swap Bug

### Problem
Halifax HX4 8DW is appearing near Madagascar because `raw_score_data.lat` = -1.857 (actually longitude) and `raw_score_data.lng` = 53.686 (actually latitude). The coordinates are stored swapped. This likely affects many sites scored through the LA Programme batch, causing red flags on the portfolio map.

### Root Cause
The swap can originate from two places:
1. **CSV upload with explicit lat/lng columns** where the source data has them reversed (common with BNG/GIS exports that use x=easting/lng, y=northing/lat)
2. Possible edge case in the geocoding pipeline

Regardless of source, the system has **no validation** to detect obviously-swapped UK coordinates.

### Fix: Add UK coordinate validation + auto-correction

**Three locations need a guard:**

#### 1. CsvIntakePanel.tsx (CSV parsing)
After parsing lat/lng from CSV columns (line ~163), add a UK bounds check. If `lat` is in [-8, 2] and `lng` is in [49, 61], swap them — they're clearly reversed. UK bounds: lat ∈ [49, 61], lng ∈ [-8, 2].

#### 2. score-sites-batch edge function (geocoder output + input validation)
After resolving `geo` from either CSV coords or geocoding (line ~601), validate the coordinates are within UK bounds. If swapped, auto-correct. This catches both bad CSV data and any geocoder anomalies.

#### 3. ProgrammeDashboard.tsx (save to portfolio)
Before saving `raw_score_data`, validate and correct lat/lng one final time as a safety net.

#### 4. SiteDetail.tsx (View on Map navigation)
When reading `raw.lat` and `raw.lng` for the "View on Map" button, apply the same swap-detection guard so existing bad data renders correctly.

### Validation function (shared logic)
```typescript
function normalizeUkCoords(lat: number, lng: number): { lat: number; lng: number } {
  // UK bounds: lat [49, 61], lng [-8, 2]
  if (lat >= -8 && lat <= 2 && lng >= 49 && lng <= 61) {
    return { lat: lng, lng: lat }; // They're swapped
  }
  return { lat, lng };
}
```

### Also: Fix existing bad data
Run a one-time migration to correct any sites already stored with swapped coordinates.

```sql
UPDATE sites
SET raw_score_data = jsonb_set(
  jsonb_set(raw_score_data, '{lat}', raw_score_data->'lng'),
  '{lng}', raw_score_data->'lat'
)
WHERE (raw_score_data->>'lat')::float BETWEEN -8 AND 2
  AND (raw_score_data->>'lng')::float BETWEEN 49 AND 61;
```

### Files changed
| File | Change |
|------|--------|
| `src/components/la/CsvIntakePanel.tsx` | Add UK coord validation after parsing lat/lng |
| `supabase/functions/score-sites-batch/index.ts` | Add coord validation after geocoding/input resolution |
| `src/components/la/ProgrammeDashboard.tsx` | Add coord validation before portfolio save |
| `src/pages/SiteDetail.tsx` | Add coord validation when reading raw lat/lng for map navigation |
| Migration | Fix existing swapped records |

