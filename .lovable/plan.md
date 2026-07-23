## Plan

1. Update `WpMatrixTab.tsx` only.
2. Replace the current `Card`-level `overflow-auto max-h[...]` approach with a dedicated table scroll wrapper inside the card:
   - The wrapper will have `overflow-auto` and a constrained height such as `max-h-[calc(100vh-18rem)]`.
   - The `<table>` will keep its existing width/column sizing behavior.
   - The horizontal scrollbar will belong to this wrapper, not the overall page.
3. Keep the existing table layout, columns, stage widths, sticky left Site column, data, and controls unchanged.
4. If needed, make the table header sticky inside the same scroll container so vertical scrolling within the table remains usable, without altering column layout.
5. Verify in the browser by opening the Pre-Con Progress page, scrolling the table body roughly halfway down inside the table container, and capturing/inspecting a screenshot that shows:
   - The page itself is not scrolled to the bottom.
   - Rows are vertically scrolled within the table wrapper.
   - The horizontal scrollbar is visible at the bottom of the table container.