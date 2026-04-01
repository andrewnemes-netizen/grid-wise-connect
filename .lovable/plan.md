

## Fix: Ingest All Records Beyond 10,000 Limit

### Problem
The Opendatasoft API caps `offset + limit` at 10,000. The current code stops at that boundary, so datasets with 19k, 179k, or 580k records only ingest 10,000.

The same 10k cap exists in the NPG/CKAN ingestion path.

### Solution: Use the Opendatasoft Export Endpoint

Instead of paginating with `/api/records?offset=N`, use the **bulk export endpoint**:
```
/api/explore/v2.1/catalog/datasets/{dataset_id}/exports/geojson
```

This streams the **entire dataset** as GeoJSON with no offset limit. We process it as a stream, batching inserts in chunks of 500.

For CKAN sources: use the CKAN `datastore_search` with `_id` cursor (`where _id > last_id`) instead of offset to bypass the 10k cap.

### Implementation

**File: `supabase/functions/dno-open-data-ingest/index.ts`**
- Add a new `ingestViaExport()` path that fetches the full GeoJSON export endpoint
- Stream-parse the response using `response.body.getReader()` to avoid memory issues on 500k+ datasets
- Batch-insert features in groups of 500 via existing `batch_insert_geo_features` RPC
- Use export path when `totalRecords > 10,000`; keep existing paginated path for smaller datasets
- Remove the `offset + batch_size > 10000` break condition from the paginated path

**File: `supabase/functions/npg-dataset-ingest/index.ts`**
- For Opendatasoft sources: same export endpoint approach
- For CKAN sources: replace offset pagination with cursor-based (`"_id" > last_seen_id`) to bypass the 10k cap
- Remove the `offset >= 10000` break conditions

### Streaming architecture (for large datasets)

```text
Export endpoint → streaming reader → JSON chunk parser
  → batch of 500 features → RPC insert → next batch
  → periodic feature_count update every 5,000 rows
```

### Risk mitigation
- Edge functions have a ~400s timeout; for very large datasets (500k+), we return progress and support resumption via a `last_id` parameter
- If the export endpoint fails (some portals don't support it), fall back to the 10k paginated approach and log a warning

### Files to change
| File | Change |
|------|--------|
| `supabase/functions/dno-open-data-ingest/index.ts` | Add export-based streaming ingest for datasets > 10k records |
| `supabase/functions/npg-dataset-ingest/index.ts` | Same export path + CKAN cursor pagination |

### No database changes needed

