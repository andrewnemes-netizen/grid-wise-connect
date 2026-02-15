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
}

interface Props {
  onSubmit: (rows: SiteRow[]) => void;
  isProcessing: boolean;
}

const REQUIRED_COLS = ["site_name", "postcode", "proposed_kw"];

const normalizeHeader = (h: string): string => {
  const clean = h.trim().toLowerCase().replace(/[\s\-]+/g, "_");
  const aliases: Record<string, string> = {
    name: "site_name", site: "site_name", location: "site_name",
    post_code: "postcode", zip: "postcode",
    kw: "proposed_kw", capacity: "proposed_kw", power: "proposed_kw", capacity_kw: "proposed_kw",
    type: "site_type", category: "site_type",
  };
  return aliases[clean] || clean;
};

export function CsvIntakePanel({ onSubmit, isProcessing }: Props) {
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (raw.length === 0) { setErrors(["File is empty"]); return; }

        // Normalize headers
        const headerMap: Record<string, string> = {};
        Object.keys(raw[0]).forEach(h => { headerMap[h] = normalizeHeader(h); });

        const missing = REQUIRED_COLS.filter(c => !Object.values(headerMap).includes(c));
        if (missing.length > 0) {
          setErrors([`Missing required columns: ${missing.join(", ")}. Expected: site_name, postcode, proposed_kw`]);
          return;
        }

        const errs: string[] = [];
        const parsed: SiteRow[] = [];

        raw.forEach((r, i) => {
          const mapped: any = {};
          Object.entries(r).forEach(([k, v]) => { mapped[headerMap[k]] = v; });

          if (!mapped.site_name) { errs.push(`Row ${i + 2}: missing site_name`); return; }
          if (!mapped.postcode) { errs.push(`Row ${i + 2}: missing postcode`); return; }

          const kw = Number(mapped.proposed_kw);
          if (isNaN(kw) || kw <= 0) { errs.push(`Row ${i + 2}: invalid proposed_kw "${mapped.proposed_kw}"`); return; }

          parsed.push({
            site_name: String(mapped.site_name).trim(),
            postcode: String(mapped.postcode).trim().toUpperCase(),
            proposed_kw: kw,
            site_type: String(mapped.site_type || "other").trim(),
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
            Upload CSV or Excel with columns: <strong>site_name</strong>, <strong>postcode</strong>, <strong>proposed_kw</strong>, <em>site_type</em> (optional)
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
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" /> {rows.length} sites parsed
              </Badge>
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
                    <TableHead className="text-xs">Postcode</TableHead>
                    <TableHead className="text-xs">kW</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 20).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs">{r.site_name}</TableCell>
                      <TableCell className="text-xs font-mono">{r.postcode}</TableCell>
                      <TableCell className="text-xs">{r.proposed_kw}</TableCell>
                      <TableCell className="text-xs">{r.site_type}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 20 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-xs text-center text-muted-foreground">
                        …{rows.length - 20} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
