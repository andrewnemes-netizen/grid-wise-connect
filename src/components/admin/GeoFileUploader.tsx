import { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle, AlertCircle, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { gmlToGeoJSON, decompressGzip } from "@/lib/gmlParser";

interface GeoFileUploaderProps {
  layerId: string;
  layer: {
    display_name: string;
    storage_table: string;
    dno: string;
    category: string;
    geometry_type: string;
  };
  onComplete: () => void;
}

interface FileStatus {
  name: string;
  status: "pending" | "parsing" | "uploading" | "done" | "error";
  progress: number;
  inserted: number;
  featureCount: number;
  hasSpatial: boolean;
  error?: string;
}

/** Parse a file into a feature collection. For CSVs without geometry, features will have null geometry. */
async function parseFile(file: File): Promise<{ geojson: GeoJSON.FeatureCollection; hasSpatial: boolean }> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "geojson" || ext === "json") {
    const text = await file.text();
    const geojson = JSON.parse(text);
    if (geojson.type !== "FeatureCollection") {
      throw new Error("File must be a GeoJSON FeatureCollection");
    }
    return { geojson, hasSpatial: true };
  }

  if (ext === "gml") {
    const text = await file.text();
    return { geojson: gmlToGeoJSON(text), hasSpatial: true };
  }

  if (ext === "gz" && file.name.toLowerCase().endsWith(".gml.gz")) {
    const buffer = await file.arrayBuffer();
    const text = await decompressGzip(buffer);
    return { geojson: gmlToGeoJSON(text), hasSpatial: true };
  }

  if (ext === "csv") {
    const text = await file.text();
    return csvToGeoJSONFlexible(text);
  }

  throw new Error("Unsupported format. Upload GeoJSON, CSV, or GML.");
}

export function GeoFileUploader({ layerId, layer, onComplete }: GeoFileUploaderProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [overallStatus, setOverallStatus] = useState("");

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      console.log("[GeoUploader] File input changed");
      const selected = e.target.files;
      if (!selected || selected.length === 0) return;
      console.log("[GeoUploader] Files selected:", Array.from(selected).map(f => f.name));
      setFiles((prev) => [...prev, ...Array.from(selected)]);
      setAllDone(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      console.error("[GeoUploader] Error in handleFilesSelected:", err);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadAll = async () => {
    if (files.length === 0) return;

    console.log("[GeoUploader] handleUploadAll started, files:", files.length);
    setUploading(true);
    setAllDone(false);
    setOverallStatus("Parsing files…");

    try {
    console.log("[GeoUploader] Phase 1: Parsing files");

    const statuses: FileStatus[] = files.map((f) => ({
      name: f.name,
      status: "pending",
      progress: 0,
      inserted: 0,
      featureCount: 0,
      hasSpatial: false,
    }));
    setFileStatuses([...statuses]);

    // Phase 1: Parse all files
    const parsed: { geojson: GeoJSON.FeatureCollection; hasSpatial: boolean }[] = [];
    let hasError = false;

    for (let i = 0; i < files.length; i++) {
      statuses[i].status = "parsing";
      setFileStatuses([...statuses]);

      try {
        const result = await parseFile(files[i]);
        parsed.push(result);
        statuses[i].featureCount = result.geojson.features.length;
        statuses[i].hasSpatial = result.hasSpatial;
        statuses[i].status = "pending";
      } catch (err: any) {
        parsed.push({ geojson: { type: "FeatureCollection", features: [] }, hasSpatial: false });
        statuses[i].status = "error";
        statuses[i].error = err.message;
        hasError = true;
      }
      setFileStatuses([...statuses]);
    }

    // Phase 2: Find the spatial file(s) and merge geometry into non-spatial files by row order
    const spatialFiles = parsed.filter((p) => p.hasSpatial && p.geojson.features.length > 0);
    const spatialGeometries: (GeoJSON.Geometry | null)[] = [];

    // Collect all geometries from spatial files in order
    spatialFiles.forEach((sf) => {
      sf.geojson.features.forEach((f) => {
        if (f.geometry) spatialGeometries.push(f.geometry);
      });
    });

    // For non-spatial files, assign geometry by row order
    if (spatialGeometries.length > 0) {
      for (let i = 0; i < parsed.length; i++) {
        if (statuses[i].status === "error") continue;
        if (!parsed[i].hasSpatial && parsed[i].geojson.features.length > 0) {
          setOverallStatus(`Merging geometry into ${files[i].name}…`);
          const features = parsed[i].geojson.features;
          for (let r = 0; r < features.length; r++) {
            if (r < spatialGeometries.length) {
              features[r] = { ...features[r], geometry: spatialGeometries[r]! };
            }
          }
          // Remove features that didn't get geometry
          parsed[i].geojson.features = features.filter((f) => f.geometry != null);
          statuses[i].featureCount = parsed[i].geojson.features.length;
          setFileStatuses([...statuses]);
        }
      }
    } else {
      // No spatial files at all — mark non-spatial files as error
      for (let i = 0; i < parsed.length; i++) {
        if (statuses[i].status !== "error" && !parsed[i].hasSpatial) {
          statuses[i].status = "error";
          statuses[i].error = "No geometry found — include at least one file with coordinates or Geo Shape";
          hasError = true;
        }
      }
      setFileStatuses([...statuses]);
    }

    // Phase 3: Upload features from each file
    let totalInserted = 0;

    for (let i = 0; i < parsed.length; i++) {
      if (statuses[i].status === "error") continue;

      const features = parsed[i].geojson.features;
      if (features.length === 0) {
        statuses[i].status = "done";
        setFileStatuses([...statuses]);
        continue;
      }

      statuses[i].status = "uploading";
      setFileStatuses([...statuses]);
      setOverallStatus(`Uploading ${files[i].name}…`);

      try {
        const BATCH_SIZE = 500;
        let fileInserted = 0;

        for (let b = 0; b < features.length; b += BATCH_SIZE) {
          const batch = features.slice(b, b + BATCH_SIZE);

          console.log(`[GeoUploader] Sending batch ${b}-${b + batch.length} of ${features.length} for ${files[i].name}`);
          const res = await supabase.functions.invoke("ingest-geo-features", {
            body: {
              layer_id: layerId,
              storage_table: layer.storage_table,
              dno: layer.dno,
              features: batch.map((f) => ({
                geometry: f.geometry,
                properties: f.properties || {},
              })),
            },
          });

          if (res.error) {
            throw new Error(res.error.message || String(res.error));
          }
          fileInserted += res.data?.inserted || 0;
          statuses[i].progress = Math.round(((b + batch.length) / features.length) * 100);
          setFileStatuses([...statuses]);
        }

        statuses[i].status = "done";
        statuses[i].inserted = fileInserted;
        totalInserted += fileInserted;
      } catch (err: any) {
        statuses[i].status = "error";
        statuses[i].error = err.message;
        hasError = true;
      }
      setFileStatuses([...statuses]);
    }

    setUploading(false);
    setAllDone(true);
    setOverallStatus("");

    if (totalInserted > 0) {
      toast({
        title: "Upload complete",
        description: `${totalInserted.toLocaleString()} features ingested from ${files.length} file${files.length !== 1 ? "s" : ""}.`,
      });
    }
    if (hasError) {
      toast({
        title: "Some files had errors",
        description: "Check individual file statuses below.",
        variant: "destructive",
      });
    }
    } catch (err: any) {
      console.error("Upload crashed:", err);
      setUploading(false);
      setAllDone(false);
      setOverallStatus("");
      toast({
        title: "Upload failed",
        description: err?.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    setFiles([]);
    setFileStatuses([]);
    setAllDone(false);
    setUploading(false);
    setOverallStatus("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px]">{layer.dno}</Badge>
        <Badge variant="secondary" className="text-[10px] capitalize">{layer.category}</Badge>
        <Badge variant="secondary" className="text-[10px]">{layer.geometry_type}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Upload one or more files. If a file has no coordinates, geometry is inherited from the spatial
        file(s) in the same batch by row order — so you can combine a geometry file with separate
        attribute files.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".geojson,.json,.csv,.gml,.gz"
        multiple
        onChange={handleFilesSelected}
        className="hidden"
      />

      {/* Queued file list */}
      {files.length > 0 && !uploading && !allDone && (
        <div className="space-y-1.5 border rounded-md p-2">
          {files.map((f, idx) => (
            <div key={`${f.name}-${idx}`} className="flex items-center gap-2 text-xs">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-muted-foreground shrink-0">
                {(f.size / 1024).toFixed(0)} KB
              </span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => removeFile(idx)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Progress display */}
      {(uploading || allDone) && fileStatuses.length > 0 && (
        <div className="space-y-2 border rounded-md p-2">
          {fileStatuses.map((fs, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                {fs.status === "pending" && <Loader2 className="h-3 w-3 text-muted-foreground shrink-0" />}
                {fs.status === "parsing" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
                {fs.status === "uploading" && <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}
                {fs.status === "done" && <CheckCircle className="h-3 w-3 text-primary shrink-0" />}
                {fs.status === "error" && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
                <span className="truncate flex-1">{fs.name}</span>
                {fs.status === "parsing" && <span className="text-muted-foreground shrink-0">parsing…</span>}
                {fs.status === "done" && (
                  <span className="text-muted-foreground shrink-0">{fs.inserted.toLocaleString()} features</span>
                )}
                {!fs.hasSpatial && fs.status !== "error" && fs.featureCount > 0 && (
                  <Badge variant="outline" className="text-[9px] shrink-0">inherits geometry</Badge>
                )}
              </div>
              {fs.status === "uploading" && <Progress value={fs.progress} className="h-1.5" />}
              {fs.status === "error" && (
                <p className="text-[10px] text-destructive pl-5">{fs.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {overallStatus && uploading && (
        <p className="text-xs text-muted-foreground text-center">{overallStatus}</p>
      )}

      {/* Action buttons */}
      {!uploading && !allDone && (
        <div className="flex gap-2">
          <Button onClick={() => fileRef.current?.click()} variant="outline" className="flex-1">
            <Upload className="mr-2 h-4 w-4" />
            {files.length === 0 ? "Select Files" : "Add More Files"}
          </Button>
          {files.length > 0 && (
            <Button onClick={handleUploadAll} className="flex-1">
              Upload {files.length} File{files.length !== 1 ? "s" : ""}
            </Button>
          )}
        </div>
      )}

      {allDone && (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset}>Upload More</Button>
          <Button size="sm" onClick={onComplete}>Done</Button>
        </div>
      )}
    </div>
  );
}

/**
 * CSV → GeoJSON with flexible geometry handling.
 * If the CSV has lat/lng or Geo Shape columns, features get proper geometry (hasSpatial=true).
 * If not, features are created with null geometry (hasSpatial=false) so they can inherit from another file.
 */
function csvToGeoJSONFlexible(csvText: string): { geojson: GeoJSON.FeatureCollection; hasSpatial: boolean } {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = parseCSVRow(headerLine).map((h) => h.trim().toLowerCase());

  const geoShapeIdx = headers.findIndex((h) => ["geo shape", "geo_shape", "geoshape", "geometry", "geom"].includes(h));
  const latIdx = headers.findIndex((h) => ["lat", "latitude", "y", "site_northing"].includes(h));
  const lngIdx = headers.findIndex((h) => ["lng", "lon", "longitude", "x", "site_easting"].includes(h));

  const hasSpatial = geoShapeIdx !== -1 || (latIdx !== -1 && lngIdx !== -1);

  const features: GeoJSON.Feature[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCSVRow(lines[i]);

    let geometry: GeoJSON.Geometry | null = null;

    if (geoShapeIdx !== -1 && vals[geoShapeIdx]) {
      try {
        geometry = JSON.parse(vals[geoShapeIdx]);
      } catch {
        continue;
      }
    } else if (latIdx !== -1 && lngIdx !== -1) {
      const lat = parseFloat(vals[latIdx]);
      const lng = parseFloat(vals[lngIdx]);
      if (isNaN(lat) || isNaN(lng)) continue;
      geometry = { type: "Point", coordinates: [lng, lat] };
    }

    // Build properties from all non-geometry columns
    const props: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (idx !== geoShapeIdx && idx !== latIdx && idx !== lngIdx) {
        props[h] = vals[idx] || null;
      }
    });

    // For non-spatial files, create feature with null geometry (to be inherited)
    features.push({ type: "Feature", geometry: geometry!, properties: props });
  }

  return { geojson: { type: "FeatureCollection", features }, hasSpatial };
}

/** Parse a single CSV row, respecting quoted fields. */
function parseCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < row.length && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
