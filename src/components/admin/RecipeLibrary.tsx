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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { BookOpen, CheckCircle2, ChevronsUpDown, Copy, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type StatusFilter = "ALL" | "DRAFT" | "APPROVED" | "SUPERSEDED";

function StatusBadge({ status }: { status: string }) {
  const variant = status === "APPROVED" ? "default" : status === "DRAFT" ? "secondary" : "outline";
  return <Badge variant={variant as any}>{status}</Badge>;
}

export function RecipeLibrary() {
  const qc = useQueryClient();
  const [contractFilter, setContractFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [buildTypeFilter, setBuildTypeFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);

  const { data: contracts = [] } = useQuery({
    queryKey: ["recipe-lib-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["recipe-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimate_recipes")
        .select("id, name, build_type, socket_count, delivering_partner, version_number, status, notes, imported_at, approved_at, contract_id, contract:contracts(id,name)")
        .order("name", { ascending: true })
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const buildTypes = useMemo(() => {
    const s = new Set<string>();
    (rows as any[]).forEach((r) => r.build_type && s.add(r.build_type));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows as any[]).filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (contractFilter !== "ALL" && r.contract_id !== contractFilter) return false;
      if (buildTypeFilter !== "ALL" && r.build_type !== buildTypeFilter) return false;
      if (q) {
        const hay = `${r.name ?? ""} ${r.contract?.name ?? ""} ${r.build_type ?? ""} ${r.delivering_partner ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, contractFilter, buildTypeFilter]);

  const approve = async (id: string) => {
    const { error } = await supabase.rpc("approve_estimate_recipe", { _recipe_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Recipe approved");
    qc.invalidateQueries({ queryKey: ["recipe-library"] });
  };

  const clone = async (id: string) => {
    const { data, error } = await supabase.rpc("clone_estimate_recipe_to_draft", { _recipe_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("New draft recipe created");
    qc.invalidateQueries({ queryKey: ["recipe-library"] });
    if (data) setEditingRecipeId(data as string);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this DRAFT recipe and all its items?")) return;
    const { error } = await supabase.from("estimate_recipes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Recipe deleted");
    qc.invalidateQueries({ queryKey: ["recipe-library"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Recipe Library</CardTitle>
        <CardDescription>
          Browse imported build recipes, edit DRAFT lines, and approve versions. Approving a recipe
          automatically supersedes any previously approved version with the same name.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search name / contract / partner…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={contractFilter} onValueChange={setContractFilter}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Contract" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All contracts</SelectItem>
              {contracts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={buildTypeFilter} onValueChange={setBuildTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Build type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All build types</SelectItem>
              {buildTypes.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
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
                <TableHead>Recipe</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Build</TableHead>
                <TableHead className="text-right">Sockets</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No recipes found</TableCell></TableRow>
              ) : filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm font-medium">
                    <div>{r.name}</div>
                    {r.delivering_partner && <div className="text-xs text-muted-foreground">{r.delivering_partner}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.contract?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.build_type ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs">{r.socket_count ?? "—"}</TableCell>
                  <TableCell className="text-xs">v{r.version_number}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.approved_at ? format(new Date(r.approved_at), "dd MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEditingRecipeId(r.id)}>
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

        {editingRecipeId && (
          <RecipeItemsDialog recipeId={editingRecipeId} onClose={() => setEditingRecipeId(null)} />
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Items dialog ----------
function RecipeItemsDialog({ recipeId, onClose }: { recipeId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const { data: recipe } = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimate_recipes")
        .select("id, name, version_number, status, contract_id, build_type, socket_count")
        .eq("id", recipeId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["recipe-items", recipeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_items")
        .select("id, rate_item_id, description_override, unit, default_quantity, stage, cost_code, cost_code_category, is_allowance, sort_index, rate_item:rate_items(id, rate_code, description, unit, total_unit_cost, client_unit_price)")
        .eq("recipe_id", recipeId)
        .order("sort_index", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const readOnly = (recipe as any)?.status !== "DRAFT";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items as any[];
    return (items as any[]).filter((it) => {
      const hay = `${it.description_override ?? ""} ${it.rate_item?.description ?? ""} ${it.rate_item?.rate_code ?? ""} ${it.stage ?? ""} ${it.cost_code ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const pending = Object.keys(edits).length;

  const setField = (id: string, field: string, val: any) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  };

  const saveAll = async () => {
    if (readOnly || pending === 0) return;
    setSaving(true);
    try {
      const ops = Object.entries(edits).map(async ([id, patch]) => {
        const upd: any = { ...patch };
        if (upd.default_quantity != null && upd.default_quantity !== "")
          upd.default_quantity = Number(upd.default_quantity);
        const { error } = await supabase.from("recipe_items").update(upd).eq("id", id);
        if (error) throw error;
      });
      await Promise.all(ops);
      toast.success(`Saved ${pending} item(s)`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ["recipe-items", recipeId] });
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally { setSaving(false); }
  };

  const removeItem = async (id: string) => {
    if (readOnly) return;
    if (!confirm("Remove this line?")) return;
    const { error } = await supabase.from("recipe_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    refetch();
  };

  const addItem = async (rateItem: any) => {
    if (readOnly) return;
    const nextIndex = Math.max(0, ...(items as any[]).map((i) => i.sort_index ?? 0)) + 1;
    const { error } = await supabase.from("recipe_items").insert({
      recipe_id: recipeId,
      rate_item_id: rateItem.id,
      description_override: rateItem.description,
      unit: rateItem.unit,
      default_quantity: 1,
      sort_index: nextIndex,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Line added");
    refetch();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(recipe as any)?.name ?? "Recipe"} · v{(recipe as any)?.version_number}
            {recipe && <StatusBadge status={(recipe as any).status} />}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? "This recipe is read-only. Use “New version” from the list to create an editable draft."
              : "Edit line quantities, stages, and notes. Prices come from the linked rate item."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search description / code / stage…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          {!readOnly && <AddLineButton contractId={(recipe as any)?.contract_id} onPick={addItem} />}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{filtered.length} / {items.length} lines</span>
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
                <TableHead className="w-24 text-right">Qty</TableHead>
                <TableHead className="w-28 text-right">Unit £</TableHead>
                <TableHead className="w-28 text-right">Line £</TableHead>
                <TableHead className="w-32">Stage</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No lines</TableCell></TableRow>
              ) : filtered.map((it: any) => {
                const edit = edits[it.id] ?? {};
                const qty = edit.default_quantity ?? it.default_quantity ?? 0;
                const unitCost = Number(it.rate_item?.total_unit_cost ?? 0);
                const desc = edit.description_override ?? it.description_override ?? it.rate_item?.description ?? "";
                const stage = edit.stage ?? it.stage ?? "";
                return (
                  <TableRow key={it.id}>
                    <TableCell className="text-xs font-mono">{it.rate_item?.rate_code ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      <Input className="h-8 text-xs" disabled={readOnly} value={desc as any}
                        onChange={(e) => setField(it.id, "description_override", e.target.value)} />
                      {it.cost_code && <div className="text-[10px] text-muted-foreground mt-0.5">{it.cost_code}{it.cost_code_category ? ` · ${it.cost_code_category}` : ""}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{it.unit ?? it.rate_item?.unit ?? "—"}</TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" className="h-8 text-right text-xs"
                        disabled={readOnly} value={qty as any}
                        onChange={(e) => setField(it.id, "default_quantity", e.target.value)} />
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {unitCost ? `£${unitCost.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {unitCost ? `£${(Number(qty) * unitCost).toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Input className="h-8 text-xs" disabled={readOnly} value={stage as any}
                        onChange={(e) => setField(it.id, "stage", e.target.value)} />
                    </TableCell>
                    <TableCell>
                      {!readOnly && (
                        <Button size="sm" variant="ghost" onClick={() => removeItem(it.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
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

// ---------- Rate item picker ----------
function AddLineButton({ contractId, onPick }: { contractId?: string | null; onPick: (rateItem: any) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data: rateItems = [] } = useQuery({
    queryKey: ["approved-rate-items", contractId ?? "all"],
    enabled: open,
    queryFn: async () => {
      // Find approved rate card versions (optionally scoped to the recipe's contract)
      let cardQ = supabase.from("rate_cards").select("id").limit(200);
      if (contractId) cardQ = cardQ.eq("contract_id", contractId);
      const { data: cards, error: cardErr } = await cardQ;
      if (cardErr) throw cardErr;
      const cardIds = (cards ?? []).map((c: any) => c.id);
      if (cardIds.length === 0) return [];
      const { data: versions, error: vErr } = await supabase
        .from("rate_card_versions")
        .select("id")
        .in("rate_card_id", cardIds)
        .eq("status", "APPROVED");
      if (vErr) throw vErr;
      const versionIds = (versions ?? []).map((v: any) => v.id);
      if (versionIds.length === 0) return [];
      const { data, error } = await supabase
        .from("rate_items")
        .select("id, rate_code, description, unit, total_unit_cost")
        .in("rate_card_version_id", versionIds)
        .order("rate_code")
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return (rateItems as any[]).slice(0, 100);
    return (rateItems as any[])
      .filter((r) => `${r.rate_code} ${r.description}`.toLowerCase().includes(s))
      .slice(0, 100);
  }, [rateItems, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add line
          <ChevronsUpDown className="h-3 w-3 ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[520px]" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search approved rate items…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>No matching items</CommandEmpty>
            <CommandGroup>
              {filtered.map((r: any) => (
                <CommandItem key={r.id} value={r.id} onSelect={() => { onPick(r); setOpen(false); setQ(""); }}>
                  <div className="flex flex-col text-xs">
                    <span className="font-mono">{r.rate_code} · {r.unit}</span>
                    <span className="text-muted-foreground truncate max-w-[440px]">{r.description}</span>
                  </div>
                  <span className="ml-auto text-xs tabular-nums">
                    {r.total_unit_cost ? `£${Number(r.total_unit_cost).toFixed(2)}` : "—"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}