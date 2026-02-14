import { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle, FileUp, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

export function GeoFileUploader({ layerId, layer, onComplete }: GeoFileUploaderProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setDone(false);
    setError(null);
    setStatus("Reading file…");

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
      } else {
        throw new Error("Unsupported format. Upload GeoJSON (.geojson/.json) or CSV with lat/lng columns.");
      }

      const features = geojson.features;
      if (!features.length) {
        throw new Error("No features found in file");
      }

      setStatus(`Parsed ${features.length} features. Uploading in batches…`);

      const BATCH_SIZE = 500;
      let totalInserted = 0;

      for (let i = 0; i < features.length; i += BATCH_SIZE) {
        const batch = features.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(features.length / BATCH_SIZE);
        setStatus(`Uploading batch ${batchNum} of ${totalBatches}…`);

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
        setProgress(Math.round(((i + batch.length) / features.length) * 100));
      }

      setDone(true);
      setStatus(`Done! ${totalInserted} features uploaded to "${layer.display_name}".`);
      toast({ title: "Upload complete", description: `${totalInserted} features ingested.` });
    } catch (err: any) {
      setError(err.message);
      setStatus("Failed");
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px]">{layer.dno}</Badge>
        <Badge variant="secondary" className="text-[10px] capitalize">{layer.category}</Badge>
        <Badge variant="secondary" className="text-[10px]">{layer.geometry_type}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Upload GeoJSON or CSV (with lat/lng columns). Features will be inserted into <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{layer.storage_table}</code>.
        Geometries must be in WGS84 (EPSG:4326).
      </p>

      <input ref={fileRef} type="file" accept=".geojson,.json,.csv" onChange={handleFile} className="hidden" />

      {!uploading && !done && !error && (
        <Button onClick={() => fileRef.current?.click()} variant="outline" className="w-full">
          <Upload className="mr-2 h-4 w-4" />
          Select File (.geojson, .csv)
        </Button>
      )}

      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs">{status}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {done && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-primary" />
            <span>{status}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setDone(false); setStatus(""); }}>
              Upload More
            </Button>
            <Button size="sm" onClick={onComplete}>Done</Button>
          </div>
        </div>
      )}

      {error && !uploading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setError(null); setStatus(""); }}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

/** Simple CSV → GeoJSON converter. Expects lat/lng or latitude/longitude columns. */
function csvToGeoJSON(csvText: string): GeoJSON.FeatureCollection {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"/, "").replace(/"$/, "").toLowerCase());
  const latIdx = headers.findIndex((h) => ["lat", "latitude", "y", "site_northing"].includes(h));
  const lngIdx = headers.findIndex((h) => ["lng", "lon", "longitude", "x", "site_easting"].includes(h));

  if (latIdx === -1 || lngIdx === -1) {
    throw new Error("CSV must have lat/lng (or latitude/longitude) columns");
  }

  const features: GeoJSON.Feature[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.trim().replace(/^"/, "").replace(/"$/,""));
    const lat = parseFloat(vals[latIdx]);
    const lng = parseFloat(vals[lngIdx]);
    if (isNaN(lat) || isNaN(lng)) continue;

    const props: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (idx !== latIdx && idx !== lngIdx) {
        props[h] = vals[idx] || null;
      }
    });

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: props,
    });
  }

  return { type: "FeatureCollection", features };
}
