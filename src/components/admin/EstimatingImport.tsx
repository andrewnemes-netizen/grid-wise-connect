import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

// ---------------- Shared ----------------
function useContracts() {
  return useQuery({
    queryKey: ["contracts-import"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("id,name,code").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------- Rate Library import ----------------
// SoR MASTER sheet layout (0-indexed columns):
// B(1)=ser (e.g. 1 or 1.01), C(2)=description, D(3)=unit, E(4)=labour, G(6)=material, I(8)=rate
type RateRow = {
  category: string | null;
  rate_code: string;
  description: string;
  unit: string | null;
  labour_cost: number | null;
  material_cost: number | null;
  total_unit_cost: number | null;
  needs_pricing: boolean;
  source_sheet: string;
  source_ser: string;
};

function parseRatesWorkbook(wb: XLSX.WorkBook): { rows: RateRow[]; errors: string[] } {
  const rows: RateRow[] = [];
  const errors: string[] = [];
  const sheetName = wb.SheetNames.find((s) => /SoR.*MASTER/i.test(s));
  if (!sheetName) { errors.push("SoR MASTER sheet not found"); return { rows, errors }; }
  const ws = wb.Sheets[sheetName];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
  let currentCategory: string | null = null;
  for (let i = 10; i < data.length; i++) { // start row 11 (0-indexed 10)
    const r = data[i] ?? [];
    const ser = r[1];
    const desc = r[2];
    const unit = r[3];
    const labour = r[4];
    const material = r[6];
    const rate = r[8];
    if (ser == null && desc == null) continue;

    const isCategoryHeader = typeof ser === "number" && Number.isInteger(ser) && (unit === "Unit" || unit === null);
    if (isCategoryHeader && desc) {
      currentCategory = String(desc).trim();
      continue;
    }
    // sub-header rows (description only, no ser or unit)
    if (ser == null && unit == null && (labour == null && material == null && rate == null)) continue;

    if (ser == null || desc == null) continue;
    const rateCode = String(ser);
    const isRef = (v: any) => typeof v === "string" && v.startsWith("#");
    const num = (v: any) => (v == null || v === "N/A" || isRef(v)) ? null : Number(v);
    const totalCost = num(rate);
    const needsPricing = isRef(rate) || isRef(labour) || isRef(material) || totalCost == null || totalCost === 0;
    rows.push({
      category: currentCategory,
      rate_code: rateCode,
      description: String(desc).trim(),
      unit: unit ? String(unit).trim() : null,
      labour_cost: num(labour),
      material_cost: num(material),
      total_unit_cost: totalCost,
      needs_pricing: needsPricing,
      source_sheet: sheetName,
      source_ser: rateCode,
    });
  }
  return { rows, errors };
}

function RateLibraryImport() {
  const qc = useQueryClient();
  const { data: contracts = [] } = useContracts();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{ rows: RateRow[]; errors: string[] } | null>(null);
  const [contractId, setContractId] = useState<string | undefined>();
  const [rateCardName, setRateCardName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [importedVersionId, setImportedVersionId] = useState<string | null>(null);
  const [importedNeedsPricing, setImportedNeedsPricing] = useState<number>(0);
  const [importedTotal, setImportedTotal] = useState<number>(0);
  const [importedName, setImportedName] = useState<string>("");
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  const onFile = async (f: File) => {
    setFile(f); setParsed(null); setResult(null);
    setImportedVersionId(null); setApproved(false);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const parsed = parseRatesWorkbook(wb);
    setParsed(parsed);
    if (!rateCardName) setRateCardName(f.name.replace(/\.xlsx?$/i, ""));
  };

  const needsPricingCount = parsed?.rows.filter((r) => r.needs_pricing).length ?? 0;

  const doImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    if (!rateCardName.trim()) { toast.error("Rate card name required"); return; }
    if (!contractId) { toast.error("Choose a contract"); return; }
    setImporting(true); setResult(null);
    try {
      const { data: user } = await supabase.auth.getUser();
      const cid = contractId;
      // Insert rate_card
      const { data: rc, error: e1 } = await supabase.from("rate_cards").insert({
        contract_id: cid, name: rateCardName.trim(),
      }).select().single();
      if (e1) throw e1;
      // Insert rate_card_version (DRAFT v1)
      const { data: rv, error: e2 } = await supabase.from("rate_card_versions").insert({
        rate_card_id: (rc as any).id, version_number: 1, status: "DRAFT",
        source_workbook: file?.name ?? null, imported_at: new Date().toISOString(),
        imported_by: user.user?.id ?? null,
      }).select().single();
      if (e2) throw e2;
      // Insert rate_items in batches
      const versionId = (rv as any).id;
      const rows = parsed.rows.map((r) => ({
        rate_card_version_id: versionId,
        rate_code: r.rate_code,
        description: r.description,
        unit: r.unit,
        labour_cost: r.labour_cost,
        material_cost: r.material_cost,
        total_unit_cost: r.total_unit_cost ?? 0,
        client_unit_price: r.total_unit_cost ?? 0,
        needs_pricing: r.needs_pricing,
        cost_split_available: r.labour_cost != null && r.material_cost != null,
        category: r.category,
        source_sheet: r.source_sheet,
        source_ser: r.source_ser,
      }));
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await supabase.from("rate_items").insert(rows.slice(i, i + chunk));
        if (error) throw error;
      }
      setResult(`Imported ${rows.length} rate items into "${rateCardName.trim()}" v1 (DRAFT). ${needsPricingCount} flagged as needs_pricing.`);
      setImportedVersionId(versionId);
      setImportedNeedsPricing(needsPricingCount);
      setImportedTotal(rows.length);
      setImportedName(rateCardName.trim());
      toast.success("Rate library imported");
      qc.invalidateQueries({ queryKey: ["contracts-import"] });
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally { setImporting(false); }
  };

  const approveNow = async () => {
    if (!importedVersionId) return;
    if (importedNeedsPricing > 0) return;
    setApproving(true);
    try {
      const { error } = await supabase.rpc("approve_rate_card_version", { _version_id: importedVersionId });
      if (error) throw error;
      setApproved(true);
      toast.success("Rate card version approved");
    } catch (e: any) {
      toast.error(e.message ?? "Approve failed");
    } finally { setApproving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Rate Library import</CardTitle>
        <CardDescription>
          Parses the "SoR MASTER" sheet from the CK Synthetic Rates workbook. Categories, sub-headers
          and #REF! items are handled automatically. Rows with missing rates are flagged as{" "}
          <code>needs_pricing</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        {parsed && (
          <>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">{parsed.rows.length} items parsed</Badge>
              {needsPricingCount > 0 && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                  {needsPricingCount} need pricing
                </Badge>
              )}
              {parsed.errors.map((e, i) => (
                <Badge key={i} variant="destructive">{e}</Badge>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contract</Label>
                <Select value={contractId} onValueChange={setContractId}>
                  <SelectTrigger><SelectValue placeholder="Existing contract" /></SelectTrigger>
                  <SelectContent>
                    {contracts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground mt-1">
                  Contracts are created from the client / commercial screens.
                </div>
              </div>
              <div>
                <Label>Rate card name</Label>
                <Input value={rateCardName} onChange={(e) => setRateCardName(e.target.value)} />
                <div className="text-xs text-muted-foreground mt-1">Will be created as v1 (DRAFT).</div>
              </div>
            </div>

            <div className="rounded-md border overflow-hidden max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.rows.slice(0, 20).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{r.rate_code}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.category ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.description}</TableCell>
                      <TableCell className="text-xs">{r.unit ?? "—"}</TableCell>
                      <TableCell className="text-xs text-right">{r.total_unit_cost != null ? `£${r.total_unit_cost.toFixed(2)}` : "—"}</TableCell>
                      <TableCell>{r.needs_pricing && <AlertTriangle className="h-3 w-3 text-amber-500" />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button onClick={doImport} disabled={importing}>
              <UploadCloud className="h-4 w-4 mr-1" /> Import {parsed.rows.length} rate items
            </Button>

            {result && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <div>{result}</div>
                  {importedVersionId && !approved && (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {importedNeedsPricing > 0 ? (
                        <>
                          <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                            {importedNeedsPricing} of {importedTotal} need pricing
                          </Badge>
                          <Button size="sm" disabled title="Resolve needs_pricing items before approving">
                            Approve now
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            Price the flagged items in{" "}
                            <Link to="/admin?tab=rate-library" className="underline underline-offset-2">
                              Rate Library
                            </Link>{" "}
                            before this version can be approved.
                          </span>
                        </>
                      ) : (
                        <>
                          <Button size="sm" onClick={approveNow} disabled={approving}>
                            {approving ? "Approving…" : "Approve now"}
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            All {importedTotal} items priced — safe to approve.
                          </span>
                        </>
                      )}
                    </div>
                  )}
                  {approved && (
                    <div className="text-xs text-emerald-600 font-medium">
                      ✓ "{importedName}" v1 is now APPROVED and available for estimating.
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Recipe Library import ----------------
// Sheet0 layout: col A = recipe name (only on first row of group), B = product/service (same),
// D = BOQ Item name, E = description, F = qty, G = unit, I = unit cost, J = markup ($),
// K = unit price, L = total cost, M = total markup, N = total price, O = stage,
// P = allowance (bool), Q = related allowance, R = include in task (bool),
// S = cost code, T = cost code category
type RecipeGroup = {
  name: string;
  product: string | null;
  items: {
    description: string;
    unit: string | null;
    qty: number;
    unit_cost: number;
    unit_price: number;
    markup_amount: number;
    stage: string | null;
    is_allowance: boolean;
    related_allowance: string | null;
    create_task: boolean;
    cost_code: string | null;
    cost_code_category: string | null;
  }[];
};

function parseRecipesWorkbook(wb: XLSX.WorkBook): { groups: RecipeGroup[]; errors: string[] } {
  const errors: string[] = [];
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];
  const groups: RecipeGroup[] = [];
  let cur: RecipeGroup | null = null;
  // header at row 7 (index 6). Data from row 8+.
  for (let i = 7; i < data.length; i++) {
    const r = data[i] ?? [];
    const recipeName = r[0]; // col A
    const prod = r[1];
    const itemName = r[3];
    const desc = r[4];
    if (recipeName && String(recipeName).trim()) {
      cur = { name: String(recipeName).trim(), product: prod ? String(prod).trim() : null, items: [] };
      groups.push(cur);
    }
    if (!itemName && !desc) continue;
    if (!cur) continue;
    const num = (v: any) => (v == null || v === "" ? 0 : Number(v));
    cur.items.push({
      description: String(itemName ?? desc ?? "").trim(),
      unit: r[6] ? String(r[6]).trim() : null,
      qty: num(r[5]),
      unit_cost: num(r[7]) || num(r[8]), // fallback
      unit_price: num(r[10]),
      markup_amount: num(r[9]),
      stage: r[14] ? String(r[14]).trim() : null,
      is_allowance: String(r[15]).toLowerCase() === "true",
      related_allowance: r[16] ? String(r[16]).trim() : null,
      create_task: String(r[17]).toLowerCase() === "true",
      cost_code: r[18] ? String(r[18]).trim() : null,
      cost_code_category: r[19] ? String(r[19]).trim() : null,
    });
  }
  if (groups.length === 0) errors.push("No recipe groups detected");
  return { groups, errors };
}

function detectBuildType(name: string): "horizontal" | "vertical" | "buildout" | "other" {
  const n = name.toLowerCase();
  if (n.includes("horizontal")) return "horizontal";
  if (n.includes("vertical")) return "vertical";
  if (n.includes("buildout") || n.includes("build out")) return "buildout";
  return "other";
}
function detectSocketCount(name: string): number | null {
  const m = name.match(/(\d+)\s*socket/i);
  return m ? Number(m[1]) : null;
}

function RecipeLibraryImport() {
  const { data: contracts = [] } = useContracts();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{ groups: RecipeGroup[]; errors: string[] } | null>(null);
  const [contractId, setContractId] = useState<string | undefined>();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const onFile = async (f: File) => {
    setFile(f); setParsed(null); setResult(null);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    setParsed(parseRecipesWorkbook(wb));
  };

  const totalItems = useMemo(() => parsed?.groups.reduce((s, g) => s + g.items.length, 0) ?? 0, [parsed]);

  const doImport = async () => {
    if (!parsed || parsed.groups.length === 0) return;
    if (!contractId) { toast.error("Choose a contract"); return; }
    setImporting(true); setResult(null);
    try {
      const { data: user } = await supabase.auth.getUser();
      const cid = contractId;
      let recipesCreated = 0, itemsCreated = 0;
      for (const g of parsed.groups) {
        const { data: recipe, error: e1 } = await supabase.from("estimate_recipes").insert({
          contract_id: cid,
          name: g.name,
          build_type: detectBuildType(g.name),
          socket_count: detectSocketCount(g.name),
          delivering_partner: g.product,
          version_number: 1,
          status: "DRAFT",
          source_workbook: file?.name ?? null,
          imported_at: new Date().toISOString(),
          imported_by: user.user?.id ?? null,
        }).select().single();
        if (e1) throw e1;
        recipesCreated++;
        const items = g.items.map((it, idx) => ({
          recipe_id: (recipe as any).id,
          rate_item_id: null,
          description_override: it.description,
          unit: it.unit,
          default_quantity: it.qty,
          quantity_rule_json: {},
          quantity_rule_confirmed: true,
          markup_amount: it.markup_amount,
          stage: it.stage,
          cost_code: it.cost_code,
          cost_code_category: it.cost_code_category,
          is_allowance: it.is_allowance,
          related_allowance_ref: it.related_allowance,
          create_project_task: it.create_task,
          sort_index: idx,
        }));
        if (items.length > 0) {
          const { error: e2 } = await supabase.from("recipe_items").insert(items);
          if (e2) throw e2;
          itemsCreated += items.length;
        }
      }
      setResult(`Imported ${recipesCreated} recipes with ${itemsCreated} items.`);
      toast.success("Recipe library imported");
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally { setImporting(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Recipe Library import</CardTitle>
        <CardDescription>
          Parses the CK SITE BOQ RECIPES workbook. Each recipe (grouped by column A) becomes a
          DRAFT recipe with its BOQ items. Rate items are not auto-linked — you can link them later
          from rate codes if needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        {parsed && (
          <>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">{parsed.groups.length} recipes</Badge>
              <Badge variant="secondary">{totalItems} items</Badge>
              {parsed.errors.map((e, i) => (<Badge key={i} variant="destructive">{e}</Badge>))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contract</Label>
                <Select value={contractId} onValueChange={setContractId}>
                  <SelectTrigger><SelectValue placeholder="Existing contract" /></SelectTrigger>
                  <SelectContent>
                    {contracts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground mt-1">
                  Contracts are created from the client / commercial screens.
                </div>
              </div>
            </div>

            <div className="rounded-md border overflow-hidden max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipe</TableHead>
                    <TableHead>Build</TableHead>
                    <TableHead>Sockets</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.groups.map((g, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{g.name}</TableCell>
                      <TableCell className="text-xs">{detectBuildType(g.name)}</TableCell>
                      <TableCell className="text-xs">{detectSocketCount(g.name) ?? "—"}</TableCell>
                      <TableCell className="text-xs text-right">{g.items.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button onClick={doImport} disabled={importing}>
              <UploadCloud className="h-4 w-4 mr-1" /> Import {parsed.groups.length} recipes
            </Button>

            {result && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{result}</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Combined tab ----------------
export function EstimatingImport() {
  return (
    <div className="space-y-4">
      <RateLibraryImport />
      <RecipeLibraryImport />
    </div>
  );
}