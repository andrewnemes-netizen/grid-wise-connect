

## Fix: Map Toolbar Overlap with Preview Controls

### Problem
The map toolbar is positioned at `bottom-4 right-4` (16px from bottom-right). On mobile devices, the Lovable preview bar overlaps with the bottom toolbar buttons (Clear all / Reset view).

### Solution
Increase the bottom offset of the toolbar so it sits above the preview controls.

### Changes

**File: `src/components/map/MapToolbar.tsx`**
- Change the container positioning from `bottom-4` to `bottom-16` to move the toolbar up and clear the preview/navigation bar area.

This is a single-line CSS class change that preserves all existing functionality.

