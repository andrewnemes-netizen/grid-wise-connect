import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileSpreadsheet, UploadCloud, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Generic Rate Card import.
 *
 * Unlike the CK Synthetic and ICP SOR importers above (which parse a fixed,
 * known column layout from a specific known workbook), this importer works
 * for ANY rate card — including ones that don't exist yet — by reading the
 * sheet's own header row and letting the user map columns to four fields:
 *
 *   Line Item / Description · Unit · Our Cost · Our Price
 *
 * This is the importer to use for CK MSA Rates, and for any future rate
 * card, without needing bespoke parsing code written for each one.
 */

type SheetRow = Record<string, any>;

type FieldKey = "description" | "unit" | "cost" | "price" | "code" | "category" | "award_code";

const FIELD_LABELS: Record<FieldKey, string> = {
  code: "Item Code (optional)",
  category: "Category (optional)",
  description: "Line Item / Description",
  unit: "Unit",
  cost: "Our Cost (per item)",
  price: "Our Price (per item)",
  award_code: "Award Code (C/I/E, optional)",
};

const REQUIRED_FIELDS: FieldKey[] = ["description", "unit", "cost", "price"];

/** Best-guess column mapping based on common header wording, so the user
 *  usually just has to confirm rather than map from scratch every time. */
function guessMapping(headers: string[]): Partial<Record<FieldKey, string>> {
  const norm = (h: string) => h.toLowerCase().trim();
  const find = (patterns: RegExp[]) => headers.find((h) => patterns.some((p) => p.test(norm(h))));

  return {
    description: find([/^(line ?item|description|item|item name)$/, /description/, /line ?item/]),
    unit: find([/^unit$/, /unit of measure|uom/, /unit/]),
    cost: find([/our cost/, /^cost$/, /unit cost/, /cost per item/]),
    price: find([/our price/, /^price$/, /unit price|sell(ing)? price/, /price per item/]),
    code: find([/^(item )?code$/, /rate code/, /^ref(erence)?$/]),
    category: find([/^category$/, /group/]),
    award_code: find([/^award ?code$/, /^scope$/, /award/]),
  };
}

function useClients() {
  return useQuery({
    queryKey: ["clients-generic-import"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** "Contract" is an internal grouping table only — the user picks a Client.
 *  This finds (or creates) the single contract that represents that client,
 *  so multiple rate cards for the same client always end up under one
 *  contract row rather than a new one per rate card. */
async function ensureContractForClient(clientId: string, clientName: string): Promise<string> {
  const { data: existing, error: e1 } = await supabase
    .from("contracts").select("id").eq("client_id", clientId).eq("name", clientName).maybeSingle();
  if (e1) throw e1;
  if (existing?.id) return existing.id as string;

  const { data: created, error: e2 } = await supabase
    .from("contracts").insert({ name: clientName, client_id: clientId }).select("id").single();
  if (e2) throw e2;
  return (created as any).id as string;
}

async function ensureNewClientAndContract(name: string): Promise<string> {
  const trimmed = name.trim();
  const { data: existingClient, error: ec1 } = await supabase
    .from("clients").select("id").eq("name", trimmed).maybeSingle();
  if (ec1) throw ec1;
  let clientId: string;
  if (existingClient?.id) {
    clientId = existingClient.id as string;
  } else {
    const { data: newClient, error: ec2 } = await supabase
      .from("clients").insert({ name: trimmed }).select("id").single();
    if (ec2) throw ec2;
    clientId = (newClient as any).id;
  }
  return ensureContractForClient(clientId, trimmed);
}

export function GenericRateCardImport() {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();

  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [clientId, setClientId] = useState<string | undefined>();
  const [newClientName, setNewClientName] = useState("");

  const [rateCardName, setRateCardName] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, string>>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const onFile = async (f: File) => {
    setFile(f);
    setResult(null);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: null }) as SheetRow[];
    const hdrs = data.length ? Object.keys(data[0]) : [];
    setHeaders(hdrs);
    setRows(data);
    setMapping(guessMapping(hdrs));
    if (!rateCardName) setRateCardName(f.name.replace(/\.(xlsx|xls|csv)$/i, ""));
  };

  const missingRequired = REQUIRED_FIELDS.filter((f) => !mapping[f]);

  const preview = useMemo(() => {
    if (!rows.length) return [];
    return rows.slice(0, 15).map((r) => ({
      description: mapping.description ? r[mapping.description] : null,
      unit: mapping.unit ? r[mapping.unit] : null,
      cost: mapping.cost ? Number(r[mapping.cost]) : null,
      price: mapping.price ? Number(r[mapping.price]) : null,
      code: mapping.code ? r[mapping.code] : null,
      category: mapping.category ? r[mapping.category] : null,
      award_code: mapping.award_code ? r[mapping.award_code] : null,
    }));
  }, [rows, mapping]);

  const invalidRowCount = useMemo(() => {
    if (missingRequired.length) return rows.length;
    return rows.filter((r) => {
      const desc = mapping.description ? r[mapping.description] : null;
      const unit = mapping.unit ? r[mapping.unit] : null;
      const cost = mapping.cost ? r[mapping.cost] : null;
      const price = mapping.price ? r[mapping.price] : null;
      return desc == null || unit == null || cost == null || price == null;
    }).length;
  }, [rows, mapping, missingRequired]);

  const reset = () => {
    setFile(null); setHeaders([]); setRows([]); setMapping({}); setResult(null);
  };

  const doImport = async () => {
    if (!rows.length) { toast.error("Upload a rate card file first"); return; }
    if (missingRequired.length) { toast.error(`Map all required fields: ${missingRequired.map((f) => FIELD_LABELS[f]).join(", ")}`); return; }
    if (!rateCardName.trim()) { toast.error("Rate card name required"); return; }
    if (clientMode === "existing" && !clientId) { toast.error("Choose a client"); return; }
    if (clientMode === "new" && !newClientName.trim()) { toast.error("Enter a name for the new client"); return; }

    setImporting(true); setResult(null);
    try {
      const { data: user } = await supabase.auth.getUser();
      const selectedClient = clientMode === "existing" ? clients.find((c: any) => c.id === clientId) : null;
      const cid = clientMode === "existing"
        ? await ensureContractForClient(clientId!, selectedClient?.name ?? "")
        : await ensureNewClientAndContract(newClientName);

      const { data: existingCard, error: eFind } = await supabase
        .from("rate_cards").select("id").eq("contract_id", cid).eq("name", rateCardName.trim()).maybeSingle();
      if (eFind) throw eFind;
      let rateCardId: string;
      if (existingCard?.id) {
        rateCardId = existingCard.id as string;
      } else {
        const { data: rc, error: e1 } = await supabase.from("rate_cards").insert({
          contract_id: cid, name: rateCardName.trim(),
        }).select("id").single();
        if (e1) throw e1;
        rateCardId = (rc as any).id;
      }

      const { data: vers, error: eV } = await supabase
        .from("rate_card_versions").select("version_number")
        .eq("rate_card_id", rateCardId).order("version_number", { ascending: false }).limit(1);
      if (eV) throw eV;
      const nextVersion = ((vers?.[0] as any)?.version_number ?? 0) + 1;

      const { data: rv, error: e2 } = await supabase.from("rate_card_versions").insert({
        rate_card_id: rateCardId, version_number: nextVersion, status: "DRAFT",
        source_workbook: file?.name ?? null, imported_at: new Date().toISOString(),
        imported_by: user.user?.id ?? null,
      }).select("id").single();
      if (e2) throw e2;

      const versionId = (rv as any).id;
      const usedCodes = new Set<string>();
      const itemRows = rows.map((r, i) => {
        const desc = mapping.description ? String(r[mapping.description] ?? "").trim() : "";
        let code = mapping.code ? String(r[mapping.code] ?? "").trim() : "";
        if (!code) code = `ITEM-${String(i + 1).padStart(4, "0")}`;
        // rate_code must be unique per version — de-dupe defensively.
        let finalCode = code;
        let n = 2;
        while (usedCodes.has(finalCode)) { finalCode = `${code}-${n}`; n += 1; }
        usedCodes.add(finalCode);

        return {
          rate_card_version_id: versionId,
          rate_code: finalCode,
          description: desc,
          unit: mapping.unit ? String(r[mapping.unit] ?? "").trim() || "Per Item" : "Per Item",
          total_unit_cost: mapping.cost ? Number(r[mapping.cost]) || 0 : 0,
          client_unit_price: mapping.price ? Number(r[mapping.price]) || 0 : 0,
          category: mapping.category ? String(r[mapping.category] ?? "").trim() || null : null,
          award_code: (() => {
            if (!mapping.award_code) return null;
            const raw = String(r[mapping.award_code] ?? "").trim().toUpperCase();
            return ["C", "I", "E"].includes(raw) ? raw : null;
          })(),
          // Per-row: an item still needs pricing if either value is
          // genuinely missing/zero on THIS row — not just whether the
          // column was mapped at all across the whole sheet.
          needs_pricing: !(
            mapping.cost && Number(r[mapping.cost]) > 0 &&
            mapping.price && Number(r[mapping.price]) > 0
          ),
          cost_split_available: false,
          source_sheet: wbSheetNameSafe(file),
        };
      }).filter((r) => r.description); // skip fully blank rows

      const chunk = 500;
      for (let i = 0; i < itemRows.length; i += chunk) {
        const { error } = await supabase.from("rate_items").insert(itemRows.slice(i, i + chunk));
        if (error) throw error;
      }

      setResult(`Imported ${itemRows.length} items into "${rateCardName.trim()}" v${nextVersion} (DRAFT). Approve it in Rate Library to make it usable on quotes.`);
      toast.success("Rate card imported");
      qc.invalidateQueries({ queryKey: ["rate-library-versions"] });
      qc.invalidateQueries({ queryKey: ["rate-card-versions"] });
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  function wbSheetNameSafe(f: File | null) {
    return f?.name ?? null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Rate Card import (generic)</CardTitle>
        <CardDescription>
          Works for any rate card — including ones that don't exist yet, like CK MSA Rates.
          Upload a spreadsheet with a header row, map its columns to the four fields below, and
          import as a new DRAFT version. No fixed layout required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <div className="flex gap-2">
              <Select value={clientMode} onValueChange={(v) => setClientMode(v as any)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Existing</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                </SelectContent>
              </Select>
              {clientMode === "existing" ? (
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Choose client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="e.g. Connected Kerb" value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)} />
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Rate card name</Label>
            <Input placeholder="e.g. CK MSA Rates" value={rateCardName}
              onChange={(e) => setRateCardName(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>File (.xlsx, .xls or .csv — first row must be headers)</Label>
          <Input type="file" accept=".xlsx,.xls,.csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </div>

        {headers.length > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(FIELD_LABELS) as FieldKey[]).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs">
                    {FIELD_LABELS[field]}
                    {REQUIRED_FIELDS.includes(field) && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={mapping[field] ?? "__none"}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v === "__none" ? undefined : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Not mapped" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Not mapped</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {missingRequired.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Map all required fields before importing: {missingRequired.map((f) => FIELD_LABELS[f]).join(", ")}.
                </AlertDescription>
              </Alert>
            )}
            {missingRequired.length === 0 && invalidRowCount > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {invalidRowCount} row{invalidRowCount === 1 ? "" : "s"} have a blank Description, Unit, Cost or
                  Price and will be flagged as "needs pricing" on import rather than blocked.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Our Cost</TableHead>
                    <TableHead className="text-right">Our Price</TableHead>
                    <TableHead>Award Code</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{r.code ?? "auto"}</TableCell>
                      <TableCell className="text-xs">{r.category ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.description ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.unit ?? "—"}</TableCell>
                      <TableCell className="text-xs text-right">{r.cost != null && !Number.isNaN(r.cost) ? `£${r.cost.toFixed(2)}` : "—"}</TableCell>
                      <TableCell className="text-xs text-right">{r.price != null && !Number.isNaN(r.price) ? `£${r.price.toFixed(2)}` : "—"}</TableCell>
                      <TableCell className="text-xs">{r.award_code ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > preview.length && (
                <div className="p-2 text-xs text-muted-foreground border-t">
                  Showing first {preview.length} of {rows.length} rows.
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={doImport} disabled={importing || missingRequired.length > 0}>
                <UploadCloud className="h-4 w-4 mr-1.5" />
                {importing ? "Importing…" : `Import ${rows.length} items as new DRAFT version`}
              </Button>
              <Button variant="outline" onClick={reset} disabled={importing}>Clear</Button>
            </div>
          </>
        )}

        {result && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{result}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
