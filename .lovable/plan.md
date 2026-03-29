

## P0: OSM Ingestion Metadata Table

### Purpose
Track every Overpass fetch with a deterministic fingerprint (query hash + tile/bbox) so route calculations are reproducible and auditable. This is the provenance layer the validation report flagged as missing.

### Database Migration

Create table `osm_ingestion_meta`:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| layer_slug | text NOT NULL | e.g. `osm_major_roads` |
| source_endpoint | text | which Overpass mirror responded |
| query_hash | text NOT NULL | SHA-256 of the Overpass QL query |
| query_text | text | the actual QL for debugging |
| tile_id | text | optional z/x/y if tile-based fetching is added later |
| bbox | jsonb NOT NULL | `[south, west, north, east]` |
| fetched_at | timestamptz | default now() |
| row_count | integer | features returned |
| status | text | `success` or `error` |
| error_detail | text | nullable, for failed fetches |
| fetched_by | uuid | user who triggered the fetch |

RLS: admins full access, authenticated users SELECT.

Index on `(layer_slug, query_hash)` for dedup lookups.

### Edge Function Update (`overpass-road-fetch/index.ts`)

After a successful Overpass response:
1. Compute SHA-256 of the query string
2. INSERT a row into `osm_ingestion_meta` with the layer slug, bbox, endpoint used, feature count, and user ID
3. This is fire-and-forget (don't block the response)

On error, insert a row with `status = 'error'` and the error detail.

### Frontend — No Changes

This is purely backend metadata. No UI needed for P0. Future phases can add an admin panel to browse ingestion history.

### Files Changed
- Database migration — create `osm_ingestion_meta` table + RLS + index
- `supabase/functions/overpass-road-fetch/index.ts` — add metadata INSERT after fetch

