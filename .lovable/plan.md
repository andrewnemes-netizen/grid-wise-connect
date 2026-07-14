## Goal
Expose the SSEN Google Drive "annotation" shapefile layers (e.g. `electric_ed_cabinet_sc_anno_annotation_shepd`, cable annotations, isolating equipment annotations, etc.) on the main GIS map so they can be toggled on like any other registry layer.

## Current state
- Annotation layers ARE ingested — the admin panel shows feature counts (8,896, 7,245, 11,681, etc.) and each has a `layer_registry` row with `source_type = 'drive_shapefile'` and slug prefix `ssen-drive-*`.
- `LayerTogglePanel` / `useLayerManager` render registry layers on the map from `layer_registry`.
- Annotation layers are likely either (a) filtered out of the toggle panel, or (b) shown but rendered with a style that doesn't display point/label geometry, or (c) missing a category grouping so users can't find them.

## Plan

1. **Investigate** (read-only) how registry layers surface on the map:
   - `src/components/map/LayerTogglePanel.tsx` — check if `is_annotation` or slug pattern is filtered out.
   - `src/hooks/useLayerManager.ts` — check how `ssen-drive-*` sources are added, and whether annotation geometry (usually Point with a `text`/`label` attribute) gets a symbol/text layer.
   - `supabase/functions/ssen-drive-ingest/index.ts` — confirm what geometry + properties annotation shapefiles land with (text field name, e.g. `TEXT_`, `TEXTSTRING`).
   - `layer_registry` rows for a couple of annotation slugs to see `geometry_type`, `default_style`, `category`.

2. **Surface annotation layers in the toggle panel**
   - Add a dedicated "SSEN Annotations" group (or reuse the existing SSEN group) so the 18 annotation layers are discoverable but collapsed by default (they're noisy).
   - Ensure `is_annotation` layers are not filtered out.

3. **Render annotations correctly on the map**
   - For annotation layers (Point geometry with a text attribute), add a MapLibre `symbol` layer using `text-field` bound to the annotation string, with:
     - `text-size` scaling by zoom (min-zoom ~15 to avoid clutter),
     - `text-halo-color` white / `text-halo-width` 1 for readability,
     - `text-anchor: center`, `text-allow-overlap: false`.
   - Keep the existing circle/line/fill rendering for non-annotation `ssen-drive-*` layers unchanged.
   - Auto-detect the text property (first of `TEXT_`, `TEXTSTRING`, `text`, `label`, `ANNO`) at layer-add time.

4. **Legend + min-zoom UX**
   - Hide annotation labels below zoom 14–15 to prevent map clutter and update `MapLegend` to show a small "Aa" swatch for annotation layers when visible.

5. **Verify**
   - Toggle 1–2 annotation layers (e.g. `electric_eo_isolating_eqpt_sc_anno_annotation_shepd`) at zoom 16 over a SHEPD area and confirm labels render.

## Out of scope
- Re-ingesting annotation shapefiles, changing schema, or altering the admin ingest UI.
- Styling non-annotation Drive layers.

## Files likely to change
- `src/hooks/useLayerManager.ts` (add symbol layer branch for annotations)
- `src/components/map/LayerTogglePanel.tsx` (grouping + ensure annotations listed)
- `src/components/map/MapLegend.tsx` (annotation legend entry)
