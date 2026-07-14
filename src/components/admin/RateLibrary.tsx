import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Copy, FileText, Library, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type StatusFilter = "ALL" | "DRAFT" | "APPROVED" | "SUPERSEDED";

function StatusBadge({ status }: { status: string }) {
  const variant = status === "APPROVED" ? "default" : status === "DRAFT" ? "secondary" : "outline";
  return <Badge variant={variant as any}>{status}</Badge>;
}

export function RateLibrary() {
  const qc = useQueryClient();
  const [contractFilter, setContractFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);

  const { data: contracts = [] } = useQuery({
    queryKey: ["rate-library-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["rate-library-versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_card_versions")
        .select("id, version_number, status, notes, source_workbook, imported_at, approved_at, effective_from, effective_to, rate_card:rate_cards(id, name, code, contract_id, contract:contracts(id, name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows as any[]).filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (contractFilter !== "ALL" && r.rate_card?.contract_id !== contractFilter) return false;
      if (q) {
        const hay = `${r.rate_card?.name ?? ""} ${r.rate_card?.contract?.name ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, contractFilter]);

  const approve = async (versionId: string) => {
    const { error } = await supabase.rpc("approve_rate_card_version", { _version_id: versionId });
    if (error) { toast.error(error.message); return; }
    toast.success("Version approved");
    qc.invalidateQueries({ queryKey: ["rate-library-versions"] });
  };

  const clone = async (versionId: string) => {
    const { data, error } = await supabase.rpc("clone_rate_card_version_to_draft", { _version_id: versionId });
    if (error) { toast.error(error.message); return; }
    toast.success("New draft version created");
    qc.invalidateQueries({ queryKey: ["rate-library-versions"] });
    if (data) setEditingVersionId(data as string);
  };

  const remove = async (versionId: string) => {
    if (!confirm("Delete this DRAFT version and all its items?")) return;
    const { error } = await supabase.from("rate_card_versions").delete().eq("id", versionId);
    if (error) { toast.error(error.message); return; }
    toast.success("Version deleted");
    qc.invalidateQueries({ queryKey: ["rate-library-versions"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Library className="h-5 w-5" /> Rate Library</CardTitle>
        <CardDescription>
          Browse imported rate cards, edit DRAFT prices, and approve versions. Approving a version
          automatically supersedes any previously approved version on the same card.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search rate card, contract, notes…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={contractFilter} onValueChange={setContractFilter}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Contract" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All contracts</SelectItem>
              {contracts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="SUPERSEDED">Superseded</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rate card</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Imported</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No versions found</TableCell></TableRow>
              ) : filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm font-medium">{r.rate_card?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.rate_card?.contract?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">v{r.version_number}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.imported_at ? format(new Date(r.imported_at), "dd MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.approved_at ? format(new Date(r.approved_at), "dd MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEditingVersionId(r.id)}>
                      {r.status === "DRAFT" ? <Pencil className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                    </Button>
                    {r.status === "DRAFT" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => approve(r.id)}>Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {r.status !== "DRAFT" && (
                      <Button size="sm" variant="outline" onClick={() => clone(r.id)}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> New version
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {editingVersionId && (
          <RateItemsDialog versionId={editingVersionId} onClose={() => setEditingVersionId(null)} />
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Rate Items Dialog ----------
function RateItemsDialog({ versionId, onClose }: { versionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyNeedsPricing, setOnlyNeedsPricing] = useState(false);
  const [edits, setEdits] = useState<Record<string, { total_unit_cost?: string; client_unit_price?: string }>>({});
  const [saving, setSaving] = useState(false);

  const { data: version } = useQuery({
    queryKey: ["rate-version", versionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_card_versions")
        .select("id, version_number, status, notes, rate_card:rate_cards(name)")
        .eq("id", versionId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["rate-items", versionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_items")
        .select("id, rate_code, description, unit, category, labour_cost, material_cost, total_unit_cost, client_unit_price, needs_pricing")
        .eq("rate_card_version_id", versionId)
        .order("rate_code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const readOnly = (version as any)?.status !== "DRAFT";
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items as any[]).filter((it) => {
      if (onlyNeedsPricing && !it.needs_pricing) return false;
      if (!q) return true;
      return `${it.rate_code} ${it.description} ${it.category ?? ""}`.toLowerCase().includes(q);
    });
  }, [items, search, onlyNeedsPricing]);

  const needsPricingCount = (items as any[]).filter((i) => i.needs_pricing).length;
  const pending = Object.keys(edits).length;

  const setField = (id: string, field: "total_unit_cost" | "client_unit_price", val: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  };

  const saveAll = async () => {
    if (readOnly || pending === 0) return;
    setSaving(true);
    try {
      const ops = Object.entries(edits).map(async ([id, patch]) => {
        const upd: any = {};
        if (patch.total_unit_cost != null && patch.total_unit_cost !== "") {
          upd.total_unit_cost = Number(patch.total_unit_cost);
          upd.needs_pricing = !(upd.total_unit_cost > 0);
        }
        if (patch.client_unit_price != null && patch.client_unit_price !== "") {
          upd.client_unit_price = Number(patch.client_unit_price);
        }
        if (Object.keys(upd).length === 0) return;
        const { error } = await supabase.from("rate_items").update(upd).eq("id", id);
        if (error) throw error;
      });
      await Promise.all(ops);
      toast.success(`Saved ${pending} item(s)`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ["rate-items", versionId] });
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(version as any)?.rate_card?.name ?? "Rate card"} · v{(version as any)?.version_number}
            {version && <StatusBadge status={(version as any).status} />}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? "This version is read-only. Use “New version” from the list to create an editable draft."
              : "Edit unit costs and client prices. Rows with cost > 0 are marked as priced automatically."}
          </DialogDescription>
        </DialogHeader>

        {needsPricingCount > 0 && !readOnly && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {needsPricingCount} item(s) still need pricing. Approval is blocked until every item has a unit cost.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search code / description / category…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Button size="sm" variant={onlyNeedsPricing ? "default" : "outline"}
            onClick={() => setOnlyNeedsPricing((v) => !v)}>
            Needs pricing only
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{filtered.length} / {items.length} items</span>
            {!readOnly && (
              <Button size="sm" onClick={saveAll} disabled={saving || pending === 0}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Save {pending || ""} changes
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-md border overflow-hidden max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24">Unit</TableHead>
                <TableHead className="w-32 text-right">Unit cost (£)</TableHead>
                <TableHead className="w-32 text-right">Client price (£)</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No items match filters</TableCell></TableRow>
              ) : filtered.map((it: any) => {
                const edit = edits[it.id] ?? {};
                const cost = edit.total_unit_cost ?? (it.total_unit_cost ?? "");
                const price = edit.client_unit_price ?? (it.client_unit_price ?? "");
                return (
                  <TableRow key={it.id}>
                    <TableCell className="text-xs font-mono">{it.rate_code}</TableCell>
                    <TableCell className="text-xs">
                      <div>{it.description}</div>
                      {it.category && <div className="text-muted-foreground">{it.category}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{it.unit}</TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" className="h-8 text-right text-xs"
                        disabled={readOnly} value={cost as any}
                        onChange={(e) => setField(it.id, "total_unit_cost", e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" className="h-8 text-right text-xs"
                        disabled={readOnly} value={price as any}
                        onChange={(e) => setField(it.id, "client_unit_price", e.target.value)} />
                    </TableCell>
                    <TableCell>
                      {it.needs_pricing && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}