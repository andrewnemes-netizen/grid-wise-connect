import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, CheckCircle, AlertCircle, Lightbulb, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { bngToWgs84Precise, preloadOstn15 } from "@/lib/ostn15";
import * as XLSX from "xlsx";

const LEEDS_LIGHTING_SLUG = "leeds-street-lighting-unmetered";
const CAMBS_LIGHTING_SLUG = "cambridgeshire-street-lighting";
const PBORO_LAND_ASSETS_SLUG = "peterborough-land-property-assets";

/** RFC-4180-style CSV row split: handles quoted fields with embedded commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === ',') { out.push(cur); cur = ""; }
      else if (ch === '"') inQuotes = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

interface LayerRow {
  id: string;
  slug: string;
  display_name: string;
  storage_table: string;
  feature_count: number | null;
  updated_at: string | null;
}

/**
 * Streaming-ish CSV parser for the Leeds unmetered street lighting file.
 * Headers: Operational Area, Road Name, Road Ref., Unit ID, Unit Ref, Unit Type,
 *          Unit Location, Easting, Northing, Lamps Per Lantern
 */
async function parseLeedsCsv(text: string): Promise<GeoJSON.Feature[]> {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());

  const idx = (name: string) => header.indexOf(name);
  const iArea = idx("operational area");
  const iRoad = idx("road name");
  const iRoadRef = idx("road ref.");
  const iUnitId = idx("unit id");
  const iUnitRef = idx("unit ref");
  const iUnitType = idx("unit type");
  const iLoc = idx("unit location");
  const iE = idx("easting");
  const iN = idx("northing");
  const iLamps = idx("lamps per lantern");

  if (iE < 0 || iN < 0) {
    throw new Error("CSV missing Easting/Northing columns");
  }

  const features: GeoJSON.Feature[] = [];
  for (let r = 1; r < lines.length; r++) {
    const raw = lines[r];
    if (!raw) continue;
    const cols = splitCsvLine(raw);
    if (cols.length < header.length) continue;

    const easting = parseFloat(cols[iE]);
    const northing = parseFloat(cols[iN]);
    if (!isFinite(easting) || !isFinite(northing)) continue;

    const { lat, lng } = await bngToWgs84Precise(easting, northing);
    if (!isFinite(lat) || !isFinite(lng)) continue;

    const unitId = cols[iUnitId]?.trim();
    const unitRef = cols[iUnitRef]?.trim();
    const roadName = cols[iRoad]?.trim();

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        name: unitRef && roadName ? `${unitRef} — ${roadName}` : (unitRef || roadName || `LCC-${unitId}`),
        asset_id: unitId ? `LCC-${unitId}` : null,
        unit_id: unitId,
        unit_ref: unitRef,
        unit_type: cols[iUnitType]?.trim(),
        unit_location: cols[iLoc]?.trim(),
        operational_area: cols[iArea]?.trim(),
        road_name: roadName,
        road_ref: cols[iRoadRef]?.trim(),
        lamps_per_lantern: parseInt(cols[iLamps]) || 1,
        source: "Leeds City Council",
        easting,
        northing,
      },
    });
  }
  return features;
}

/**
 * Parser for Cambridgeshire County Council street lighting.
 * Headers: unitid, unitno, location, fullstreet, town, owner, Longitude, Latitude
 * Coordinates already WGS84 — no BNG conversion needed.
 */
function parseCambridgeshireCsv(text: string): GeoJSON.Feature[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iUnitId = idx("unitid");
  const iUnitNo = idx("unitno");
  const iLoc = idx("location");
  const iStreet = idx("fullstreet");
  const iTown = idx("town");
  const iOwner = idx("owner");
  const iLng = idx("longitude");
  const iLat = idx("latitude");
  if (iLng < 0 || iLat < 0) throw new Error("CSV missing Longitude/Latitude columns");

  const features: GeoJSON.Feature[] = [];
  for (let r = 1; r < lines.length; r++) {
    const raw = lines[r];
    if (!raw) continue;
    const cols = splitCsvLine(raw);
    if (cols.length < header.length) continue;
    const lng = parseFloat(cols[iLng]);
    const lat = parseFloat(cols[iLat]);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    if (lat < 49 || lat > 61 || lng < -8 || lng > 2) continue;

    const unitId = cols[iUnitId]?.trim();
    const unitRef = cols[iUnitNo]?.trim();
    const street = cols[iStreet]?.trim();
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        name: unitRef && street ? `${unitRef} — ${street}` : (unitRef || street || `CCC-${unitId}`),
        asset_id: unitId ? `CCC-${unitId}` : null,
        unit_id: unitId,
        unit_ref: unitRef,
        location: cols[iLoc]?.trim(),
        full_street: street,
        town: cols[iTown]?.trim(),
        owner: cols[iOwner]?.trim(),
        source: "Cambridgeshire County Council",
      },
    });
  }
  return features;
}

/**
 * Parser for Peterborough City Council "Land and Property Assets" xlsx export.
 * Coordinates in British National Grid (Easting/Northing). Many rows lack
 * coordinates and are skipped.
 */
async function parsePeterboroughXlsx(fileBuffer: ArrayBuffer): Promise<GeoJSON.Feature[]> {
  const wb = XLSX.read(fileBuffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
  const features: GeoJSON.Feature[] = [];
  for (const row of rows) {
    const easting = parseFloat(row["Easting"]);
    const northing = parseFloat(row["Northing"]);
    if (!isFinite(easting) || !isFinite(northing) || easting === 0 || northing === 0) continue;
    const { lat, lng } = await bngToWgs84Precise(easting, northing);
    if (!isFinite(lat) || !isFinite(lng)) continue;

    const assetId = row["Unique Asset Id"]?.toString().trim();
    const assetName = row["Asset Name"]?.toString().trim();
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        name: assetName || assetId || "Unnamed asset",
        asset_id: assetId ? `PBC-${assetId}` : null,
        uprn: row["UPRN"]?.toString() ?? null,
        active: row["Active"] ?? null,
        street: row["Street"] ?? null,
        town: row["Town/City"] ?? null,
        postcode: row["Postcode"] ?? null,
        ownership: row["Ownership"] ?? null,
        ownership_details: row["Ownership Details"] ?? null,
        ownership_characteristics: row["Ownership Characteristics"] ?? null,
        land_only: row["Land Only"] ?? null,
        asset_size: row["Asset Size"] ?? null,
        holding_reason: row["Holding Reason Description"] ?? null,
        community_value: row["Community Value Description"] ?? null,
        suitability: row["Suitability Description"] ?? null,
        energy_performance: row["Energy Performance Description"] ?? null,
        billing_authority: row["BILLING AUTHORITY"] ?? null,
        billing_authority_code: row["BILLING AUTHORITY CODE"] ?? null,
        source: "Peterborough City Council",
        easting,
        northing,
      },
    });
  }
  return features;
}

interface LaDatasetCardProps {
  slug: string;
  title: string;
  description: string;
  parse: (input: string | ArrayBuffer) => Promise<GeoJSON.Feature[]> | GeoJSON.Feature[];
  preload?: () => Promise<void>;
  columnsHint: string;
  accept?: string;
  binary?: boolean;
}

function LaDatasetCard({ slug, title, description, parse, preload, columnsHint, accept = ".csv", binary = false }: LaDatasetCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearFirst, setClearFirst] = useState(true);
  const [insertedTotal, setInsertedTotal] = useState(0);

  const { data: layer, refetch } = useQuery({
    queryKey: ["la-layer", slug],
    queryFn: async (): Promise<LayerRow | null> => {
      const { data, error } = await supabase
        .from("layer_registry")
        .select("id, slug, display_name, storage_table, feature_count, updated_at")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data as LayerRow | null;
    },
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !layer) return;

    setUploading(true);
    setProgress(0);
    setDone(false);
    setError(null);
    setInsertedTotal(0);
    setStatus("Reading file…");

    try {
      const input: string | ArrayBuffer = binary ? await file.arrayBuffer() : await file.text();
      if (preload) {
        setStatus("Loading OS national grid (OSTN15)…");
        await preload();
      }
      setStatus("Parsing rows…");
      const features = await parse(input);
      if (features.length === 0) throw new Error("No valid rows parsed");

      setStatus(`Parsed ${features.length.toLocaleString()} features. Preparing upload…`);

      if (clearFirst) {
        setStatus("Clearing existing data for this layer…");
        const { error: delErr } = await supabase
          .from(layer.storage_table as "geo_points")
          .delete()
          .eq("layer_id", layer.id);
        if (delErr) throw new Error(`Clear failed: ${delErr.message}`);
      }

      const BATCH = 2000;
      let inserted = 0;
      const total = features.length;
      const totalBatches = Math.ceil(total / BATCH);

      for (let i = 0; i < total; i += BATCH) {
        const batchNum = Math.floor(i / BATCH) + 1;
        setStatus(`Uploading batch ${batchNum}/${totalBatches}…`);
        const slice = features.slice(i, i + BATCH);

        const res = await supabase.functions.invoke("ingest-geo-features", {
          body: {
            layer_id: layer.id,
            storage_table: layer.storage_table,
            dno: "Local Authority",
            features: slice,
          },
        });

        if (res.error) {
          throw new Error(`Batch ${batchNum} failed: ${res.error.message || res.error}`);
        }
        inserted += (res.data as any)?.inserted || 0;
        setInsertedTotal(inserted);
        setProgress(Math.round(((i + slice.length) / total) * 100));
      }

      setDone(true);
      setStatus(`Done — ${inserted.toLocaleString()} features ingested.`);
      toast.success(`Ingested ${inserted.toLocaleString()} features`);
      refetch();
    } catch (err: any) {
      console.error("[LA upload] error:", err);
      setError(err.message || String(err));
      toast.error("Upload failed", { description: err.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleClear = async () => {
    if (!layer) return;
    if (!confirm(`Delete all ${(layer.feature_count ?? 0).toLocaleString()} features in "${layer.display_name}"?`)) return;
    const { error } = await supabase
      .from(layer.storage_table as "geo_points")
      .delete()
      .eq("layer_id", layer.id);
    if (error) {
      toast.error("Clear failed", { description: error.message });
      return;
    }
    await supabase.from("layer_registry").update({ feature_count: 0 }).eq("id", layer.id);
    toast.success("Layer cleared");
    refetch();
  };

  return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-500/10 p-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {layer?.feature_count ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {layer.feature_count.toLocaleString()} loaded
                </Badge>
              ) : (
                <Badge variant="outline">Not yet ingested</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox id={`clear-first-${slug}`} checked={clearFirst} onCheckedChange={(v) => setClearFirst(!!v)} disabled={uploading} />
            <Label htmlFor={`clear-first-${slug}`} className="text-sm cursor-pointer">
              Clear existing data before upload (recommended for re-ingestion)
            </Label>
          </div>

          <input ref={fileRef} type="file" accept={accept} onChange={handleFile} className="hidden" />

          {!uploading && (
            <div className="flex gap-2">
              <Button onClick={() => fileRef.current?.click()} disabled={!layer}>
                <Upload className="mr-2 h-4 w-4" />
                Upload file
              </Button>
              {(layer?.feature_count ?? 0) > 0 && (
                <Button variant="outline" onClick={handleClear}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear data
                </Button>
              )}
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{status}</span>
              </div>
              <Progress value={progress} className="h-2" />
              {insertedTotal > 0 && (
                <p className="text-xs text-muted-foreground">{insertedTotal.toLocaleString()} features inserted so far…</p>
              )}
            </div>
          )}

          {done && !uploading && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span>{status}</span>
            </div>
          )}

          {error && !uploading && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground border-t pt-3">
            {columnsHint}
          </p>
        </CardContent>
      </Card>
  );
}

export function LocalAuthorityDatasets() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Local Authority Datasets</h3>
        <p className="text-sm text-muted-foreground">Upload council-published asset data. British National Grid coordinates are converted to WGS84 automatically where needed.</p>
      </div>

      <LaDatasetCard
        slug={LEEDS_LIGHTING_SLUG}
        title="Leeds — Unmetered Street Lighting"
        description="Leeds City Council street lighting register (~110k assets)"
        parse={(t) => parseLeedsCsv(t as string)}
        preload={preloadOstn15}
        columnsHint="Expected columns: Operational Area, Road Name, Road Ref., Unit ID, Unit Ref, Unit Type, Unit Location, Easting, Northing, Lamps Per Lantern. Coordinates in British National Grid (EPSG:27700) are converted to WGS84 client-side."
      />

      <LaDatasetCard
        slug={CAMBS_LIGHTING_SLUG}
        title="Cambridgeshire — Street Lighting"
        description="Cambridgeshire County Council street lighting register (~57k assets)"
        parse={(t) => parseCambridgeshireCsv(t as string)}
        columnsHint="Expected columns: unitid, unitno, location, fullstreet, town, owner, Longitude, Latitude. Coordinates already in WGS84."
      />

      <LaDatasetCard
        slug={PBORO_LAND_ASSETS_SLUG}
        title="Peterborough — Land & Property Assets"
        description="Peterborough City Council public land & property register (April 2025)"
        parse={(buf) => parsePeterboroughXlsx(buf as ArrayBuffer)}
        preload={preloadOstn15}
        accept=".xlsx"
        binary
        columnsHint="Expected sheet: TPY02. Uses Easting/Northing (EPSG:27700), converted to WGS84 client-side. Rows without coordinates are skipped."
      />
    </div>
  );
}