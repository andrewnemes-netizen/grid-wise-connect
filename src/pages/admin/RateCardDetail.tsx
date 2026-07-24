import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertTriangle, CheckCircle2, Copy, ChevronDown, ChevronRight, Library } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function StatusBadge({ status }: { status: string }) {
  const variant = status === "APPROVED" ? "default" : status === "DRAFT" ? "secondary" : "outline";
  return <Badge variant={variant as any}>{status}</Badge>;
}

/** Natural sort for rate codes like "1.01", "1.10", "2.01", "10.03" — plain
 *  alphabetical sort would put "1.10" before "1.2" and "10.01" before "2.01". */
function compareCodes(a?: string | null, b?: string | null) {
  const pa = String(a ?? "").split(/(\d+)/).filter(Boolean);
  const pb = String(b ?? "").split(/(\d+)/).filter(Boolean);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? "", sb = pb[i] ?? "";
    const numeric = /^\d+$/.test(sa) && /^\d+$/.test(sb);
    if (numeric) {
      const diff = Number(sa) - Number(sb);
      if (diff !== 0) return diff;
    } else if (sa !== sb) {
      return sa.localeCompare(sb);
    }
  }
  return 0;
}

export default function RateCardDetailPage() {
  const { versionId } = useParams<{ versionId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, { description?: string; unit?: string; total_unit_cost?: string; client_unit_price?: string; award_code?: string }>>({});
  const [saving, setSaving] = useState(false);

  const { data: version, isLoading: versionLoading } = useQuery({
    queryKey: ["rate-version", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_card_versions" as any)
        .select("id, version_number, status, notes, imported_at, approved_at, rate_card_id, rate_card:rate_cards(id, name, contract:contracts(id, name))")
        .eq("id", versionId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["rate-items-full", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_items" as any)
        .select("id, rate_code, description, unit, category, total_unit_cost, client_unit_price, needs_pricing, award_code")
        .eq("rate_card_version_id", versionId!)
        .order("category")
        .order("description");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // All other versions of the same rate card, for switching between them.
  const { data: siblingVersions = [] } = useQuery({
    queryKey: ["rate-versions-sibling", (version as any)?.rate_card_id],
    enabled: !!(version as any)?.rate_card_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_card_versions" as any)
        .select("id, version_number, status")
        .eq("rate_card_id", (version as any).rate_card_id)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const readOnly = (version as any)?.status !== "DRAFT";

  const grouped = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const it of items as any[]) {
      const k = it.category?.trim() || "Uncategorised";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    for (const arr of m.values()) arr.sort((a, b) => compareCodes(a.rate_code, b.rate_code));
    // Order groups by the lowest code within each group, so groups appear
    // in the same 1, 2, 3… order as their items, not alphabetically by name.
    return Array.from(m.entries()).sort((a, b) => compareCodes(a[1][0]?.rate_code, b[1][0]?.rate_code));
  }, [items]);

  const needsPricingCount = (items as any[]).filter((i) => i.needs_pricing).length;
  const pendingCount = Object.keys(edits).length;

  const setField = (id: string, field: "description" | "unit" | "total_unit_cost" | "client_unit_price" | "award_code", val: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  };

  const toggleGroup = (name: string) => setCollapsed((c) => ({ ...c, [name]: !c[name] }));

  const saveAll = async () => {
    if (readOnly || pendingCount === 0) return;
    setSaving(true);
    try {
      const ops = Object.entries(edits).map(async ([id, patch]) => {
        const upd: any = {};
        if (patch.description != null) upd.description = patch.description;
        if (patch.unit != null) upd.unit = patch.unit;
        if (patch.total_unit_cost != null && patch.total_unit_cost !== "") {
          upd.total_unit_cost = Number(patch.total_unit_cost);
          upd.needs_pricing = !(upd.total_unit_cost > 0);
        }
        if (patch.client_unit_price != null && patch.client_unit_price !== "") {
          upd.client_unit_price = Number(patch.client_unit_price);
        }
        if (patch.award_code != null) {
          const norm = patch.award_code.trim().toUpperCase();
          upd.award_code = ["C", "I", "E"].includes(norm) ? norm : null;
        }
        if (Object.keys(upd).length === 0) return;
        const { error } = await supabase.from("rate_items" as any).update(upd).eq("id", id);
        if (error) throw error;
      });
      await Promise.all(ops);
      toast.success(`Saved ${pendingCount} item(s)`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ["rate-items-full", versionId] });
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!versionId) return;
    const { error } = await supabase.rpc("approve_rate_card_version" as any, { _version_id: versionId });
    if (error) { toast.error(error.message); return; }
    toast.success("Version approved");
    qc.invalidateQueries({ queryKey: ["rate-version", versionId] });
    qc.invalidateQueries({ queryKey: ["rate-card-library"] });
  };

  const cloneToDraft = async () => {
    if (!versionId) return;
    const { data, error } = await supabase.rpc("clone_rate_card_version_to_draft" as any, { _version_id: versionId });
    if (error) { toast.error(error.message); return; }
    toast.success("New draft version created");
    qc.invalidateQueries({ queryKey: ["rate-card-library"] });
    if (data) navigate(`/admin/rate-cards/${data}`);
  };

  if (versionLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading rate card…</div>;
  }
  if (!version) {
    return <div className="p-6 text-sm text-muted-foreground">Rate card version not found.</div>;
  }

  const v: any = version;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin?tab=estimating" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Rate Card Library
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Library className="h-5 w-5 text-muted-foreground" />
            {v.rate_card?.name ?? "Rate card"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {v.rate_card?.contract?.name ?? "—"} · v{v.version_number} · <StatusBadge status={v.status} />
            {v.imported_at && <> · imported {format(new Date(v.imported_at), "dd MMM yyyy")}</>}
            {v.approved_at && <> · approved {format(new Date(v.approved_at), "dd MMM yyyy")}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {siblingVersions.length > 1 && (
            <select
              className="h-9 rounded-md border bg-background px-2 text-xs"
              value={versionId}
              onChange={(e) => navigate(`/admin/rate-cards/${e.target.value}`)}
            >
              {siblingVersions.map((sv: any) => (
                <option key={sv.id} value={sv.id}>v{sv.version_number} ({sv.status})</option>
              ))}
            </select>
          )}
          {v.status === "DRAFT" ? (
            <Button size="sm" onClick={approve} disabled={needsPricingCount > 0}>Approve version</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={cloneToDraft}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> New draft version
            </Button>
          )}
        </div>
      </div>

      {needsPricingCount > 0 && v.status === "DRAFT" && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {needsPricingCount} item(s) still need pricing. Approval is blocked until every item has a unit cost.
          </AlertDescription>
        </Alert>
      )}
      {readOnly && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This version is {v.status.toLowerCase()} and read-only. Create a new draft version to make edits.
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-0 overflow-hidden">
        <CardHeader className="py-3 flex flex-row items-center justify-between space-y-0 border-b bg-muted/20">
          <div className="text-sm text-muted-foreground">
            {itemsLoading ? "Loading items…" : `${items.length} items across ${grouped.length} group${grouped.length === 1 ? "" : "s"}`}
          </div>
          {!readOnly && (
            <Button size="sm" onClick={saveAll} disabled={saving || pendingCount === 0}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Save {pendingCount || ""} change{pendingCount === 1 ? "" : "s"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {grouped.map(([groupName, groupItems]) => {
            const isCollapsed = !!collapsed[groupName];
            return (
              <div key={groupName} className="border-b last:border-b-0">
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50 text-left"
                  onClick={() => toggleGroup(groupName)}
                >
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <span className="text-sm font-medium">{groupName}</span>
                  <span className="text-xs text-muted-foreground">({groupItems.length} items)</span>
                </button>
                {!isCollapsed && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-28">Unit</TableHead>
                        <TableHead className="w-32 text-right">Our Cost (£)</TableHead>
                        <TableHead className="w-32 text-right">Our Price (£)</TableHead>
                        <TableHead className="w-24">Award</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupItems.map((it: any) => {
                        const edit = edits[it.id] ?? {};
                        const description = edit.description ?? it.description ?? "";
                        const unit = edit.unit ?? it.unit ?? "";
                        const cost = edit.total_unit_cost ?? (it.total_unit_cost ?? "");
                        const price = edit.client_unit_price ?? (it.client_unit_price ?? "");
                        const awardCode = edit.award_code ?? (it.award_code ?? "");
                        // Pricing can be completed even on an APPROVED version if the
                        // item was still unpriced — matches the relaxed DB trigger.
                        const pricingLocked = readOnly && !it.needs_pricing;
                        return (
                          <TableRow key={it.id}>
                            <TableCell className="text-xs font-mono text-muted-foreground">{it.rate_code}</TableCell>
                            <TableCell>
                              <Input className="h-8 text-xs border-none shadow-none focus-visible:ring-1 disabled:opacity-100"
                                disabled={readOnly} value={description}
                                onChange={(e) => setField(it.id, "description", e.target.value)} />
                            </TableCell>
                            <TableCell>
                              <Input className="h-8 text-xs border-none shadow-none focus-visible:ring-1 disabled:opacity-100"
                                disabled={readOnly} value={unit}
                                onChange={(e) => setField(it.id, "unit", e.target.value)} />
                            </TableCell>
                            <TableCell>
                              <Input type="number" step="0.01" className="h-8 text-right text-xs"
                                disabled={pricingLocked} value={cost as any}
                                onChange={(e) => setField(it.id, "total_unit_cost", e.target.value)} />
                            </TableCell>
                            <TableCell>
                              <Input type="number" step="0.01" className="h-8 text-right text-xs"
                                disabled={pricingLocked} value={price as any}
                                onChange={(e) => setField(it.id, "client_unit_price", e.target.value)} />
                            </TableCell>
                            <TableCell>
                              <select
                                className="h-8 w-full rounded-md border bg-background px-1 text-xs disabled:opacity-50"
                                disabled={readOnly}
                                value={awardCode}
                                onChange={(e) => setField(it.id, "award_code", e.target.value)}
                              >
                                <option value="">—</option>
                                <option value="C">C · Civils</option>
                                <option value="I">I · ICP</option>
                                <option value="E">E · Electrical</option>
                              </select>
                            </TableCell>
                            <TableCell>
                              {it.needs_pricing && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
          {!itemsLoading && grouped.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">No items in this rate card version.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
