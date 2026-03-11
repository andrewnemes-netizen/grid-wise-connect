import { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle, AlertCircle, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { gmlToGeoJSON, decompressGzip, bngToWgs84 } from "@/lib/gmlParser";
import { detectGeometryType } from "@/lib/detectGeometryType";
import * as shapefile from "shapefile";

const GEOM_TYPE_RE = /"type"\s*:\s*"(Multi)?(Point|LineString|Polygon|GeometryCollection)"/i;
const GML_GEOM_RE = /<gml:(Point|LineString|Polygon|MultiPoint|MultiLineString|MultiPolygon|MultiSurface|MultiCurve)/i;

/** Lightweight geometry type detection — reads only the first 10 KB of the file. */
async function detectGeomTypeFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "shp") return "Shapefile";

  if (ext === "csv") {
    const header = await file.slice(0, 1024).text();
    const cols = header.split(/[\r\n]/)[0].toLowerCase();
    if (/\b(lat|latitude|northing|y)\b/.test(cols) && /\b(lng|lon|longitude|easting|x)\b/.test(cols)) {
      return "Point";
    }
    if (/\bgeo[_ ]?shape\b/.test(cols) || /\bgeometry\b/.test(cols) || /\bwkt\b/.test(cols)) {
      return "Geometry";
    }
    return "No geometry";
  }

  if (ext === "gml" || (ext === "gz" && file.name.toLowerCase().endsWith(".gml.gz"))) {
    const chunk = await file.slice(0, 10240).text();
    const m = chunk.match(GML_GEOM_RE);
    if (m) return m[1].replace(/^Multi(Surface|Curve)$/, (_, s) => s === "Surface" ? "MultiPolygon" : "MultiLineString").replace(/^Multi/, "");
    return "Unknown";
  }

  // GeoJSON / JSON
  const chunk = await file.slice(0, 10240).text();
  const m = chunk.match(GEOM_TYPE_RE);
  if (m) return m[2]; // base type without Multi prefix
  return "Unknown";
}

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
  detectedGeomType: string;
  error?: string;
}

/** Parse a file into a feature collection. For CSVs without geometry, features will have null geometry. */
async function parseFile(file: File, companionFiles?: File[]): Promise<{ geojson: GeoJSON.FeatureCollection; hasSpatial: boolean }> {
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

  if (ext === "shp") {
    return parseShapefile(file, companionFiles || []);
  }

  throw new Error("Unsupported format. Upload GeoJSON, CSV, GML, or Shapefile (.shp).");
}

/** Detect if coordinates are in BNG (large values) and need reprojection */
function isBNG(coords: number[]): boolean {
  return Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 180;
}

/** Recursively reproject coordinates from BNG to WGS84 */
function reprojectCoords(coords: any): any {
  if (typeof coords[0] === "number") {
    // Single coordinate pair
    if (isBNG(coords)) {
      const [lng, lat] = bngToWgs84(coords[0], coords[1]);
      return [lng, lat, ...(coords.length > 2 ? coords.slice(2) : [])];
    }
    return coords;
  }
  return coords.map((c: any) => reprojectCoords(c));
}

/** Parse Shapefile (.shp + optional .dbf, .prj) */
async function parseShapefile(shpFile: File, companions: File[]): Promise<{ geojson: GeoJSON.FeatureCollection; hasSpatial: boolean }> {
  const baseName = shpFile.name.replace(/\.shp$/i, "").toLowerCase();

  // Find companion .dbf file
  const dbfFile = companions.find(f => f.name.toLowerCase() === baseName + ".dbf");
  // Find companion .prj file to detect projection
  const prjFile = companions.find(f => f.name.toLowerCase() === baseName + ".prj");

  const shpBuffer = await shpFile.arrayBuffer();
  const dbfBuffer = dbfFile ? await dbfFile.arrayBuffer() : undefined;

  // Detect if BNG projection from .prj file
  let needsReproject = false;
  if (prjFile) {
    const prjText = await prjFile.text();
    if (prjText.includes("OSGB") || prjText.includes("British_National_Grid") || prjText.includes("27700") || prjText.includes("Airy")) {
      needsReproject = true;
    }
  }

  const source = await shapefile.open(shpBuffer, dbfBuffer);
  const features: GeoJSON.Feature[] = [];

  while (true) {
    const result = await source.read();
    if (result.done) break;
    const feature = result.value as GeoJSON.Feature;

    // Reproject if needed
    if (needsReproject && feature.geometry && "coordinates" in feature.geometry) {
      (feature.geometry as any).coordinates = reprojectCoords((feature.geometry as any).coordinates);
    } else if (!needsReproject && feature.geometry && "coordinates" in feature.geometry) {
      // Auto-detect BNG from first coordinate
      const firstCoord = getFirstCoord(feature.geometry);
      if (firstCoord && isBNG(firstCoord)) {
        needsReproject = true;
        (feature.geometry as any).coordinates = reprojectCoords((feature.geometry as any).coordinates);
      }
    }

    features.push(feature);
  }

  return {
    geojson: { type: "FeatureCollection", features },
    hasSpatial: true,
  };
}

/** Extract the first coordinate from any geometry type */
function getFirstCoord(geom: GeoJSON.Geometry): number[] | null {
  if (!geom || !("coordinates" in geom)) return null;
  let c: any = geom.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) && typeof c[0] === "number" ? c : null;
}

export function GeoFileUploader({ layerId, layer, onComplete }: GeoFileUploaderProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [detectedTypes, setDetectedTypes] = useState<Record<number, string>>({});
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [overallStatus, setOverallStatus] = useState("");
  const [overallProgress, setOverallProgress] = useState(0);
  const [overallInserted, setOverallInserted] = useState(0);
  const [overallTotal, setOverallTotal] = useState(0);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      console.log("[GeoUploader] File input changed");
      const selected = e.target.files;
      if (!selected || selected.length === 0) return;
      const newFiles = Array.from(selected);
      console.log("[GeoUploader] Files selected:", newFiles.map(f => f.name));
      const startIdx = files.length;
      setFiles((prev) => [...prev, ...newFiles]);
      setAllDone(false);
      if (fileRef.current) fileRef.current.value = "";

      // Lightweight geometry sniff — reads only the first 10 KB per file
      for (let i = 0; i < newFiles.length; i++) {
        try {
          const geomType = await detectGeomTypeFromFile(newFiles[i]);
          setDetectedTypes((prev) => ({ ...prev, [startIdx + i]: geomType }));
        } catch {
          setDetectedTypes((prev) => ({ ...prev, [startIdx + i]: "Error" }));
        }
      }
    } catch (err) {
      console.error("[GeoUploader] Error in handleFilesSelected:", err);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setDetectedTypes((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < index) next[ki] = v;
        else if (ki > index) next[ki - 1] = v;
      });
      return next;
    });
  };

  // Check if detected geometry types are compatible with the target storage table
  const TABLE_EXPECTED_FAMILY: Record<string, string> = {
    geo_substations: "Point",
    geo_points: "Point",
    geo_feeders: "LineString",
    geo_cables: "LineString",
    geo_polygons: "Polygon",
    geo_constraints: "Any",
  };

  const expectedFamily = TABLE_EXPECTED_FAMILY[layer.storage_table] || "Any";

  const hasGeomMismatch = expectedFamily !== "Any" && files.some((_, idx) => {
    const detected = detectedTypes[idx];
    if (!detected || detected === "Unknown" || detected === "Error" || detected === "Geometry") return false;
    const detectedBase = detected.replace("Multi", "");
    return detectedBase !== expectedFamily;
  });

  const handleUploadAll = async () => {
    if (files.length === 0) return;

    console.log("[GeoUploader] handleUploadAll started, files:", files.length);
    setUploading(true);
    setAllDone(false);
    setOverallStatus("Parsing files…");

    try {
    console.log("[GeoUploader] Phase 1: Parsing files, file names:", files.map(f => f.name));

    const statuses: FileStatus[] = files.map((f) => ({
      name: f.name,
      status: "pending" as const,
      progress: 0,
      inserted: 0,
      featureCount: 0,
      hasSpatial: false,
      detectedGeomType: "",
    }));
    setFileStatuses([...statuses]);

    // Phase 1: Parse all files
    const parsed: { geojson: GeoJSON.FeatureCollection; hasSpatial: boolean }[] = [];
    let hasError = false;

    for (let i = 0; i < files.length; i++) {
      statuses[i].status = "parsing";
      setFileStatuses([...statuses]);

      try {
        console.log(`[GeoUploader] Parsing file ${i}: ${files[i].name} (${files[i].size} bytes)`);
        const result = await parseFile(files[i]);
        console.log(`[GeoUploader] Parsed file ${i}: ${result.geojson.features.length} features, hasSpatial=${result.hasSpatial}`);
        parsed.push(result);
        statuses[i].featureCount = result.geojson.features.length;
        statuses[i].hasSpatial = result.hasSpatial;
        statuses[i].detectedGeomType = result.hasSpatial
          ? detectGeometryType(result.geojson.features)
          : "";
        statuses[i].status = "pending";
      } catch (err: any) {
        console.error(`[GeoUploader] Parse error for file ${i}:`, err);
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

    // Compute total features for overall progress
    const totalFeatures = parsed.reduce((sum, p, i) => sum + (statuses[i].status !== "error" ? p.geojson.features.length : 0), 0);
    setOverallTotal(totalFeatures);
    setOverallInserted(0);
    setOverallProgress(0);
    let cumulativeUploaded = 0;

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

        // Refresh session before uploading to avoid expired JWT errors
        await supabase.auth.getSession();

        for (let b = 0; b < features.length; b += BATCH_SIZE) {
          const batch = features.slice(b, b + BATCH_SIZE);

          console.log(`[GeoUploader] Sending batch ${b}-${b + batch.length} of ${features.length} for ${files[i].name}`);
          let res: any;
          try {
            res = await supabase.functions.invoke("ingest-geo-features", {
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
          } catch (invokeErr: any) {
            console.error(`[GeoUploader] functions.invoke threw:`, invokeErr);
            throw new Error(`Network error: ${invokeErr.message}`);
          }

          console.log(`[GeoUploader] Batch response:`, { data: res.data, error: res.error ? String(res.error) : null });

          if (res.error) {
            // Try to extract the actual error message from the response
            let errorMsg = "Upload failed";
            try {
              if (res.error.context) {
                const body = await res.error.context.json();
                errorMsg = body?.error || res.error.message || errorMsg;
              } else {
                errorMsg = res.error.message || String(res.error);
              }
            } catch {
              errorMsg = res.error.message || String(res.error);
            }
            throw new Error(errorMsg);
          }
          fileInserted += res.data?.inserted || 0;
          cumulativeUploaded += batch.length;
          statuses[i].progress = Math.round(((b + batch.length) / features.length) * 100);
          setOverallProgress(totalFeatures > 0 ? Math.round((cumulativeUploaded / totalFeatures) * 100) : 0);
          setOverallInserted(fileInserted + totalInserted);
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

    // Phase 4: Auto-update layer_registry geometry_type if needed
    if (totalInserted > 0) {
      // Determine dominant geometry across all successfully uploaded files
      const allDetected = statuses
        .filter((s) => s.status === "done" && s.detectedGeomType && s.detectedGeomType !== "Unknown")
        .map((s) => s.detectedGeomType);

      if (allDetected.length > 0) {
        const typeCounts: Record<string, number> = {};
        allDetected.forEach((t) => { typeCounts[t] = (typeCounts[t] || 0) + 1; });
        const dominant = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];

        // Update if current type is generic "Geometry" or mismatched
        if (
          dominant !== "Mixed" &&
          (layer.geometry_type === "Geometry" || layer.geometry_type !== dominant)
        ) {
          const { error: updateErr } = await supabase
            .from("layer_registry")
            .update({ geometry_type: dominant, updated_at: new Date().toISOString() })
            .eq("id", layerId);

          if (!updateErr) {
            toast({
              title: "Geometry type updated",
              description: `Layer set to "${dominant}" based on uploaded data.`,
            });
          }
        }
      }

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
    setDetectedTypes({});
    setFileStatuses([]);
    setAllDone(false);
    setUploading(false);
    setOverallStatus("");
    setOverallProgress(0);
    setOverallInserted(0);
    setOverallTotal(0);
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
        accept=".geojson,.json,.csv,.gml,.gz,.shp,.dbf,.prj,.shx"
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
              {detectedTypes[idx] && (
                <Badge
                  variant={detectedTypes[idx] === "Error" ? "destructive" : "secondary"}
                  className="text-[9px] shrink-0"
                >
                  {detectedTypes[idx]}
                </Badge>
              )}
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
                {fs.detectedGeomType && fs.detectedGeomType !== "Unknown" && (
                  <Badge variant="secondary" className="text-[9px] shrink-0">{fs.detectedGeomType}</Badge>
                )}
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

      {uploading && (
        <div className="space-y-1.5 border rounded-md p-3 bg-muted/30">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">{overallStatus || "Uploading…"}</span>
            <span className="tabular-nums font-medium text-foreground">
              {overallInserted.toLocaleString()} / {overallTotal.toLocaleString()} features ({overallProgress}%)
            </span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
      )}

      {/* Geometry compatibility warning */}
      {files.length > 0 && !uploading && !allDone && (() => {
        const EXPECTED_GEOM: Record<string, string[]> = {
          geo_substations: ["Point", "Polygon", "MultiPolygon"],
          geo_points: ["Point"],
          geo_feeders: ["LineString", "MultiLineString"],
          geo_cables: ["LineString", "MultiLineString"],
          geo_polygons: ["Polygon", "MultiPolygon"],
          geo_constraints: [], // accepts anything
        };
        const expected = EXPECTED_GEOM[layer.storage_table] || [];
        if (expected.length === 0) return null;
        const mismatched = Object.entries(detectedTypes).filter(([, t]) => {
          if (!t || t === "Error" || t === "No geometry" || t === "Unknown" || t === "Mixed") return false;
          return !expected.includes(t);
        });
        if (mismatched.length === 0) return null;
        const detectedSet = [...new Set(mismatched.map(([, t]) => t))].join(", ");
        return (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            <strong>⚠ Geometry mismatch:</strong> Your file(s) contain <strong>{detectedSet}</strong> geometry but this layer ({layer.storage_table}) expects <strong>{expected.join(" or ")}</strong>. Upload will likely fail — check you've selected the correct layer.
          </div>
        );
      })()}

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

  // Expanded alias lists for latitude (northing) and longitude (easting)
  const LAT_ALIASES = ["lat", "latitude", "y", "site_northing", "northing", "location y (m)", "location_latitude", "loc_lat", "site_lat", "sub_lat", "lat_deg"];
  const LNG_ALIASES = ["lng", "lon", "longitude", "long", "x", "site_easting", "easting", "location x (m)", "location_longitude", "loc_long", "loc_lng", "site_long", "sub_long", "lng_deg", "lon_deg", "long_deg"];

  let latIdx = headers.findIndex((h) => LAT_ALIASES.includes(h));
  let lngIdx = headers.findIndex((h) => LNG_ALIASES.includes(h));

  // Fuzzy fallback: find headers containing coordinate-like substrings
  if (latIdx === -1) {
    latIdx = headers.findIndex((h) => /\blat\b/.test(h) || /\bnorthing\b/.test(h));
  }
  if (lngIdx === -1) {
    lngIdx = headers.findIndex((h) => /\blon\b/.test(h) || /\blng\b/.test(h) || /\blong\b/.test(h) || /\beasting\b/.test(h));
  }

  // Detect if coordinates are BNG (easting/northing) vs WGS84
  // For BNG: X = easting (lng-like), Y = northing (lat-like)
  const isBNG = latIdx !== -1 && lngIdx !== -1 && LAT_ALIASES.slice(4).concat(["northing"]).some(a => headers[latIdx].includes(a.replace(/\s*\(.*\)/, "").trim()))
    || (lngIdx !== -1 && LNG_ALIASES.slice(6).concat(["easting"]).some(a => headers[lngIdx].includes(a.replace(/\s*\(.*\)/, "").trim())));

  if (latIdx !== -1 && lngIdx !== -1) {
    console.log(`[CSV Parser] Matched lat column: "${headers[latIdx]}", lng column: "${headers[lngIdx]}", isBNG hint: ${isBNG}`);
  }

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
      let v0 = parseFloat(vals[latIdx]); // lat / northing
      let v1 = parseFloat(vals[lngIdx]); // lng / easting
      if (isNaN(v0) || isNaN(v1)) continue;

      // Auto-detect BNG: if either value > 180, treat as BNG easting/northing
      if (Math.abs(v0) > 180 || Math.abs(v1) > 180) {
        // v0 = northing (Y), v1 = easting (X) → bngToWgs84(easting, northing)
        const [lng, lat] = bngToWgs84(v1, v0);
        geometry = { type: "Point", coordinates: [lng, lat] };
      } else {
        geometry = { type: "Point", coordinates: [v1, v0] };
      }
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
