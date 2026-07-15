import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, MapPin, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type BatchRow = {
  id: string;
  status: string;
  total_rows: number;
  error_rows: number;
  duplicate_rows: number;
  mapping_json: Record<string, string | null>;
  summary_json: Record<string, any>;
  target_client_id: string | null;
  target_programme_id: string | null;
  target_wp_id: string | null;
  new_programme_json: any;
  new_wp_json: any;
  new_client_name: string | null;
};

type Row = {
  id: string;
  row_index: number;
  status: string;
  raw_json: Record<string, any>;
  mapped_json: Record<string, any>;
  errors_json: string[];
  warnings_json: string[];
  lat: number | null;
  lng: number | null;
};

const CANONICAL_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "site_name", label: "Site Name", required: true },
  { key: "address", label: "Address" },
  { key: "postcode", label: "Postcode" },
  { key: "uprn", label: "UPRN" },
  { key: "lat", label: "Latitude" },
  { key: "lng", label: "Longitude" },
  { key: "client_ref", label: "Client Ref" },
  { key: "charger_type", label: "Charger Type" },
  { key: "proposed_kw", label: "Power (kW)" },
  { key: "socket_count", label: "Sockets" },
  { key: "dno", label: "DNO" },
  { key: "lpa", label: "LPA" },
  { key: "notes", label: "Notes" },
];

const STEPS = ["Upload", "Map", "Validate", "Destination", "Review", "Done"] as const;

async function callWizard(action: string, body: Record<string, unknown>) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-wizard/${action}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error ?? `Request failed (${res.status})`);
  return j;
}

export default function ImportWizard() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialWp = params.get("wp");
  const initialProgramme = params.get("programme");

  const [step, setStep] = useState<number>(batchId ? 1 : 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchRow | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");

  // destination pickers
  const [programmes, setProgrammes] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [workPackages, setWorkPackages] = useState<{ id: string; name: string; code: string; programme_id: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [destMode, setDestMode] = useState<"existing" | "new">(initialWp ? "existing" : "new");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedProgramme, setSelectedProgramme] = useState<string>(initialProgramme ?? "");
  const [selectedWp, setSelectedWp] = useState<string>(initialWp ?? "");
  const [newClientName, setNewClientName] = useState("");
  const [newProgName, setNewProgName] = useState("");
  const [newWpName, setNewWpName] = useState("");

  const loadBatch = async (id: string) => {
    const { data: b } = await supabase.from("import_batches").select("*").eq("id", id).maybeSingle();
    if (b) setBatch(b as any);
    const { data: r } = await supabase.from("import_rows").select("*").eq("batch_id", id).order("row_index");
    if (r) {
      setRows(r as any);
      if (r.length > 0) setHeaders(Object.keys((r[0] as any).raw_json ?? {}));
    }
  };

  useEffect(() => {
    if (batchId) {
      loadBatch(batchId);
      if (step === 0) setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  useEffect(() => {
    (async () => {
      const [p, w, c] = await Promise.all([
        supabase.from("programmes").select("id, name, code").order("name"),
        supabase.from("work_packages").select("id, name, code, programme_id").order("name"),
        supabase.from("clients").select("id, name").order("name"),
      ]);
      setProgrammes((p.data ?? []) as any);
      setWorkPackages((w.data ?? []) as any);
      setClients((c.data ?? []) as any);
    })();
  }, []);

  /* ------- Step 0: Upload ------- */
  const doUpload = async () => {
    if (!file && !pasted.trim()) return toast.error("Choose a file or paste data first");
    try {
      setBusy("Uploading…");
      let source: string; let file_path: string | undefined; let filename: string | undefined;
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        source = ext === "csv" ? "csv" : (ext === "xlsx" || ext === "xls") ? "xlsx" : "";
        if (!source) throw new Error("File must be .csv, .xlsx, or .xls");
        const { data: sess } = await supabase.auth.getSession();
        const userId = sess.session?.user.id;
        if (!userId) throw new Error("Not signed in");
        const key = `${userId}/${Date.now()}-${file.name}`;
        const up = await supabase.storage.from("imports").upload(key, file, { upsert: false });
        if (up.error) throw up.error;
        file_path = key; filename = file.name;
      } else {
        source = "paste";
      }
      const res = await callWizard("parse", { source, file_path, filename, pasted_text: pasted });
      toast.success(`Parsed ${res.total_rows} rows`);
      navigate(`/import/wizard/${res.batch_id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(null); }
  };

  /* ------- Step 1: Mapping ------- */
  const updateMapping = (header: string, canonical: string) => {
    if (!batch) return;
    const next = { ...(batch.mapping_json ?? {}), [header]: canonical === "__none__" ? null : canonical };
    setBatch({ ...batch, mapping_json: next });
  };
  const saveMappingAndValidate = async () => {
    if (!batch) return;
    try {
      setBusy("Applying mapping…");
      await callWizard("remap", { batch_id: batch.id, mapping: batch.mapping_json });
      setBusy("Validating…");
      const v = await callWizard("validate", { batch_id: batch.id });
      toast.success(`Validated: ${v.ok} ok · ${v.warnings} warn · ${v.errors} err · ${v.duplicates} dup`);
      await loadBatch(batch.id);
      setStep(2);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  /* ------- Step 2: Validate / Geocode ------- */
  const doGeocode = async () => {
    if (!batch) return;
    try {
      setBusy("Geocoding postcodes…");
      const r = await callWizard("geocode", { batch_id: batch.id });
      toast.success(`Geocoded ${r.succeeded} rows (${r.failed} failed)`);
      await loadBatch(batch.id);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  /* ------- Step 4: Approve ------- */
  const saveDestination = async () => {
    if (!batch) return;
    const upd: any = {};
    if (destMode === "existing") {
      upd.target_programme_id = selectedProgramme || null;
      upd.target_wp_id = selectedWp || null;
      upd.target_client_id = selectedClient || null;
      upd.new_programme_json = null;
      upd.new_wp_json = null;
      upd.new_client_name = null;
    } else {
      upd.target_programme_id = null;
      upd.target_wp_id = null;
      upd.target_client_id = selectedClient || null;
      upd.new_client_name = !selectedClient ? newClientName || null : null;
      upd.new_programme_json = newProgName ? { name: newProgName } : null;
      upd.new_wp_json = newWpName ? { name: newWpName } : null;
    }
    const { error } = await supabase.from("import_batches").update(upd).eq("id", batch.id);
    if (error) throw new Error(error.message);
    await loadBatch(batch.id);
  };

  const doApprove = async () => {
    if (!batch) return;
    try {
      setBusy("Saving destination…");
      await saveDestination();
      setBusy("Creating sites…");
      const r = await callWizard("approve", { batch_id: batch.id });
      toast.success(`Created ${r.sites_created} sites`);
      await loadBatch(batch.id);
      setStep(5);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  /* ------- Render helpers ------- */
  const summary = useMemo(() => {
    const ok = rows.filter((r) => r.status === "ok").length;
    const warn = rows.filter((r) => r.status === "warning").length;
    const err = rows.filter((r) => r.status === "error").length;
    const dupe = rows.filter((r) => r.status === "duplicate").length;
    const totalKw = rows.reduce((s, r) => s + (Number(r.mapped_json?.proposed_kw) || 0), 0);
    const totalSockets = rows.reduce((s, r) => s + (Number(r.mapped_json?.socket_count) || 0), 0);
    return { ok, warn, err, dupe, totalKw, totalSockets };
  }, [rows]);

  const stepper = (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`h-7 px-3 rounded-full text-xs font-medium flex items-center border ${i === step ? "bg-primary text-primary-foreground border-primary" : i < step ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted border-border text-muted-foreground"}`}>
            {i + 1}. {s}
          </div>
          {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><FileSpreadsheet className="h-6 w-6" /> Portfolio Import</h1>
          <p className="text-sm text-muted-foreground">Upload sites for a Work Package. Every import is versioned and reversible.</p>
        </div>
        {batch && <Badge variant="outline">Batch {batch.id.slice(0, 8)} · {batch.status}</Badge>}
      </div>

      {stepper}

      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>Upload sites</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <UploadIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mx-auto" />
              {file && <p className="text-sm mt-2">Selected: <span className="font-mono">{file.name}</span></p>}
            </div>
            <div>
              <Label className="text-xs">Or paste rows (CSV with headers)</Label>
              <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} placeholder="site_name,postcode,proposed_kw,charger_type&#10;Depot A,SW1A 1AA,150,DC" className="mt-1 w-full font-mono text-xs border rounded p-2" />
            </div>
            <div className="flex justify-end">
              <Button onClick={doUpload} disabled={busy !== null || (!file && !pasted.trim())}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Parse & continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && batch && (
        <Card>
          <CardHeader><CardTitle>Map columns</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Detected {rows.length} rows. Review each source column and assign it to a Gridwise field, or set to Ignore.</p>
            <div className="border rounded max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0"><tr><th className="text-left p-2">Source column</th><th className="text-left p-2">Sample</th><th className="text-left p-2">Gridwise field</th></tr></thead>
                <tbody>
                  {headers.map((h) => (
                    <tr key={h} className="border-t">
                      <td className="p-2 font-mono text-xs">{h}</td>
                      <td className="p-2 text-xs text-muted-foreground truncate max-w-xs">{String(rows[0]?.raw_json?.[h] ?? "")}</td>
                      <td className="p-2">
                        <Select value={(batch.mapping_json[h] as string) ?? "__none__"} onValueChange={(v) => updateMapping(h, v)}>
                          <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Ignore —</SelectItem>
                            {CANONICAL_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between mt-4">
              <Button variant="outline" onClick={() => setStep(0)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={saveMappingAndValidate} disabled={busy !== null}>
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Validate rows
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && batch && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <StatCard label="Total" value={rows.length} />
            <StatCard label="OK" value={summary.ok} tone="ok" />
            <StatCard label="Warnings" value={summary.warn} tone="warn" />
            <StatCard label="Errors" value={summary.err} tone="err" />
            <StatCard label="Duplicates" value={summary.dupe} tone="warn" />
            <StatCard label="Total kW" value={Math.round(summary.totalKw).toLocaleString()} />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Row validation</CardTitle>
              <Button size="sm" variant="outline" onClick={doGeocode} disabled={busy !== null}>
                <MapPin className="h-4 w-4 mr-1" /> Geocode missing postcodes
              </Button>
            </CardHeader>
            <CardContent>
              <div className="border rounded max-h-[520px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0"><tr>
                    <th className="text-left p-2 w-16">Status</th>
                    <th className="text-left p-2">Site</th>
                    <th className="text-left p-2">Postcode</th>
                    <th className="text-left p-2">kW</th>
                    <th className="text-left p-2">Coords</th>
                    <th className="text-left p-2">Issues</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2"><StatusPill status={r.status} /></td>
                        <td className="p-2">{r.mapped_json?.site_name ?? r.mapped_json?.address ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2 font-mono">{r.mapped_json?.postcode ?? ""}</td>
                        <td className="p-2 tabular-nums">{r.mapped_json?.proposed_kw ?? ""}</td>
                        <td className="p-2 tabular-nums">{r.lat != null ? `${r.lat.toFixed(4)}, ${r.lng?.toFixed(4)}` : <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2 text-muted-foreground">
                          {(r.errors_json ?? []).map((e, i) => <div key={`e${i}`} className="text-destructive">{e}</div>)}
                          {(r.warnings_json ?? []).map((w, i) => <div key={`w${i}`}>{w}</div>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4 mr-1" /> Back to mapping</Button>
            <Button onClick={() => setStep(3)} disabled={summary.err > 0}>
              {summary.err > 0 ? `Fix ${summary.err} errors first` : "Choose destination"}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && batch && (
        <Card>
          <CardHeader><CardTitle>Where should these sites live?</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button variant={destMode === "existing" ? "default" : "outline"} size="sm" onClick={() => setDestMode("existing")}>Add to existing Work Package</Button>
              <Button variant={destMode === "new" ? "default" : "outline"} size="sm" onClick={() => setDestMode("new")}>Create new Programme / WP</Button>
            </div>
            {destMode === "existing" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Programme</Label>
                  <Select value={selectedProgramme} onValueChange={setSelectedProgramme}>
                    <SelectTrigger><SelectValue placeholder="Choose programme" /></SelectTrigger>
                    <SelectContent>{programmes.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Work Package</Label>
                  <Select value={selectedWp} onValueChange={setSelectedWp}>
                    <SelectTrigger><SelectValue placeholder="Choose work package" /></SelectTrigger>
                    <SelectContent>{workPackages.filter((w) => !selectedProgramme || w.programme_id === selectedProgramme).map((w) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Client</Label>
                  <Select value={selectedClient} onValueChange={setSelectedClient}>
                    <SelectTrigger><SelectValue placeholder="Existing or leave blank" /></SelectTrigger>
                    <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {!selectedClient && <Input className="mt-2" placeholder="…or new client name" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />}
                </div>
                <div>
                  <Label className="text-xs">New Programme name</Label>
                  <Input value={newProgName} onChange={(e) => setNewProgName(e.target.value)} placeholder="e.g. GCC WP4" />
                </div>
                <div>
                  <Label className="text-xs">New Work Package name</Label>
                  <Input value={newWpName} onChange={(e) => setNewWpName(e.target.value)} placeholder="e.g. Imported sites — Feb '26" />
                </div>
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep(4)}>Review summary</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && batch && (
        <Card>
          <CardHeader><CardTitle>Ready to import</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Sites to create" value={summary.ok + summary.warn} tone="ok" />
              <StatCard label="Warnings" value={summary.warn} tone="warn" />
              <StatCard label="Duplicates skipped" value={summary.dupe} tone="warn" />
              <StatCard label="Total kW requested" value={Math.round(summary.totalKw).toLocaleString()} />
              <StatCard label="Total sockets" value={summary.totalSockets.toLocaleString()} />
              <StatCard label="Errors (blocking)" value={summary.err} tone={summary.err > 0 ? "err" : "ok"} />
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>This is a write action</AlertTitle>
              <AlertDescription>
                Sites, Work Package, and Programme records will be created and immediately visible in Portfolio, Delivery, and the GIS map. The full batch is reversible from the batch record.
              </AlertDescription>
            </Alert>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={doApprove} disabled={busy !== null || summary.err > 0}>
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Approve import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && batch && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary"><CheckCircle2 className="h-5 w-5" /> Import complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              {batch.summary_json?.sites_created ?? 0} sites created and linked to Work Package{" "}
              {batch.target_wp_id ? <Link to={`/delivery/wp/${batch.target_wp_id}`} className="underline">open WP</Link> : null}.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button asChild variant="default"><Link to={`/portfolio`}>View in Portfolio</Link></Button>
              {batch.target_wp_id && <Button asChild variant="outline"><Link to={`/delivery/wp/${batch.target_wp_id}`}>Open Work Package</Link></Button>}
              <Button asChild variant="outline"><Link to={`/`}>Show on Map</Link></Button>
            </div>
            <p className="text-xs text-muted-foreground pt-3">
              Feasibility engine is not run automatically. Open Portfolio → select sites → “Run Gridwise Connect”.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" | "err" }) {
  const color = tone === "ok" ? "text-primary" : tone === "warn" ? "text-amber-500" : tone === "err" ? "text-destructive" : "";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok: "bg-primary/10 text-primary border-primary/20",
    warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    error: "bg-destructive/10 text-destructive border-destructive/20",
    duplicate: "bg-muted text-muted-foreground border-border",
    pending: "bg-muted text-muted-foreground border-border",
    skipped: "bg-muted text-muted-foreground border-border",
  };
  return <span className={`inline-flex h-5 px-2 rounded-full border text-[10px] font-medium items-center capitalize ${map[status] ?? ""}`}>{status}</span>;
}

// Utility to reference XLSX so we keep parity with server parser (client also supports .xlsx preview later)
void XLSX;