I agree the three screenshots show a repeatable 3–6 m discrepancy. The most likely issue is not just the visible marker size: the currently loaded dataset still has the older coordinates and does not contain the original Easting/Northing values, so I cannot apply a correction in-place from the database. I also want to make the map rendering more suitable for street-light QA at high zoom.

Plan:

1. Validate the coordinate transform implementation
   - Add focused tests for the high-precision BNG → WGS84 conversion using Leeds-area coordinates.
   - Compare the current Helmert conversion against the OSTN15 conversion so we can prove the old systematic ~3 m shift is gone.
   - Fix the OSTN15 helper if the test exposes a sign, grid-origin, rounding, or axis-order issue.

2. Improve the Leeds re-ingestion flow
   - Keep storing the original `easting` and `northing` values on every point so future corrections can be done without asking for the CSV again.
   - Make the CSV parsing more robust than simple `split(',')`, so quoted fields or embedded commas cannot silently shift columns and create bad coordinates.
   - Add clear status messaging in Admin that existing rows without Easting/Northing are legacy rows and must be replaced by a fresh upload.

3. Add a bulk coordinate correction path for existing data
   - Because the existing 108,448 database rows currently have no persisted Easting/Northing, a true mathematical reprojection still requires re-uploading the source Leeds CSV once.
   - After re-upload, the stored Easting/Northing values will allow future automated recalculation without re-upload.
   - I will keep the layer clear/re-upload process intact but make it harder to accidentally append duplicate/legacy rows.

4. Make the map marker accurate at street-level zoom
   - Add Leeds-specific map styling so street-light points render as a smaller precision marker at high zoom rather than a large orange dot that can appear offset by several metres.
   - Use the layer’s existing style configuration where possible so the database-defined `circle-radius: 2.5` is actually respected instead of the generic default radius.
   - Keep the marker visible enough at normal zooms, but reduce visual ambiguity when zoomed in to lamp-post/kerb level.

5. Verify the loaded data after re-ingestion support is in place
   - Query the database to confirm the layer contains Easting/Northing on the new rows.
   - Check a Leeds-area sample to confirm the coordinates are using the precise transform and are no longer legacy rows.
   - If you still see a consistent offset after this, I will add a small admin QA tool to compare selected lamp IDs against measured ground-truth positions and derive whether the council dataset itself has a local survey offset.

Important note:
The screenshots are being compared against aerial/street imagery. Those image layers can themselves be offset by a few metres, especially on mobile/tilted imagery and at high zoom. The correct engineering fix is to ensure the council BNG coordinates are transformed precisely and that the symbol is rendered precisely; then any remaining discrepancy is likely source-data or imagery alignment rather than Gridwise conversion error.