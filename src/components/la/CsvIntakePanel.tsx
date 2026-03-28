import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import * as XLSX from "xlsx";

export interface SiteRow {
  site_name: string;
  postcode: string;
  proposed_kw: number;
  site_type: string;
  lat?: number;
  lng?: number;
}

interface Props {
  onSubmit: (rows: SiteRow[]) => void;
  isProcessing: boolean;
}

/** UK postcode regex – matches embedded postcodes like "Some Street BD20 0JY" */
const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

const normalizeHeader = (h: string): string => {
  const clean = h.trim().toLowerCase().replace(/[\s\-\u00a0]+/g, "_");
  const aliases: Record<string, string> = {
    name: "site_name", site: "site_name", location: "site_name",
    name_and_location: "site_name", site_name: "site_name",
    post_code: "postcode", zip: "postcode", postcode: "postcode",
    kw: "proposed_kw", capacity: "proposed_kw", power: "proposed_kw",
    capacity_kw: "proposed_kw", proposed_kw: "proposed_kw",
    type: "site_type", category: "site_type", site_type: "site_type",
    on_street_off_street: "site_type",
    longitude: "longitude", lng: "longitude", long: "longitude", x: "longitude",
    latitude: "latitude", lat: "latitude", y: "latitude",
    district: "district",
    archetype: "archetype",
  };
  return aliases[clean] || clean;
};

/** Estimate total kW from WYCA-style charger count columns */
function estimateKwFromChargers(row: Record<string, any>): number {
  const patterns: { keywords: string[]; rate: number }[] = [
    { keywords: ["lower", "3.7"], rate: 3.7 },
    { keywords: ["higher", "6kw"], rate: 7 },
    { keywords: ["higher", "6_kw"], rate: 7 },
    { keywords: ["fast", "8kw"], rate: 22 },
    { keywords: ["fast", "49kw"], rate: 22 },
    { keywords: ["rapid", "50kw"], rate: 50 },
    { keywords: ["rapid", "149kw"], rate: 50 },
  ];

  let totalKw = 0;
  const matched = new Set<string>();

  for (const [rawKey, rawVal] of Object.entries(row)) {
    const norm = rawKey.toLowerCase().replace(/[\s\-\u00a0]+/g, "_");
    if (matched.has(norm)) continue;

    for (const { keywords, rate } of patterns) {
      if (keywords.every(kw => norm.includes(kw))) {
        const count = Number(rawVal) || 0;
        totalKw += count * rate;
        matched.add(norm);
        break;
      }
    }
  }
  return totalKw;
}

export function CsvIntakePanel({ onSubmit, isProcessing }: Props) {
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [hasCoords, setHasCoords] = useState(false);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "array" });

        // Prefer a sheet with "site" in the name, fallback to first
        let sheetName = wb.SheetNames[0];
        for (const sn of wb.SheetNames) {
          if (sn.toLowerCase().includes("site") || sn.toLowerCase().includes("mandatory")) {
            sheetName = sn;
            break;
          }
        }

        const sheet = wb.Sheets[sheetName];
        const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (raw.length === 0) { setErrors(["File is empty"]); return; }

        // Normalize headers
        const headerMap: Record<string, string> = {};
        Object.keys(raw[0]).forEach(h => { headerMap[h] = normalizeHeader(h); });

        const normValues = Object.values(headerMap);
        const hasLat = normValues.includes("latitude");
        const hasLng = normValues.includes("longitude");
        const hasPostcode = normValues.includes("postcode");
        const hasSiteName = normValues.includes("site_name");
        const hasProposedKw = normValues.includes("proposed_kw");

        // Check if charger count columns exist (WYCA-style)
        const hasChargerCols = Object.keys(raw[0]).some(h =>
          h.toLowerCase().includes("charger") || h.toLowerCase().includes("socket")
        );

        // Validate minimum columns
        if (!hasSiteName) {
          setErrors(["Missing required column: site_name (or 'Name', 'Name and Location', 'Location')"]);
          return;
        }

        // Must have either postcode OR lat/lng
        if (!hasPostcode && !(hasLat && hasLng)) {
          setErrors(["Missing location columns. Provide either 'postcode' OR 'latitude' + 'longitude' columns."]);
          return;
        }

        // Must have either proposed_kw or charger count columns
        if (!hasProposedKw && !hasChargerCols) {
          setErrors(["Missing capacity column. Provide 'proposed_kw' (or 'capacity_kw') or charger count columns."]);
          return;
        }

        setHasCoords(hasLat && hasLng);

        const errs: string[] = [];
        const parsed: SiteRow[] = [];

        raw.forEach((r, i) => {
          // Build mapped row with both normalized and raw keys
          const mapped: Record<string, any> = {};
          Object.entries(r).forEach(([k, v]) => {
            mapped[headerMap[k]] = v;
            // Keep raw keys too for charger estimation
            mapped[k] = v;
          });

          const siteName = String(mapped.site_name || "").trim();
          if (!siteName) { errs.push(`Row ${i + 2}: missing site_name`); return; }

          // Resolve location: prefer lat/lng, fallback to postcode, extract from name
          let lat: number | undefined;
          let lng: number | undefined;
          let postcode = "";

          if (hasLat && hasLng) {
            lat = parseFloat(String(mapped.latitude));
            lng = parseFloat(String(mapped.longitude));
            if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
              errs.push(`Row ${i + 2}: invalid latitude/longitude`);
              return;
            }
          }

          if (hasPostcode && mapped.postcode) {
            postcode = String(mapped.postcode).trim().toUpperCase();
          }

          // Extract postcode from site_name if not provided
          if (!postcode) {
            const match = siteName.match(UK_POSTCODE_RE);
            if (match) {
              postcode = match[1].toUpperCase();
            }
          }

          // If no postcode and no coords, skip
          if (!postcode && (!lat || !lng)) {
            errs.push(`Row ${i + 2}: no postcode or coordinates found`);
            return;
          }

          // Resolve kW
          let kw = Number(mapped.proposed_kw);
          if (isNaN(kw) || kw <= 0) {
            // Try estimating from charger columns
            kw = estimateKwFromChargers(mapped);
          }
          if (kw < 0) {
            kw = 0;
          }

          // Resolve site_type
          let siteType = String(mapped.site_type || mapped.archetype || "other").trim();
          if (siteType.toLowerCase().includes("on street") || siteType.toLowerCase().includes("on_street")) {
            siteType = "on_street";
          } else if (siteType.toLowerCase().includes("off street") || siteType.toLowerCase().includes("off_street")) {
            siteType = "off_street";
          }

          parsed.push({
            site_name: siteName,
            postcode: postcode || "COORDS",
            proposed_kw: Math.round(kw * 10) / 10,
            site_type: siteType,
            ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
          });
        });

        if (parsed.length > 500) {
          errs.push("Maximum 500 sites per upload. Please split your file.");
        }

        setErrors(errs);
        setRows(parsed.slice(0, 500));
      } catch (err) {
        setErrors(["Could not parse file. Ensure it's a valid CSV or Excel file."]);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-4 w-4" />
          Upload Council Site List
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-2">
            Upload CSV or Excel with: <strong>site_name</strong> + (<strong>postcode</strong> or <strong>latitude/longitude</strong>) + <strong>proposed_kw</strong> (or charger counts)
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            Postcodes embedded in the name field (e.g. "High Street BD20 0JY") are auto-extracted
          </p>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" id="la-csv-upload" />
          <Button variant="outline" size="sm" onClick={() => document.getElementById("la-csv-upload")?.click()}>
            Choose File
          </Button>
          {fileName && <p className="text-xs text-muted-foreground mt-2">{fileName}</p>}
        </div>

        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc pl-4 text-xs space-y-0.5">
                {errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                {errors.length > 10 && <li>…and {errors.length - 10} more</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Check className="h-3 w-3" /> {rows.length} sites parsed
                </Badge>
                {hasCoords && (
                  <Badge variant="outline" className="text-xs">📍 Lat/Lng detected</Badge>
                )}
              </div>
              <Button size="sm" onClick={() => onSubmit(rows)} disabled={isProcessing}>
                {isProcessing ? "Scoring…" : `Score ${rows.length} Sites`}
              </Button>
            </div>
            <div className="max-h-60 overflow-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">{hasCoords ? "Lat/Lng" : "Postcode"}</TableHead>
                    <TableHead className="text-xs">kW</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs">{r.site_name}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {r.lat && r.lng
                          ? `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`
                          : r.postcode}
                      </TableCell>
                      <TableCell className="text-xs">{r.proposed_kw}</TableCell>
                      <TableCell className="text-xs">{r.site_type}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
