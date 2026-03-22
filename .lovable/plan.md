

## DfT Road Traffic Count Points — Map Layer Integration

### What we're building

A new map layer showing ~23,500 DfT traffic count point locations across England, with circle markers sized/coloured by traffic volume (AADF). Clicking a count point shows a detail panel with vehicle breakdown (cars, HGVs, buses, cycles). No API key needed — the DfT API is fully public.

### Architecture

Following the existing pattern: edge function proxy → `geo_points` storage → `layer_registry` entry → map rendering via `useLayerManager`.

### Implementation Steps

**1. Create edge function `dft-traffic-proxy`**
- Fetches from `https://roadtraffic.dft.gov.uk/api/count-points` with pagination (`page[size]=1000`)
- Extracts `latitude`, `longitude`, `road_name`, `road_category`, `local_authority_name`, and latest AADF data
- Returns GeoJSON FeatureCollection for ingestion into `geo_points`
- Also supports a detail endpoint: given a count point ID, fetches `/api/average-annual-daily-flow?filter[count_point_id]=X` to return vehicle breakdown

**2. Database migration**
- Insert a `layer_registry` entry: slug `dft_traffic_count_points`, category `Transport`, dno