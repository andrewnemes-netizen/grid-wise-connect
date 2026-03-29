

## Fix Memory & Timeout Errors in Ingest Function

### Problem
Two functions load entire responses into memory before processing:
1. **`ingestViaGeoJsonExport`** (line 291): `await resp.json()` — loads full GeoJSON file into memory
2. **`ingestViaCkanGeoJson`** (line 508): `await resp.json()` — same issue
3. **`ingestViaCsvExport`** (line 340): `await resp.text()` — loads full CSV into memory

For large UKPN/Cadent datasets (10k+ features, complex polygon geometries), this exceeds Edge Function memory limits.

### Solution: Streaming + Chunked Processing

| # | File | Change |
|---|------|--------|
| 1 | `supabase/functions/npg-dataset-ingest/index.ts` | Replace `ingestViaGeoJsonExport` with a streaming JSON parser that reads the response body as a stream, extracts individual GeoJSON features incrementally, and inserts them in batches without holding the full file in memory. |
| 2 | Same file | Replace `ingestViaCkanGeoJson` with the same streaming approach. |
| 3 | Same file | Replace `ingestViaCsvExport` with line-by-line streaming — read the response body as text chunks, split on newlines, parse CSV rows incrementally, and batch-insert. |
| 4 | Same file | Add a `streamJsonFeatures` helper that uses `response.body.getReader()` to incrementally parse a GeoJSON FeatureCollection, yielding features one at a time via a buffer approach. |
| 5 | Same file | Add a `streamCsvRows` helper that reads the response body as text stream, accumulates line fragments, and yields parsed CSV rows. |
| 6 | Same file | Increase the background timeout from 280s to 400s (Edge Functions support up to ~400s for background tasks via `waitUntil`). |

### Technical Detail: Streaming GeoJSON Parser

Since GeoJSON FeatureCollections follow a predictable structure (`{"type":"FeatureCollection","features":[{...},{...}]}`), the streaming parser will:
1. Read chunks from `response.body.getReader()`
2. Accumulate text in a buffer
3. Track brace depth to detect complete Feature objects within the `features` array
4. When a complete feature is found, parse it and add to a batch buffer
5. When batch buffer reaches `batchSize`, insert and clear

This avoids holding >1 feature in memory at a time beyond the current batch.

### Streaming CSV Parser

1. Read chunks via `response.body.getReader()` + `TextDecoderStream`
2. Split on `\n`, accumulate partial lines across chunks
3. First line = headers
4. Each subsequent complete line → parse → add to batch → insert when full

### Expected Outcome
- Datasets with 10k+ features or large polygon geometries will ingest without memory crashes
- The 280s timeout is extended to 400s for very large datasets
- Existing small datasets continue to work identically (streaming is transparent)

