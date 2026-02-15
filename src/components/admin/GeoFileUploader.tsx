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
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  inserted: number;
  error?: string;
}

export function GeoFileUploader({ layerId, layer, onComplete }: GeoFileUploaderProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    const newFiles = Array.from(selected);
    setFiles((prev) => [...prev, ...newFiles]);
    setAllDone(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const processFile = async (
    file: File,
    fileIndex: number,
    updateStatus: (update: Partial<FileStatus>) => void
  ) => {
    updateStatus({ status: "uploading", progress: 0 });

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let geojson: GeoJSON.FeatureCollection;

      if (ext === "geojson" || ext === "json") {
        const text = await file.text();
        geojson = JSON.parse(text);
        if (geojson.type !== "FeatureCollection") {
          throw new Error("File must be a GeoJSON FeatureCollection");
        }
      } else if (ext === "csv") {
        const text = await file.text();
        geojson = csvToGeoJSON(text);
      } else if (ext === "gml") {
        const text = await file.text();
        geojson = gmlToGeoJSON(text);
      } else if (ext === "gz" && file.name.toLowerCase().endsWith(".gml.gz")) {
        const buffer = await file.arrayBuffer();
        const text = await decompressGzip(buffer);
        geojson = gmlToGeoJSON(text);
      } else {
        throw new Error("Unsupported format. Upload GeoJSON, CSV, or GML.");
      }

      const features = geojson.features;
      if (!features.length) {
        throw new Error("No features found in file");
      }

      const BATCH_SIZE = 500;
      let totalInserted = 0;

      for (let i = 0; i < features.length; i += BATCH_SIZE) {
        const batch = features.slice(i, i + BATCH_SIZE);

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
        totalInserted += res.data?.inserted || 0;
        updateStatus({
          progress: Math.round(((i + batch.length) / features.length) * 100),
        });
      }

      updateStatus({ status: "done", progress: 100, inserted: totalInserted });
      return totalInserted;
    } catch (err: any) {
      updateStatus({ status: "error", error: err.message });
      return 0;
    }
  };

  const handleUploadAll = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setAllDone(false);

    const initialStatuses: FileStatus[] = files.map((f) => ({
      name: f.name,
      status: "pending",
      progress: 0,
      inserted: 0,
    }));
    setFileStatuses(initialStatuses);

    let totalInserted = 0;
    let hasErrors = false;

    for (let i = 0; i < files.length; i++) {
      const updateFn = (update: Partial<FileStatus>) => {
        setFileStatuses((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, ...update } : s))
        );
      };

      const inserted = await processFile(files[i], i, updateFn);
      totalInserted += inserted;
      if (inserted === 0 && files[i]) {
        // Check if it was an error (not just empty)
        hasErrors = true;
      }
    }

    setUploading(false);
    setAllDone(true);

    if (totalInserted > 0) {
      toast({
        title: "Upload complete",
        description: `${totalInserted.toLocaleString()} features ingested from ${files.length} file${files.length !== 1 ? "s" : ""}.`,
      });
    }
    if (hasErrors) {
      toast({
        title: "Some files had errors",
        description: "Check individual file statuses below.",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    setFiles([]);
    setFileStatuses([]);
    setAllDone(false);
    setUploading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px]">{layer.dno}</Badge>
        <Badge variant="secondary" className="text-[10px] capitalize">{layer.category}</Badge>
        <Badge variant="secondary" className="text-[10px]">{layer.geometry_type}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Upload one or more GeoJSON, CSV (with lat/lng or Geo Shape), or GML files.
        All features will be added to <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{layer.storage_table}</code>.
        You can combine markers, shapes, and parameters from separate files.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".geojson,.json,.csv,.gml,.gz"
        multiple
        onChange={handleFilesSelected}
        className="hidden"
      />

      {/* File list */}
      {files.length > 0 && !uploading && !allDone && (
        <div className="space-y-1.5 border rounded-md p-2">
          {files.map((f, idx) => (
            <div key={`${f.name}-${idx}`} className="flex items-center gap-2 text-xs">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-muted-foreground shrink-0">
                {(f.size / 1024).toFixed(0)} KB
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => removeFile(idx)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Progress display during upload */}
      {(uploading || allDone) && fileStatuses.length > 0 && (
        <div className="space-y-2 border rounded-md p-2">
          {fileStatuses.map((fs, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                {fs.status === "pending" && <Loader2 className="h-3 w-3 text-muted-foreground shrink-0" />}
                {fs.status === "uploading" && <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}
                {fs.status === "done" && <CheckCircle className="h-3 w-3 text-primary shrink-0" />}
                {fs.status === "error" && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
                <span className="truncate flex-1">{fs.name}</span>
                {fs.status === "done" && (
                  <span className="text-muted-foreground shrink-0">{fs.inserted.toLocaleString()} features</span>
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

      {/* Actions */}
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

      {uploading && (
        <p className="text-xs text-muted-foreground text-center">
          Processing {files.length} file{files.length !== 1 ? "s" : ""}… please wait.
        </p>
      )}

      {allDone && (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Upload More
          </Button>
          <Button size="sm" onClick={onComplete}>Done</Button>
        </div>
      )}
    </div>
  );
}

/** CSV → GeoJSON converter. Supports lat/lng columns OR a "Geo Shape" column with inline GeoJSON geometry. */
function csvToGeoJSON(csvText: string): GeoJSON.FeatureCollection {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = parseCSVRow(headerLine).map((h) => h.trim().toLowerCase());

  const geoShapeIdx = headers.findIndex((h) => ["geo shape", "geo_shape", "geoshape", "geometry", "geom"].includes(h));
  const latIdx = headers.findIndex((h) => ["lat", "latitude", "y", "site_northing"].includes(h));
  const lngIdx = headers.findIndex((h) => ["lng", "lon", "longitude", "x", "site_easting"].includes(h));

  if (geoShapeIdx === -1 && (latIdx === -1 || lngIdx === -1)) {
    throw new Error("CSV must have lat/lng (or latitude/longitude) columns, or a 'Geo Shape' column with GeoJSON geometry");
  }

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

    if (!geometry) continue;

    const props: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (idx !== geoShapeIdx && idx !== latIdx && idx !== lngIdx) {
        props[h] = vals[idx] || null;
      }
    });

    features.push({ type: "Feature", geometry, properties: props });
  }

  return { type: "FeatureCollection", features };
}

/** Parse a single CSV row, respecting quoted fields that may contain commas and nested JSON. */
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
