

## Fix: Make Layer Names Scrollable in Map Layers Panel

### Problem
The horizontal scroll doesn't work because the inner container holding the layer name has `min-w-0` and `overflow-x-auto`, but it's inside a `justify-between` flex row competing with the Switch toggle. The flex layout never lets the inner div overflow -- it just clips or wraps instead.

### Solution
Give the inner name container `flex-1` and `overflow-x-auto` so it actually gets a constrained width from the flex layout and can scroll horizontally. Also ensure `min-w-0` is present (it already is) so flex shrinking works.

### Technical Change

**File: `src/components/map/LayerTogglePanel.tsx` (line 250)**

Change the inner div class from:
```
flex items-center gap-2 min-w-0 overflow-x-auto scrollbar-none
```
to:
```
flex items-center gap-2 flex-1 min-w-0 overflow-x-auto scrollbar-none
```

Adding `flex-1` ensures the div takes available space but is constrained by the parent, allowing `overflow-x-auto` to actually trigger horizontal scrolling when the label is wider than the available space.

This is a single class addition on one line.

