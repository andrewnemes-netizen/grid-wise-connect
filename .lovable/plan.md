

## Fix Truncated Layer Names in Map Layers Panel

The layer names in the Map Layers panel are being cut off with ellipsis ("UK Power Networks Licenc...", "UK Power Networks Secon...") because the panel is too narrow and the labels use `truncate`.

### Solution
Add a tooltip to each layer name so hovering (or long-pressing on mobile) reveals the full name. This is lighter than widening the panel, which would obscure more of the map.

### Technical Details

**File: `src/components/map/LayerTogglePanel.tsx`**

- Wrap each layer `Label` in a `Tooltip` component (already imported in this file)
- The tooltip will display the full `layer.display_name` on hover
- Keep the existing `truncate` class so the panel layout stays compact
- On mobile, the tooltip will appear on tap-and-hold

The change is localized to the layer name rendering block (~5 lines changed).

