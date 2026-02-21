
## Fix: Admin Layer Upload Refresh Issue

### Root Cause

The "refreshing" is caused by the eager file parsing in `handleFilesSelected`. When a file is selected, the component immediately reads and parses the entire file content using synchronous `JSON.parse()` just to detect the geometry type for a preview badge. For large GeoJSON files (thousands of features, several MB), this blocks the browser's main thread for multiple seconds, causing the Vite dev server WebSocket heartbeat to time out. When the heartbeat reconnects, Vite triggers a full page reload -- wiping out all component state including the selected files.

### Solution

Replace the eager full-file parsing with a lightweight geometry detection approach that only reads the first few kilobytes of the file to identify the geometry type. The full parsing will only happen when the user actually clicks "Upload."

This is a minimal, targeted change that will not affect layer rendering, map performance, or the ingestion pipeline.

### Changes

**File: `src/components/admin/GeoFileUploader.tsx`**

1. Replace the eager `parseFile()` call inside `handleFilesSelected` with a new lightweight `detectGeomTypeFromFile()` function that:
   - For GeoJSON/JSON files: reads only the first 10KB of the file using `file.slice(0, 10240).text()`, then uses a regex to find the first `"type": "Point"` (or LineString, Polygon, etc.) pattern -- no full JSON.parse needed
   - For CSV files: reads just the header row to check for lat/lng columns, returns "Point" or "No geometry"
   - For GML files: reads the first few KB and looks for geometry element names (`<gml:Point>`, `<gml:Polygon>`, etc.)
   - Returns the detected type string immediately without blocking

2. Keep the full `parseFile()` call only in `handleUploadAll` (Phase 1) where it already exists -- no change needed there

### What This Does NOT Change

- The upload logic, batch processing, and progress bar remain identical
- The ingestion edge function is untouched
- The layer registry, map rendering, and layer toggle behavior are all unchanged
- The Dialog stability fixes (pointer/interact/focus outside prevention) remain in place
- No new dependencies needed

### Technical Detail

```text
Current flow (blocks main thread):
  File selected -> file.text() -> JSON.parse(full file) -> detectGeometryType(all features) -> setState

New flow (non-blocking):
  File selected -> file.slice(0, 10KB).text() -> regex match first geometry type -> setState
```

The full parse still runs when "Upload" is clicked, but at that point the user expects processing time and the upload spinner is visible.
