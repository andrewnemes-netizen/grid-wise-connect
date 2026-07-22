import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number, c = "GBP") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: c, minimumFractionDigits: 2 }).format(n || 0);

type Draft = Record<string, any>;

const DEFAULT: Draft = {
  boq_item_name: "", boq_description: "", pricing_notes: "",
  item_logic: "SUPPLY_AND_INSTALL", qty: 1, uom: "ea",
  time_value: 0, time_measure: "Minutes", no_resources: null,
  supplier: "", product_service: "", product_type: "",
  unit_cost: 0, markup_type: "Combination", markup_dollar: 0, markup_pct: 0, contingency_pct: 0,
  discount: 0, vat_rate: 20,
  cost_category: "", cost_code: "", charge_out_rate_used: "BOQ Item Rate", conversion_type: "Show on Convert",
  show_image_in_proposal: false, solution_link: "", image_link: "",
  itemised: false, flexible_qty: false, fixed_price: false, lock_markup_dollar: false,
  split_labour_materials: false, calculate_time: true, rfq_required: false, is_allowance: false,
  compare_list: "", compare_title: "",
  project_sync_type: "", project_task_name: "", project_description: "",
  milestone_for_sync: "", project_stage: "", include_in_create_task: true,
  stage: "", attribute_group: "",
};

export function EstimateLineDialog({
  estimateId, lineId, groupId, currency, onOpenChange, onSaved,
}: {
  estimateId: string;
  lineId: string | null;
  groupId: string | null;
  currency: string;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(DEFAULT);
  const [saving, setSaving] = useState(false);

  const existing = useQuery({
    queryKey: ["estimate-line", lineId],
    enabled: !!lineId,
    queryFn: async () => {
      const { data, error } = await supabase.from("estimate_lines" as any).select("*").eq("id", lineId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (existing.data) setD({ ...DEFAULT, ...existing.data });
    else if (!lineId) setD(DEFAULT);
  }, [existing.data, lineId]);

  const set = (k: string, v: any) => setD((prev) => ({ ...prev, [k]: v }));
  const num = (k: string) => Number(d[k] ?? 0);

  // Live preview
  const baseCost = num("qty") * num("unit_cost");
  let markupAmt = 0;
  if (d.markup_type === "Percentage") markupAmt = baseCost * num("markup_pct") / 100;
  else if (d.markup_type === "Amount") markupAmt = num("markup_dollar") * num("qty");
  else markupAmt = num("markup_dollar") * num("qty") + baseCost * num("markup_pct") / 100;
  markupAmt += baseCost * num("contingency_pct") / 100;
  const totalPrice = baseCost + markupAmt;
  const unitPrice = num("qty") > 0 ? totalPrice / num("qty") : 0;
  const netMarkupPct = baseCost > 0 ? (markupAmt / baseCost) * 100 : 0;
  const subTotal = totalPrice - num("discount");
  const vat = subTotal * num("vat_rate") / 100;
  const grand = subTotal + vat;

  async function save() {
    setSaving(true);
    try {
      const payload = { ...d, estimate_id: estimateId, group_id: groupId ?? d.group_id ?? null };
      // strip readonly totals
      ["total_cost","total_markup","total_price","unit_price","net_markup_pct","sub_total","vat_amount","grand_total","created_at","updated_at","id"].forEach((k) => delete (payload as any)[k]);
      if (lineId) {
        const { error } = await supabase.from("estimate_lines" as any).update(payload as any).eq("id", lineId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("estimate_lines" as any).insert(payload as any);
        if (error) throw error;
      }
      toast.success(lineId ? "Line updated" : "Line added");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/5 to-background">
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Info className="h-4 w-4 text-primary" />
            {lineId ? "Edit" : "New"} — {d.boq_item_name || "BOQ item"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1 — Details / Install / Supplier / Features */}
            <div className="space-y-6">
              <Section title="BOQ Item Details">
                <Field label="BOQ Item Name"><Input value={d.boq_item_name} onChange={(e) => set("boq_item_name", e.target.value)} /></Field>
                <Field label="BOQ Description"><Textarea rows={2} value={d.boq_description ?? ""} onChange={(e) => set("boq_description", e.target.value)} /></Field>
                <Field label="Pricing Notes"><Textarea rows={2} value={d.pricing_notes ?? ""} onChange={(e) => set("pricing_notes", e.target.value)} /></Field>
              </Section>
              <Section title="BOQ Item Quantity">
                <Field label="BOQ Item Logic">
                  <Select value={d.item_logic} onValueChange={(v) => set("item_logic", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SUPPLY_AND_INSTALL">Supply and Install</SelectItem>
                      <SelectItem value="SUPPLY_ONLY">Supply Only</SelectItem>
                      <SelectItem value="INSTALL_ONLY">Install Only</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Qty"><Input type="number" step="any" value={d.qty} onChange={(e) => set("qty", parseFloat(e.target.value) || 0)} /></Field>
                <Field label="Unit of Measure"><Input value={d.uom ?? ""} onChange={(e) => set("uom", e.target.value)} /></Field>
              </Section>
              <Section title="Install Details">
                <Field label="Time"><Input type="number" step="any" value={d.time_value ?? 0} onChange={(e) => set("time_value", parseFloat(e.target.value) || 0)} /></Field>
                <Field label="Time Measure">
                  <Select value={d.time_measure ?? "Minutes"} onValueChange={(v) => set("time_measure", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["Minutes","Hours","Days"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="No. Resources"><Input type="number" step="any" value={d.no_resources ?? ""} onChange={(e) => set("no_resources", e.target.value === "" ? null : parseFloat(e.target.value))} /></Field>
              </Section>
              <Section title="Supplier and Product">
                <Field label="Supplier"><Input value={d.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)} /></Field>
                <Field label="Product / Service"><Input value={d.product_service ?? ""} onChange={(e) => set("product_service", e.target.value)} /></Field>
                <Field label="Product Type"><Input value={d.product_type ?? ""} onChange={(e) => set("product_type", e.target.value)} /></Field>
              </Section>
              <Section title="Estimating Features">
                <CheckboxRow d={d} k="itemised" label="Itemised" set={set} />
                <CheckboxRow d={d} k="flexible_qty" label="Flexible Qty" set={set} />
                <CheckboxRow d={d} k="fixed_price" label="Fixed Price" set={set} />
                <CheckboxRow d={d} k="lock_markup_dollar" label="Lock Markup as £" set={set} />
                <CheckboxRow d={d} k="split_labour_materials" label="Split Labour & Materials" set={set} />
                <CheckboxRow d={d} k="calculate_time" label="Calculate Time" set={set} />
                <CheckboxRow d={d} k="rfq_required" label="RFQ Required" set={set} />
                <CheckboxRow d={d} k="is_allowance" label="Allowance" set={set} />
              </Section>
            </div>

            {/* Column 2 — Pricing / Mark up / Sub / Tax */}
            <div className="space-y-6">
              <Section title="Pricing Details">
                <Field label="Unit Cost"><Input type="number" step="any" value={d.unit_cost} onChange={(e) => set("unit_cost", parseFloat(e.target.value) || 0)} /></Field>
                <ReadonlyField label="Unit Price (incl. markup)" value={fmt(unitPrice, currency)} accent />
              </Section>
              <Section title="Mark Up Details">
                <Field label="Markup Type">
                  <Select value={d.markup_type} onValueChange={(v) => set("markup_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["Percentage","Amount","Combination"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Markup as £"><Input type="number" step="any" value={d.markup_dollar ?? 0} onChange={(e) => set("markup_dollar", parseFloat(e.target.value) || 0)} /></Field>
                <Field label="Markup as %"><Input type="number" step="any" value={d.markup_pct ?? 0} onChange={(e) => set("markup_pct", parseFloat(e.target.value) || 0)} /></Field>
                <Field label="Contingency Markup %"><Input type="number" step="any" value={d.contingency_pct ?? 0} onChange={(e) => set("contingency_pct", parseFloat(e.target.value) || 0)} /></Field>
                <ReadonlyField label="Net Mark Up %" value={`${netMarkupPct.toFixed(2)} %`} accent />
              </Section>
              <Section title="Sub Totals">
                <ReadonlyField label="Total Cost" value={fmt(baseCost, currency)} />
                <ReadonlyField label="Total Markup" value={fmt(markupAmt, currency)} />
                <ReadonlyField label="Total Price" value={fmt(totalPrice, currency)} accent />
                <Field label="Total Discount"><Input type="number" step="any" value={d.discount ?? 0} onChange={(e) => set("discount", parseFloat(e.target.value) || 0)} /></Field>
                <ReadonlyField label="Sub Total" value={fmt(subTotal, currency)} />
              </Section>
              <Section title="Tax Details">
                <Field label="VAT Rate %"><Input type="number" step="any" value={d.vat_rate ?? 0} onChange={(e) => set("vat_rate", parseFloat(e.target.value) || 0)} /></Field>
                <ReadonlyField label="VAT" value={fmt(vat, currency)} />
                <ReadonlyField label="Grand Total" value={fmt(grand, currency)} highlight />
              </Section>
            </div>

            {/* Column 3 — Financial terms / Comparison / Attributes / Tasks */}
            <div className="space-y-6">
              <Section title="Financial Terms">
                <Field label="Cost Category"><Input value={d.cost_category ?? ""} onChange={(e) => set("cost_category", e.target.value)} placeholder="1000 - Civils" /></Field>
                <Field label="Cost Code"><Input value={d.cost_code ?? ""} onChange={(e) => set("cost_code", e.target.value)} placeholder="1100 - Trench" /></Field>
                <Field label="Charge Out Rate Used">
                  <Select value={d.charge_out_rate_used ?? "BOQ Item Rate"} onValueChange={(v) => set("charge_out_rate_used", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["BOQ Item Rate","Resource Rate","Custom"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Conversion Type">
                  <Select value={d.conversion_type ?? "Show on Convert"} onValueChange={(v) => set("conversion_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["Show on Convert","Hide on Convert","Merge on Convert"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <CheckboxRow d={d} k="show_image_in_proposal" label="Show Image in Proposal" set={set} />
                <Field label="Solution Link"><Input value={d.solution_link ?? ""} onChange={(e) => set("solution_link", e.target.value)} /></Field>
                <Field label="Image Link"><Input value={d.image_link ?? ""} onChange={(e) => set("image_link", e.target.value)} /></Field>
              </Section>
              <Section title="Compare Estimate Grouping">
                <Field label="Compare List"><Input value={d.compare_list ?? ""} onChange={(e) => set("compare_list", e.target.value)} /></Field>
                <Field label="Compare Title"><Input value={d.compare_title ?? ""} onChange={(e) => set("compare_title", e.target.value)} /></Field>
              </Section>
              <Section title="BOQ Item Attributes">
                <Field label="Stage"><Input value={d.stage ?? ""} onChange={(e) => set("stage", e.target.value)} placeholder="Civils" /></Field>
                <Field label="Group"><Input value={d.attribute_group ?? ""} onChange={(e) => set("attribute_group", e.target.value)} placeholder="Trench Excavation" /></Field>
              </Section>
              <Section title="Project Task Details">
                <Field label="Project Sync Type">
                  <Select value={d.project_sync_type ?? "None"} onValueChange={(v) => set("project_sync_type", v === "None" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="-None-" /></SelectTrigger>
                    <SelectContent>{["None","Sync as Task","Sync as Milestone"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Project Task Name"><Input value={d.project_task_name ?? ""} onChange={(e) => set("project_task_name", e.target.value)} /></Field>
                <Field label="Project Description"><Textarea rows={2} value={d.project_description ?? ""} onChange={(e) => set("project_description", e.target.value)} /></Field>
                <Field label="Milestone for Initial Sync"><Input value={d.milestone_for_sync ?? ""} onChange={(e) => set("milestone_for_sync", e.target.value)} /></Field>
                <Field label="Project Stage"><Input value={d.project_stage ?? ""} onChange={(e) => set("project_stage", e.target.value)} /></Field>
                <CheckboxRow d={d} k="include_in_create_task" label="Include in Create Task Widget" set={set} />
              </Section>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4 bg-muted/20">
          <div className="mr-auto text-sm text-muted-foreground">
            Live: <span className="font-heading text-foreground tabular-nums">{fmt(subTotal, currency)}</span>
            <span className="mx-2">·</span>
            Grand: <span className="font-heading text-primary tabular-nums">{fmt(grand, currency)}</span>
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : lineId ? "Update" : "Add line"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider px-3 py-2 border-b">{title}</div>
      <div className="p-3 space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div>{children}</div>
    </div>
  );
}
function ReadonlyField({ label, value, accent, highlight }: { label: string; value: string; accent?: boolean; highlight?: boolean }) {
  return (
    <div className={`grid grid-cols-[130px_1fr] items-center gap-2 py-1 px-2 rounded ${highlight ? "bg-primary/10" : accent ? "bg-amber-500/10" : "bg-muted/30"}`}>
      <div className={`text-xs ${accent ? "text-amber-700 font-semibold" : highlight ? "text-primary font-semibold" : "text-muted-foreground"}`}>{label}</div>
      <div className="text-sm font-heading tabular-nums text-right pr-2">{value}</div>
    </div>
  );
}
function CheckboxRow({ d, k, label, set }: { d: Draft; k: string; label: string; set: (k: string, v: any) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={!!d[k]} onCheckedChange={(v) => set(k, !!v)} />
      {label}
    </label>
  );
}