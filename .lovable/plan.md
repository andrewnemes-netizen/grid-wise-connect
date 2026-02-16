

## Lower SSEN Substation Layer min_zoom

### What Will Change

The SSEN Substation Data layer currently requires zoom level 8 before it appears. The default map zoom is 6, so the layer is invisible when first toggled on. This change will lower `min_zoom` from 8 to 5, matching the standard threshold used by other infrastructure layers, so it appears immediately at the default zoom.

### Technical Details

**Database update:**
- Update `layer_registry` for id `ea9ab4df-ce81-4e12-bbb2-1d14f355aeb8` (SSEN Substation Data)
- Change `min_zoom` from `8` to `5`

No code file changes are needed -- just a single database update.

