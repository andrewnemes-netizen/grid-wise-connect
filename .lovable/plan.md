## Why you can't see the SSEN data

The data **is** ingested correctly — but it's almost all in **Scotland** (the SSEN Transmission licence area covers the north of Scotland and the EGL2 corridor). Your map is currently centred on **Oxford (~51.7° N)**, while the SSEN features sit between **56° N and 58° N**.

Actual extents of populated layers:
- SSEN Poles (Grid): lat 56.3–58.2, lon −6.8 to −5.0 (Highlands / Western Isles)
- SSEN Towers (Grid & Supergrid): lat 56.2–58.4, lon −5.1 to −2.3
- SSEN Overhead Lines (Grid / Supergrid): same Scottish corridor
- SSEN EGL2 Points: lat 57.1–57.5 (Peterhead area)
- SSEN Ground Investigation: lat 53.7–58.6 (Scotland + N. England)

Nothing exists in the Oxford / Southern England area for these layers because that's SEPD (SSEN **Distribution**) territory, not SSEN Transmission — and the Distribution layers (`ssen-dx-*`) have 0 rows because their CKAN resources require manual GeoPackage upload (no public API endpoint).

Secondary issue found: `ssen-dx-generation-availability` has 999 rows but with **corrupted coordinates** (latitude values of `89343` — coordinate-swap / units bug in the ingest mapper). These points will never render on the map.

## Fix

### 1. Backfill `bbox` on layer_registry so "Go to coverage" works
All SSEN layers currently have `bbox = NULL`, so clicking the layer doesn't fly the map anywhere. Run a backfill computing each layer's bbox from its actual geometry:

```sql
-- For every layer with rows but no bbox, set bbox = ST_Extent(geom)
UPDATE layer_registry lr
SET bbox = sub.bbox_jsonb
FROM (
  SELECT layer_id,
         jsonb_build_array(ST_XMin(ext), ST_YMin(ext), ST_XMax(ext), ST_YMax(ext)) AS bbox_jsonb
  FROM (
    SELECT layer_id, ST_Extent(geom)::geometry AS ext FROM geo_points  GROUP BY layer_id
    UNION ALL
    SELECT layer_id, ST_Extent(geom)::geometry FROM geo_cables   GROUP BY layer_id
    UNION ALL
    SELECT layer_id, ST_Extent(geom)::geometry FROM geo_polygons GROUP BY layer_id
  ) e
) sub
WHERE lr.id = sub.layer_id AND lr.bbox IS NULL;
```

After this, clicking the layer name (or its "Go to coverage" action) will fly the map to the Scottish Highlands where the SSEN Transmission assets actually live.

### 2. Clean up the corrupted `ssen-dx-generation-availability` rows
Delete the 999 broken rows and reset that dataset to `pending` so it re-ingests with the now-correct coordinate handling:

```sql
DELETE FROM geo_points
WHERE layer_id = (SELECT id FROM layer_registry WHERE slug='ssen-dx-generation-availability');

UPDATE dno_dataset_registry
SET status='pending', last_error=NULL, rows_ingested=0
WHERE dataset_id LIKE '%generation-availability%' AND source='SSEN';
```

Then hit **Ingest** on that row in Admin → DNO Dataset Registry.

## What you should do after the fix
1. In Map Layers, click **SSEN Poles (Grid)** (or any SSEN row) — the map should fly north to the Highlands.
2. The Distribution layers (`SSEN DX – …`) will remain empty until we either (a) manually upload the GeoPackages from data.ssen.co.uk, or (b) wire a CKAN→GeoPackage downloader. Happy to do either next.
