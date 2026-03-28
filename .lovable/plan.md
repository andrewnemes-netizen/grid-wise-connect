

## Fix NaPTAN Partial Ingestion — CPU Timeout at 140k/434k

### Problem

The NaPTAN ingestion hit `CPU Time exceeded` after inserting 140,000 of ~300k eligible records (434k total minus ~100k filtered). The `EdgeRuntime.waitUntil` background task has a ~60s CPU budget, which isn't enough for the full dataset. The Leeds area and many other regions have zero NaPTAN data because the CSV rows for those areas come after the 140k cutoff.

### Solution: Resumable Chunked Ingestion

Split the ingestion into resumable chunks. Each invocation processes N records then stops. The admin UI auto-chains calls until complete.

### Implementation

**1. Update `supabase/functions/naptan-ingest/index.ts`**

- Accept an optional `offset` parameter in the request body (default 0)
- Track how many CSV lines have been processed (not just inserted)
- After processing ~40k eligible records (well within CPU budget), stop and return `{ done: false, next_offset: <line_number>, inserted: N }`
- When the CSV is fully consumed, return `{ done: true, total_inserted: N }`
- Keep the streaming parser but add line counting and early termination

```text
Request:  { action: "ingest", offset: 0 }
Response: { done: false, next_offset: 85000, inserted: 40000 }

Request:  { action: "ingest", offset: 85000 }
Response: { done: false, next_offset: 170000, inserted: 40000 }

... repeat until done: true
```

**2. Update `src/components/admin/DnoApiSources.tsx`**

- For NaPTAN sync, implement a loop: call the edge function, if `done === false`, immediately call again with the returned `next_offset`
- Show progress in the UI ("Ingesting NaPTAN: 80,000 / ~300,000...")
- Continue until `done === true`

### Technical Details

- The CSV is ordered geographically (roughly south to north by ATCO code prefix), so offset-based resumption via line counting works reliably
- Each chunk skips `offset` lines from the CSV start, which means re-downloading the CSV each call — but the streaming reader can skip lines cheaply without parsing them
- Batch size per call: ~40k eligible records (takes ~30s CPU, safely under the 60s limit)
- The `upsert` with `onConflict: "layer_id,asset_id"` ensures idempotent re-runs

### Files to Change

- `supabase/functions/naptan-ingest/index.ts` — Add offset/resume logic, synchronous processing (no waitUntil), return progress
- `src/components/admin/DnoApiSources.tsx` — Auto-chain NaPTAN calls in a loop until complete

