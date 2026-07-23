import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, Library, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

function StatusBadge({ status }: { status: string }) {
  const variant = status === "APPROVED" ? "default" : status === "DRAFT" ? "secondary" : "outline";
  return <Badge variant={variant as any}>{status}</Badge>;
}

export default function RateCardDetail() {
  const { versionId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasRole } = useAuth();

  const [search, setSearch] = useState("");
  const [onlyNeedsPricing, setOnlyNeedsPricing] = useState(false);
  const [edits, setEdits] = useState<Record<string, { total_unit_cost?: string; client_unit_price?: string; productivity_qty_per_day?: string; default_crew_size?: string }>>({});
  const [saving, setSaving] = useState(false);

  const { data: version, isLoading: loadingVersion } = useQuery({
    queryKey: ["rate-card-detail-version", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_card_versions")
        .select("id, version_number, status, notes, source_workbook, imported_at, approved_at, effective_from, effective_to, rate_card:rate_cards(id, name, code, contract:contracts(id, name))")
        .eq("id", versionId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["rate-card-detail-items", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_items")
        .select("id, rate_code, description, unit, category, labour_cost, material_cost, total_unit_cost, client_unit_price, needs_pricing, productivity_qty_per_day, default_crew_size")
        .eq("rate_card_version_id", versionId)
        .order("rate_code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const readOnly = version?.status !== "DRAFT";

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

  const setField = (id: string, field: "total_unit_cost" | "client_unit_price" | "productivity_qty_per_day" | "default_crew_size", val: string) => {
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
        if (patch.productivity_qty_per_day != null && patch.productivity_qty_per_day !== "") {
          upd.productivity_qty_per_day = Number(patch.productivity_qty_per_day);
        }
        if (patch.default_crew_size != null && patch.default_crew_size !== "") {
          upd.default_crew_size = Math.max(1, Math.round(Number(patch.default_crew_size)));
        }
        if (Object.keys(upd).length === 0) return;
        const { error } = await supabase.from("rate_items").update(upd).eq("id", id);
        if (error) throw error;
      });
      await Promise.all(ops);
      toast.success(`Saved ${pending} item(s)`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ["rate-card-detail-items", versionId] });
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally { setSaving(false); }
  };

  const approve = async () => {
    const { error } = await supabase.rpc("approve_rate_card_version", { _version_id: versionId });
    if (error) { toast.error(error.message); return; }
    toast.success("Version approved");
    qc.invalidateQueries({ queryKey: ["rate-card-detail-version", versionId] });
    qc.invalidateQueries({ queryKey: ["rate-card-library"] });
  };

  const clone = async () => {
    const { data, error } = await supabase.rpc("clone_rate_card_version_to_draft", { _version_id: versionId });
    if (error) { toast.error(error.message); return; }
    toast.success("New draft version created");
    qc.invalidateQueries({ queryKey: ["rate-card-library"] });
    if (data) navigate(`/admin/rate-cards/${data as string}`);
  };

  const remove = async () => {
    if (!confirm("Delete this DRAFT version and all its items?")) return;
    const { error } = await supabase.from("rate_card_versions").delete().eq("id", versionId);
    if (error) { toast.error(error.message); return; }
    toast.success("Version deleted");
    qc.invalidateQueries({ queryKey: ["rate-card-library"] });
    navigate("/admin");
  };

  if (!hasRole("admin")) {
    return (
      <div className="p-6">
        <Card><CardContent className="py-8 text-center text-muted-foreground">Admin role required.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 h-full overflow-auto">
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Admin</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Library className="h-5 w-5" />
              {loadingVersion ? "Loading…" : (version?.rate_card?.name ?? "Rate card")}
              {version && <span className="text-sm text-muted-foreground">· v{version.version_number}</span>}
              {version && <StatusBadge status={version.status} />}
            </CardTitle>
            <CardDescription>
              {version?.rate_card?.contract?.name && (<>Contract: {version.rate_card.contract.name}. </>)}
              {version?.imported_at && (<>Imported {format(new Date(version.imported_at), "dd MMM yyyy")}. </>)}
              {version?.approved_at && (<>Approved {format(new Date(version.approved_at), "dd MMM yyyy")}.</>)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {version?.status === "DRAFT" && (
              <>
                <Button size="sm" variant="outline" onClick={approve}>Approve version</Button>
                <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
            {version && version.status !== "DRAFT" && (
              <Button size="sm" variant="outline" onClick={clone}>
                <Copy className="h-4 w-4 mr-1" /> New version
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
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

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24">Unit</TableHead>
                  <TableHead className="w-32 text-right">Unit cost (£)</TableHead>
                  <TableHead className="w-32 text-right">Client price (£)</TableHead>
                  <TableHead className="w-24 text-right">Prod / day</TableHead>
                  <TableHead className="w-16 text-right">Crew</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingItems ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No items match filters</TableCell></TableRow>
                ) : filtered.map((it: any) => {
                  const edit = edits[it.id] ?? {};
                  const cost = edit.total_unit_cost ?? (it.total_unit_cost ?? "");
                  const price = edit.client_unit_price ?? (it.client_unit_price ?? "");
                  const prod = edit.productivity_qty_per_day ?? (it.productivity_qty_per_day ?? "");
                  const crew = edit.default_crew_size ?? (it.default_crew_size ?? "");
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
                        <Input type="number" step="0.5" className="h-8 text-right text-xs"
                          disabled={readOnly} value={prod as any} placeholder={`${it.unit}/day`}
                          onChange={(e) => setField(it.id, "productivity_qty_per_day", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="1" min="1" className="h-8 text-right text-xs"
                          disabled={readOnly} value={crew as any} placeholder="1"
                          onChange={(e) => setField(it.id, "default_crew_size", e.target.value)} />
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
        </CardContent>
      </Card>
    </div>
  );
}