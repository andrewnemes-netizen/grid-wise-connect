import { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle, FileSpreadsheet, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

// Known column aliases → DB field mapping (case-insensitive matching)
const COLUMN_ALIASES: Record<string, string[]> = {
  site_name: ["site name", "site_name", "substation", "substation name", "sub name"],
  site_id: ["site id", "site_id", "asset id", "asset_id", "ams site asset id"],
  ams_site_asset_id: ["ams site asset id", "ams_site_asset_id"],
  transformer_id: ["transformer id", "transformer_id"],
  substation_type: ["substation type", "substation_type"],
  licence_area: ["licence area", "licence_area", "license area"],
  loadings_data_source: ["loadings data source", "loadings_data_source"],
  max_demand_kw: ["max demand (kw)", "max_demand_kw", "max demand kw", "max demand"],
  connected_customers: ["connected customers", "connected_customers"],
  firm_capacity_kw: ["firm capacity (kw)", "firm_capacity_kw", "firm capacity kw", "firm capacity"],
  transformer_headroom_kw: ["transformer headroom (kw)", "transformer_headroom_kw", "headroom kw"],
  headroom_band: ["transformer headroom band (kw)", "headroom_band", "headroom band"],
  utilisation_pct: ["utilisation (% whole number)", "utilisation_pct", "utilisation %", "utilisation"],
  utilisation_band: ["utilisation band", "utilisation_band"],
  substation_class: ["substation class", "substation_class"],
  three_phase: ["3 phase (y/n)", "three_phase", "3 phase"],
  upstream_site: ["associated upstream site", "upstream_site", "upstream site"],
  site_easting: ["site easting", "site_easting", "easting", "x"],
  site_northing: ["site northing", "site_northing", "northing", "y"],
  site_band: ["site band", "site_band"],
  geo_point: ["geo point", "geo_point"],
  msoa_name: ["msoa name", "msoa_name"],
  msoa_code: ["msoa code", "msoa_code"],
  lsoa_name: ["lsoa name", "lsoa_name"],
  lsoa_code: ["lsoa code", "lsoa_code"],
  local_authority: ["local authority", "local_authority"],
  local_authority_code: ["local authority code", "local_authority_code"],
  ward_name: ["ward name", "ward_name"],
  ward_code: ["ward code", "ward_code"],
};

/** Build a mapping from raw header → db field. Unmapped headers stay as-is for attrs_json. */
function buildColumnMap(rawHeaders: string[]): { mapped: Record<number, string>; unmappedIdxs: number[] } {
  const mapped: Record<number, string> = {};
  const unmappedIdxs: number[] = [];
  const usedFields = new Set<string>();

  rawHeaders.forEach((raw, idx) => {
    const norm = raw.trim().toLowerCase().replace(/^\uFEFF/, "");
    let found = false;
    for (const [dbField, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (usedFields.has(dbField)) continue;
      if (aliases.some((a) => a === norm)) {
        mapped[idx] = dbField;
        usedFields.add(dbField);
        found = true;
        break;
      }
    }
    if (!found) unmappedIdxs.push(idx);
  });

  return { mapped, unmappedIdxs };
}

export function DataUploader() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ total: number; mapped: number; unmappedCols: string[] } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setDone(false);
    setError(null);
    setSummary(null);
    setStatus("Parsing file…");

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (rawRows.length < 2) throw new Error("File must have a header row and at least one data row");

      const headers = (rawRows[0] as string[]).map((h) => String(h ?? "").trim());
      const { mapped, unmappedIdxs } = buildColumnMap(headers);

      const unmappedCols = unmappedIdxs.map((i) => headers[i]).filter(Boolean);

      // Build row objects
      const rows: Record<string, any>[] = [];
      for (let r = 1; r < rawRows.length; r++) {
        const vals = rawRows[r] as any[];
        if (!vals || vals.every((v) => v == null || v === "")) continue;

        const row: Record<string, any> = {};
        const attrs: Record<string, any> = {};

        // Mapped columns
        for (const [idxStr, dbField] of Object.entries(mapped)) {
          const idx = parseInt(idxStr);
          row[dbField] = vals[idx] ?? null;
        }

        // Unmapped columns → attrs_json
        for (const idx of unmappedIdxs) {
          const key = headers[idx];
          if (key && vals[idx] != null && vals[idx] !== "") {
            attrs[key] = vals[idx];
          }
        }

        if (Object.keys(attrs).length > 0) {
          row.attrs_json = attrs;
        }

        // Need at least a site_name or site_id
        if (!row.site_name && !row.site_id) continue;

        // Generate site_id from site_name if missing
        if (!row.site_id && row.site_name) {
          row.site_id = String(row.site_name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "");
        }

        // Ensure site_name exists
        if (!row.site_name && row.site_id) {
          row.site_name = String(row.site_id);
        }

        rows.push(row);
      }

      if (rows.length === 0) throw new Error("No valid rows found. Ensure the file has at least a 'Substation' or 'Site Name' column.");

      setSummary({ total: rows.length, mapped: Object.keys(mapped).length, unmappedCols });
      setStatus(`Parsed ${rows.length} rows (${Object.keys(mapped).length} mapped cols, ${unmappedCols.length} extra → attrs_json). Uploading…`);

      const BATCH_SIZE = 500;
      let totalInserted = 0;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
        setStatus(`Uploading batch ${batchNum} of ${totalBatches}…`);

        const res = await supabase.functions.invoke("ingest-site-utilisation", {
          body: { rows: batch },
        });

        if (res.error) {
          console.error("Batch error:", res.error);
          toast({ title: "Batch failed", description: String(res.error.message || res.error), variant: "destructive" });
        } else {
          totalInserted += res.data?.inserted || 0;
        }

        setProgress(Math.round(((i + batch.length) / rows.length) * 100));
      }

      setDone(true);
      setStatus(`Done! ${totalInserted} sites uploaded.`);
      toast({ title: "Upload complete", description: `${totalInserted} site utilisation records ingested.` });
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
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">Upload Site Utilisation Data</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Upload site utilisation data as <strong>.xlsx, .xls, or .csv</strong>. Known columns are auto-mapped; extra columns are stored as metadata (attrs_json).
        Requires at least a "Substation" or "Site Name" column.
      </p>

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />

      {!uploading && !done && !error && (
        <Button onClick={() => fileRef.current?.click()} variant="outline" className="w-full">
          <Upload className="mr-2 h-4 w-4" />
          Select File (.xlsx, .csv)
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
          {summary && summary.unmappedCols.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Extra columns stored in attrs_json: {summary.unmappedCols.slice(0, 5).join(", ")}
              {summary.unmappedCols.length > 5 && ` (+${summary.unmappedCols.length - 5} more)`}
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={() => { setDone(false); setStatus(""); setSummary(null); }}>
            Upload Another
          </Button>
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
