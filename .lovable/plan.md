

## Build ENWL (Electricity North West) Registry & Layers

### What We're Building

A full discovery-and-ingestion pipeline for ENWL's Opendatasoft portal (`electricitynorthwest.opendatasoft.com`), reusing the proven NPG pattern. The API key will be stored securely as a backend secret.

### Steps

**1. Store ENWL API key as a secret**
- Use the secrets tool to securely store `ENWL_API_KEY` = `96c63b2b2ba8172274a1e3e51db9a279888ecf6463d992e30911dff0`

**2. Create `supabase/functions/enwl-catalog-crawler/index.ts`**
- Clone of `npg-catalog-crawler` with:
  - `BASE_URL` → `https://electricitynorthwest.opendatasoft.com/api/explore/v2.1`
  - `DNO_KEY` → `"ENWL"`
  - Reads `ENWL_API_KEY` from env for authenticated requests
  - Same pagination, schema detection, and upsert logic into `dno_dataset_registry`

**3. Update `supabase/functions/npg-dataset-ingest/index.ts`**
- Generalise to handle ENWL datasets too — when the registry entry has `dno = "ENWL"`, use the ENWL portal base URL and `ENWL_API_KEY`
- Currently hardcoded to NPG URLs; add a lookup map: `{ NPG: { base, apiKeyEnv }, ENWL: { base, apiKeyEnv } }`

**4. Generalise `NpgDatasetRegistry.tsx` → support multiple DNOs**
- Add a DNO selector (NPG / ENWL) at the top
- Filter `dno_dataset_registry` by selected DNO
- "Discover Datasets" calls the appropriate crawler function (`npg-catalog-crawler` or `enwl-catalog-crawler`)
- Ingest/sync calls remain the same (the ingest function reads DNO from registry)

**5. Update `DnoApiSources.tsx`**
- Add ENWL entry with status `"live"` and correct base URL

**6. Register new edge function in `supabase/config.toml`**
- Add `[functions.enwl-catalog-crawler]` with `verify_jwt = false`

### Files to Change

| File | Change |
|------|--------|
| Secret: `ENWL_API_KEY` | Store API key via secrets tool |
| `supabase/functions/enwl-catalog-crawler/index.ts` | New — clone of NPG crawler for ENWL portal |
| `supabase/functions/npg-dataset-ingest/index.ts` | Generalise to support ENWL base URL + API key |
| `src/components/admin/NpgDatasetRegistry.tsx` | Add DNO selector, call correct crawler per DNO |
| `src/components/admin/DnoApiSources.tsx` | Add ENWL as `"live"` DNO |
| `supabase/config.toml` | Register `enwl-catalog-crawler` function |

