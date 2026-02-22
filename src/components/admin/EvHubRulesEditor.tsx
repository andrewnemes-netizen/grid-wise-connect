/**
 * Admin UI: EV Hub Rule Set Editor
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Save, Loader2, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const DNO_OPTIONS = ["UK_ALL", "UKPN", "NPG", "ENWL", "NGED", "SPEN", "SSEN"];

interface RuleFieldEditor {
  key: string;
  label: string;
  type: "number" | "text" | "json" | "boolean";
  group: string;
}

const RULE_FIELDS: RuleFieldEditor[] = [
  { key: "lv_max_demand_kva", label: "LV Max Demand (kVA)", type: "number", group: "Electrical" },
  { key: "service_cable_default", label: "Service Cable Default", type: "text", group: "Electrical" },
  { key: "lv_main_cables", label: "LV Main Cables", type: "json", group: "Electrical" },
  { key: "protection_grading", label: "Protection Grading", type: "json", group: "Electrical" },
  { key: "cover_depths_mm", label: "Cover Depths (mm)", type: "json", group: "Civils" },
  { key: "traffic_management_rules", label: "Traffic Management Rules", type: "json", group: "Civils" },
  { key: "extraneous_distance_threshold_m", label: "Extraneous Distance Threshold (m)", type: "number", group: "Earthing" },
  { key: "headroom_factor", label: "Headroom Factor", type: "number", group: "Reinforcement" },
  { key: "fault_level_thresholds", label: "Fault Level Thresholds", type: "json", group: "Reinforcement" },
  { key: "transformer_loading_thresholds", label: "Transformer Loading Thresholds", type: "json", group: "Reinforcement" },
  { key: "reinforcement_mitigation_sequence", label: "Mitigation Sequence", type: "json", group: "Reinforcement" },
  { key: "cable_scoring_weights", label: "Cable Scoring Weights", type: "json", group: "Cable Selection" },
];

export function EvHubRulesEditor() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDno, setSelectedDno] = useState("UK_ALL");
  const [editingRules, setEditingRules] = useState<Record<string, any>>({});
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});

  const { data: rulesets = [], isLoading } = useQuery({
    queryKey: ["ev-hub-rulesets"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ev_hub_rulesets")
        .select("*")
        .eq("is_active", true)
        .order("dno_key");
      if (error) throw error;
      return data as any[];
    },
  });

  const currentRuleset = rulesets.find((r: any) => r.dno_key === selectedDno);

  useEffect(() => {
    if (currentRuleset) {
      setEditingRules(currentRuleset.rules_json || {});
      setJsonErrors({});
    } else {
      setEditingRules({});
    }
  }, [currentRuleset?.id, selectedDno]);

  const saveMutation = useMutation({
    mutationFn: async (rulesJson: Record<string, any>) => {
      if (currentRuleset) {
        const { error } = await (supabase as any)
          .from("ev_hub_rulesets")
          .update({ rules_json: rulesJson, updated_at: new Date().toISOString() })
          .eq("id", currentRuleset.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("ev_hub_rulesets")
          .insert({
            dno_key: selectedDno,
            rule_set_id: "DNO_EV_HUB_V1",
            version: "v1",
            is_active: true,
            rules_json: rulesJson,
            created_by: user?.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ev-hub-rulesets"] });
      toast.success("EV Hub rules saved");
    },
    onError: (err: any) => {
      toast.error(`Save failed: ${err.message}`);
    },
  });

  const updateField = (key: string, subField: string, value: any) => {
    setEditingRules((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [subField]: value,
      },
    }));
  };

  const handleJsonChange = (key: string, raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      updateField(key, "value", parsed);
      setJsonErrors((prev) => ({ ...prev, [key]: "" }));
    } catch {
      setJsonErrors((prev) => ({ ...prev, [key]: "Invalid JSON" }));
    }
  };

  const handleSave = () => {
    if (Object.values(jsonErrors).some((e) => e)) {
      toast.error("Fix JSON errors before saving");
      return;
    }
    saveMutation.mutate(editingRules);
  };

  const groups = RULE_FIELDS.reduce<Record<string, RuleFieldEditor[]>>((acc, f) => {
    if (!acc[f.group]) acc[f.group] = [];
    acc[f.group].push(f);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading EV Hub rules…
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">EV Hub Rule Sets</CardTitle>
        <CardDescription>
          Edit DNO-specific engineering rules for EV hub feasibility. All thresholds are rule-driven — no hard-coded values.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* DNO selector */}
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium">DNO:</Label>
          <Select value={selectedDno} onValueChange={setSelectedDno}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DNO_OPTIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d === "UK_ALL" ? "UK Baseline (All DNOs)" : d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!currentRuleset && (
            <Badge variant="outline" className="text-xs">
              <Plus className="h-3 w-3 mr-1" />New ruleset will be created
            </Badge>
          )}
          {currentRuleset && (
            <Badge variant="secondary" className="text-xs">v{currentRuleset.version}</Badge>
          )}
        </div>

        {/* Rule fields by group */}
        {Object.entries(groups).map(([group, fields]) => (
          <div key={group} className="space-y-3">
            <Badge variant="secondary" className="text-[10px]">{group}</Badge>
            <div className="grid grid-cols-1 gap-3">
              {fields.map((f) => {
                const field = editingRules[f.key] || { value: null, confidence: "LOW", source: "", pending: true };
                return (
                  <div key={f.key} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">{f.label}</Label>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={field.confidence === "HIGH" ? "default" : field.confidence === "MEDIUM" ? "secondary" : "outline"}
                          className="text-[9px]"
                        >
                          {field.confidence || "LOW"}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-muted-foreground">Pending</Label>
                          <Switch
                            checked={field.pending ?? true}
                            onCheckedChange={(v) => updateField(f.key, "pending", v)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Value editor */}
                    {f.type === "number" && (
                      <Input
                        type="number"
                        step="any"
                        value={field.value ?? ""}
                        onChange={(e) => updateField(f.key, "value", e.target.value ? Number(e.target.value) : null)}
                        className="h-8 text-sm"
                      />
                    )}
                    {f.type === "text" && (
                      <Input
                        type="text"
                        value={field.value ?? ""}
                        onChange={(e) => updateField(f.key, "value", e.target.value || null)}
                        className="h-8 text-sm"
                      />
                    )}
                    {f.type === "json" && (
                      <div>
                        <Textarea
                          className="text-xs font-mono min-h-[60px]"
                          defaultValue={field.value != null ? JSON.stringify(field.value, null, 2) : ""}
                          onChange={(e) => handleJsonChange(f.key, e.target.value)}
                        />
                        {jsonErrors[f.key] && (
                          <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />{jsonErrors[f.key]}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Confidence & source */}
                    <div className="flex gap-2">
                      <Select
                        value={field.confidence || "LOW"}
                        onValueChange={(v) => updateField(f.key, "confidence", v)}
                      >
                        <SelectTrigger className="h-7 text-[10px] w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HIGH">HIGH</SelectItem>
                          <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                          <SelectItem value="LOW">LOW</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Source"
                        value={field.source || ""}
                        onChange={(e) => updateField(f.key, "source", e.target.value)}
                        className="h-7 text-[10px] flex-1"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Save */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Rules
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
