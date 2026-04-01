

## Fix: LV Underground Cables Ingestion (580k records)

### Root causes found during testing

1. **CPU Time exceeded** — `PREFIXES_PER_RUN = 8` processes ~18k records per edge function run, exceeding the CPU budget
2. **Stuck "Processing" state** — when a run crashes, the self-continuation chain breaks and the dataset stays stuck
3. **Reset button only clears `processing`** — doesn't handle `partial` status, so stuck partial datasets can't be retried
4. **12-minute stale threshold** too long — edge functions die in ~5 seconds of CPU time

### Changes

**File: `supabase/functions/npg-dataset-ingest/index.ts`**
- Reduce `PREFIXES_PER_RUN` from 8 to **2** (each prefix ≈ 2,270 records for this dataset = ~4,500 records per run)
- This keeps CPU usage well within limits while still making progress (128 self-continuations to complete)

**File: `src/components/admin/NpgDatasetRegistry.tsx`**
- Reduce `STALE_PROCESSING_MS` from 12 minutes to **2 minutes**
- Make "Reset Stuck" also reset datasets stuck in `partial` status (where `last_sync_at` is stale)
- Update the stuck count stat to include stale `partial` records

**Database migration**
- Clear all NPG datasets currently stuck in `processing` or `partial` state so LV Underground Cables can be retried fresh

### Expected result
- Click "Ingest" on LV Underground Cables
- Each run processes ~4,500 records in 2 hex prefixes, then self-continues
- 128 sequential runs complete the full 580k dataset
- If any run crashes, the 2-minute stale window auto-clears the lock
- "Reset Stuck" button works for both `processing` and stale `partial` states

### No schema changes needed — only edge function logic and UI timing adjustments

