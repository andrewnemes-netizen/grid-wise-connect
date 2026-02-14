import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_UNIT_RATES, type UnitRates } from "@/lib/connectionCosts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, RotateCcw } from "lucide-react";

const RATE_FIELDS: { key: keyof UnitRates; label: string; unit: string; group: string }[] = [
  { key: "cable_lv_per_m", label: "LV cable", unit: "£/m", group: "Cable" },
  { key: "cable_hv_per_m", label: "HV cable", unit: "£/m", group: "Cable" },
  { key: "cable_ehv_per_m", label: "EHV cable", unit: "£/m", group: "Cable" },
  { key: "excavation_footway_per_m", label: "Footway", unit: "£/m", group: "Excavation" },
  { key: "excavation_carriageway_per_m", label: "Carriageway", unit: "£/m", group: "Excavation" },
  { key: "excavation_verge_per_m", label: "Verge", unit: "£/m", group: "Excavation" },
  { key: "jointing_each", label: "Cable joint", unit: "£/ea", group: "Equipment" },
  { key: "switchgear_ring_main", label: "Ring main unit", unit: "£", group: "Equipment" },
  { key: "switchgear_circuit_breaker", label: "Circuit breaker", unit: "£", group: "Equipment" },
  { key: "transformer_500kva", label: "500kVA transformer", unit: "£", group: "Transformer" },
  { key: "transformer_1000kva", label: "1000kVA transformer", unit: "£", group: "Transformer" },
  { key: "transformer_1500kva", label: "1500kVA transformer", unit: "£", group: "Transformer" },
  { key: "metering_ct", label: "CT metering", unit: "£", group: "Metering" },
  { key: "metering_wc", label: "Whole current meter", unit: "£", group: "Metering" },
  { key: "design_fee_pct", label: "Design fee", unit: "%", group: "Fees" },
  { key: "project_management_pct", label: "Project management", unit: "%", group: "Fees" },
  { key: "contingency_pct", label: "Contingency", unit: "%", group: "Fees" },
  { key: "reinforcement_per_kw_over_capacity", label: "Reinforcement", unit: "£/kW", group: "Reinforcement" },
];

export function UnitRatesSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: dbRow, isLoading } = useQuery({
    queryKey: ["admin-unit-rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("unit_rates").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const [rates, setRates] = useState<UnitRates>(DEFAULT_UNIT_RATES);

  useEffect(() => {
    if (dbRow) {
      const r: any = {};
      for (const f of RATE_FIELDS) {
        r[f.key] = Number((dbRow as any)[f.key]) ?? DEFAULT_UNIT_RATES[f.key];
      }
      setRates(r as UnitRates);
    }
  }, [dbRow]);

  const mutation = useMutation({
    mutationFn: async (newRates: UnitRates) => {
      const { error } = await supabase
        .from("unit_rates")
        .update({ ...newRates, updated_at: new Date().toISOString(), updated_by: user?.id } as any)
        .eq("id", dbRow?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unit-rates"] });
      queryClient.invalidateQueries({ queryKey: ["admin-unit-rates"] });
      toast({ title: "Unit rates saved" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleChange = (key: keyof UnitRates, value: string) => {
    setRates((prev) => ({ ...prev, [key]: Number(value) || 0 }));
  };

  const handleReset = () => setRates(DEFAULT_UNIT_RATES);

  const groups = RATE_FIELDS.reduce<Record<string, typeof RATE_FIELDS>>((acc, f) => {
    if (!acc[f.group]) acc[f.group] = [];
    acc[f.group].push(f);
    return acc;
  }, {});

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading rates…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Unit Rates</CardTitle>
        <CardDescription>Customise the rates used in connection cost estimates. Changes apply to all new assessments.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(groups).map(([group, fields]) => (
          <div key={group}>
            <Badge variant="secondary" className="mb-2 text-[10px]">{group}</Badge>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{f.label} <span className="text-[10px]">({f.unit})</span></Label>
                  <Input
                    type="number"
                    step={f.unit === "%" ? "0.01" : "1"}
                    value={rates[f.key]}
                    onChange={(e) => handleChange(f.key, e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <Button onClick={() => mutation.mutate(rates)} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Rates
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />Reset to Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
