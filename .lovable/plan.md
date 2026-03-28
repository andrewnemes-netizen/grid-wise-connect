

## Fix NaPTAN Memory Limit + End-to-End Test Results

### Test Results So Far

| Component | Status | Details |
|-----------|--------|---------|
| Safety Engine | **PASS** | Returns risk score, accident counts, AI narrative |
| Score Site | **PASS** | Returns distances, constraints, nearest substations |
| DfT Traffic | **PASS** | 46,251 count points ingested |
| STATS19 Accidents | **PASS** | 131,000 records ingested |
| NaPTAN Transport | **FAIL** | Memory limit exceeded — 0 records |

### Root Cause

The NaPTAN CSV is ~100MB+ (~434k rows). Line 115 does `await csvResp.text()` which loads the entire file into memory, exceeding the Supabase edge function memory limit (~150MB).

### Fix: Stream-Parse the CSV

Rewrite `processNaptan` to use the Deno `ReadableStream` API to read the CSV response body as a stream, parsing line-by-line without buffering the entire file. This is the same pattern used by the STATS19 ingest for large files.

**Approach:**
1. Use `csvResp.body.getReader()` to read chunks
2. Maintain a line buffer, splitting on newlines
3. Parse and batch-insert as lines arrive
4. Never hold the full CSV in memory

### Impact

Once NaPTAN data loads, the safety engine's accessibility scores will populate (bus stops, rail stations), completing the decision engine's 4-pillar scoring: Traffic, Safety, Grid, and Accessibility.

### Files to Change

- `supabase/functions/naptan-ingest/index.ts` — Replace `csvResp.text()` with streaming line parser

