import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Line {
  id: string;
  rate_code: string | null;
  description: string | null;
  designer_cost: number | null;
  confirmed_unit_cost: number | null;
  extraction_confidence: number | null;
  reviewed: boolean;
  source_file_id: string | null;
}

export function PocDesignerReturnReviewDialog({
  open, onOpenChange, po,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  po: any;
}) {
  const qc = useQueryClient();
  const [extracting, setExtracting] = useState(false);
  const [rows, setRows] = useState<Line[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contractId, setContractId] = useState<string | undefined>();
  const [cardName, setCardName] = useState("");

  const { data: ret } = useQuery({
    queryKey: ["poc-return-for-po", po?.id],
    enabled: open && !!po?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poc_designer_returns")
        .select("id, status, expires_at, submitted_at, token")
        .eq("po_id", po.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: files = [] } = useQuery({
    queryKey: ["poc-return-files", (ret as any)?.id],
    enabled: !!(ret as any)?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poc_designer_return_files")
        .select("id, original_filename, file_type, storage_path")
        .eq("return_id", (ret as any).id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: lines = [], refetch: refetchLines } = useQuery({
    queryKey: ["poc-return-lines", (ret as any)?.id],
    enabled: !!(ret as any)?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poc_designer_return_lines")
        .select("*")
        .eq("return_id", (ret as any).id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Line[];
    },
  });

  useEffect(() => { setRows(lines as Line[]); }, [lines]);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-all"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, name, client_id, status, clients:client_id(name)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open || contractId || (contracts as any[]).length === 0) return;
    const activeContracts = (contracts as any[]).filter((c) => c.status !== "closed");
    const preferred = activeContracts.find((c) => c.client_id && c.client_id === po?.client_id)
      ?? (contracts as any[]).find((c) => c.client_id && c.client_id === po?.client_id)
      ?? activeContracts[0]
      ?? (contracts as any[])[0];
    if (preferred?.id) setContractId(preferred.id);
  }, [contractId, contracts, open, po?.client_id]);

  const runExtract = async () => {
    if (!(ret as any)?.id) return;
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-poc-return-costs", {
        body: { return_id: (ret as any).id },
      });
      if (error) throw error;
      toast.success(`Extracted ${(data as any)?.inserted ?? 0} line(s)`);
      await refetchLines();
    } catch (e: any) {
      toast.error(e?.message ?? "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const patchRow = (id: string, patch: Partial<Line>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const saveDrafts = async () => {
    const dirty = rows.filter(r => {
      const orig = (lines as Line[]).find(l => l.id === r.id);
      if (!orig) return false;
      return orig.rate_code !== r.rate_code
        || orig.description !== r.description
        || orig.designer_cost !== r.designer_cost
        || orig.confirmed_unit_cost !== r.confirmed_unit_cost;
    });
    if (dirty.length === 0) return;
    for (const r of dirty) {
      const { error } = await supabase.from("poc_designer_return_lines").update({
        rate_code: r.rate_code?.trim() || null,
        description: r.description?.trim() || null,
        designer_cost: r.designer_cost, confirmed_unit_cost: r.confirmed_unit_cost,
      }).eq("id", r.id);
      if (error) throw error;
    }
    toast.success(`Saved ${dirty.length} line(s)`);
    await refetchLines();
  };

  const confirm = useMutation({
    mutationFn: async () => {
      if (!contractId) throw new Error("Select a contract");
      const line_ids = Array.from(selected);
      if (line_ids.length === 0) throw new Error("Select at least one line");
      await saveDrafts();
      const { data, error } = await supabase.functions.invoke("confirm-poc-return-lines", {
        body: {
          return_id: (ret as any).id,
          contract_id: contractId,
          rate_card_name: cardName.trim() || undefined,
          line_ids,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Rate card DRAFT created — ${data.inserted} item(s). Approve it in the Rate Library.`);
      qc.invalidateQueries({ queryKey: ["wp-purchase-orders"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Confirm failed"),
  });

  const canConfirm = useMemo(() => {
    if (!contractId || selected.size === 0) return false;
    return Array.from(selected).every(id => {
      const r = rows.find(x => x.id === id);
      return r
        && !!r.rate_code?.trim()
        && !!r.description?.trim()
        && r.confirmed_unit_cost != null
        && Number.isFinite(Number(r.confirmed_unit_cost));
    });
  }, [selected, rows, contractId]);

  const confirmBlocker = useMemo(() => {
    if (selected.size === 0) return "Select at least one line";
    if (!contractId) return "Select a contract";
    const missing = Array.from(selected).filter((id) => {
      const r = rows.find((x) => x.id === id);
      return !r
        || !r.rate_code?.trim()
        || !r.description?.trim()
        || r.confirmed_unit_cost == null
        || !Number.isFinite(Number(r.confirmed_unit_cost));
    }).length;
    if (missing > 0) return `${missing} selected line${missing === 1 ? " is" : "s are"} missing a rate code, description or confirmed cost`;
    return null;
  }, [selected, rows, contractId]);

  const signedUrl = async (path: string) => {
    const { data } = await supabase.storage
      .from("poc-designer-returns")
      .createSignedUrl(path, 60 * 10);
    return data?.signedUrl;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Review designer return — PO {po?.po_number}</DialogTitle>
          <DialogDescription>
            Verify the AI-extracted lines against the source files. Nothing reaches the rate library until you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Status: {(ret as any)?.status ?? "—"}</Badge>
            {(files as any[]).map((f) => (
              <Button
                key={f.id} size="sm" variant="outline"
                onClick={async () => {
                  const url = await signedUrl(f.storage_path);
                  if (url) window.open(url, "_blank");
                  else toast.error("Could not open file");
                }}
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                {f.original_filename}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            ))}
            <div className="ml-auto">
              <Button size="sm" onClick={runExtract} disabled={extracting || !(ret as any)?.id}>
                {extracting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {rows.length > 0 ? "Re-extract with AI" : "Extract with AI"}
              </Button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="border rounded-md p-6 text-sm text-center text-muted-foreground">
              No extracted lines yet. Click "Extract with AI" to parse the uploaded files.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={rows.filter((r) => !r.reviewed).length > 0 && rows.filter((r) => !r.reviewed).every((r) => selected.has(r.id))}
                      onCheckedChange={(v) => {
                        setSelected(v
                          ? new Set(rows.filter((r) => !r.reviewed).map((r) => r.id))
                          : new Set()
                        );
                      }}
                    />
                  </TableHead>
                  <TableHead className="w-32">Rate code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-32 text-right">Designer £</TableHead>
                  <TableHead className="w-32 text-right">Confirmed £</TableHead>
                  <TableHead className="w-20 text-right">Conf.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={r.reviewed ? "opacity-60" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.id)}
                        disabled={r.reviewed}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          if (v) next.add(r.id); else next.delete(r.id);
                          setSelected(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.rate_code ?? ""} disabled={r.reviewed}
                        onChange={(e) => patchRow(r.id, { rate_code: e.target.value.toUpperCase() })}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.description ?? ""} disabled={r.reviewed}
                        onChange={(e) => patchRow(r.id, { description: e.target.value })}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" step="0.01" className="h-8 text-right"
                        value={r.designer_cost ?? ""} disabled={r.reviewed}
                        onChange={(e) => patchRow(r.id, { designer_cost: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" step="0.01" className="h-8 text-right"
                        value={r.confirmed_unit_cost ?? ""} disabled={r.reviewed}
                        onChange={(e) => patchRow(r.id, { confirmed_unit_cost: e.target.value === "" ? null : Number(e.target.value) })}
                        placeholder={r.designer_cost != null ? String(r.designer_cost) : "—"}
                      />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {r.extraction_confidence != null ? `${Math.round(r.extraction_confidence * 100)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="border rounded-md p-3 space-y-3 bg-muted/30">
            <div className="text-sm font-medium">Materialise selected lines into rate library (DRAFT)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contract</Label>
                <Select value={contractId} onValueChange={setContractId}>
                  <SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger>
                  <SelectContent>
                    {(contracts as any[]).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.clients?.name ? ` — ${c.clients.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Rate card name (optional)</Label>
                <Input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder={`POC return ${po?.po_number ?? ""}`} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A new DRAFT rate card version will be created. Approve it in the Rate Library the same way as any other import.
            </p>
            {confirmBlocker && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{confirmBlocker}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" onClick={saveDrafts}>Save edits</Button>
          <Button
            onClick={() => confirm.mutate()}
            disabled={!canConfirm || confirm.isPending}
          >
            {confirm.isPending ? "Confirming…" : `Confirm ${selected.size} line${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}