import { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

// Column mapping from XLSX headers to our DB fields
const COLUMN_MAP: Record<string, string> = {
  "Site Name": "site_name",
  "Site ID": "site_id",
  "AMS Site Asset ID": "ams_site_asset_id",
  "Transformer ID": "transformer_id",
  "Substation Type": "substation_type",
  "Licence Area": "licence_area",
  "Loadings Data Source": "loadings_data_source",
  "Max Demand (kW)": "max_demand_kw",
  "Connected Customers": "connected_customers",
  "Firm Capacity (kW)": "firm_capacity_kw",
  "Transformer Headroom (kW)": "transformer_headroom_kw",
  "Transformer Headroom Band (kW)": "headroom_band",
  "Utilisation (% Whole number)": "utilisation_pct",
  "Utilisation Band": "utilisation_band",
  "Substation Class": "substation_class",
  "3 Phase (Y/N)": "three_phase",
  "Associated Upstream Site": "upstream_site",
  "Site Easting": "site_easting",
  "Site Northing": "site_northing",
  "Site Band": "site_band",
  "Geo Point": "geo_point",
  "MSOA Name": "msoa_name",
  "MSOA Code": "msoa_code",
  "LSOA Name": "lsoa_name",
  "LSOA Code": "lsoa_code",
  "Local Authority": "local_authority",
  "Local Authority Code": "local_authority_code",
  "Ward Name": "ward_name",
  "Ward Code": "ward_code",
};

export function DataUploader() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setDone(false);
    setStatus("Parsing spreadsheet…");

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

      // Map column names
      const rows = rawRows.map((row) => {
        const mapped: Record<string, any> = {};
        for (const [xlsKey, dbKey] of Object.entries(COLUMN_MAP)) {
          if (row[xlsKey] !== undefined) {
            mapped[dbKey] = row[xlsKey];
          }
        }
        return mapped;
      }).filter((r) => r.site_id && r.site_easting && r.site_northing);

      setStatus(`Parsed ${rows.length} rows. Uploading in batches…`);

      const BATCH_SIZE = 500;
      let totalInserted = 0;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        setStatus(`Uploading batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(rows.length / BATCH_SIZE)}…`);

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
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setStatus("Failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">Upload NPG Site Utilisation Data</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Upload the NPG site utilisation XLSX file. Data will be parsed and ingested into the database with point geometries from Eastings/Northings.
      </p>

      <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />

      {!uploading && !done && (
        <Button onClick={() => fileRef.current?.click()} variant="outline" className="w-full">
          <Upload className="mr-2 h-4 w-4" />
          Select XLSX File
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
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-primary" />
          <span>{status}</span>
          <Button variant="ghost" size="sm" onClick={() => { setDone(false); setStatus(""); }} className="ml-auto">
            Upload Another
          </Button>
        </div>
      )}
    </div>
  );
}
