import { useState } from "react";
import { X, Activity, AlertTriangle, CheckCircle, XCircle, Lightbulb, Zap, Cable, Loader2, ChevronDown, ChevronRight, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { runDesignAnalysis, type DesignAnalysisResult, type DesignAnalysisInput, type CableSpec, type DnoRuleOverrides } from "@/lib/designAnalysis";
import type { DesignCable, DesignElement } from "@/hooks/useDesignMode";

interface DesignAnalysisPanelProps {
  studyId: string;
  studyName: string;
  proposedKw: number;
  cables: DesignCable[];
  elements: DesignElement[];
  dnoCode?: string | null;
  onClose: () => void;
  onHighlightCable?: (cableId: string, status: "pass" | "warning" | "fail") => void;
}

const statusIcon = {
  pass: <CheckCircle className="h-3.5 w-3.5 text-green-600" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
  fail: <XCircle className="h-3.5 w-3.5 text-red-500" />,
};

const statusBadgeClass = {
  pass: "bg-green-100 text-green-800 border-green-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  fail: "bg-red-100 text-red-800 border-red-200",
};

export function DesignAnalysisPanel({
  studyId,
  studyName,
  proposedKw,
  cables,
  elements,
  dnoCode,
  onClose,
  onHighlightCable,
}: DesignAnalysisPanelProps) {
  const [result, setResult] = useState<DesignAnalysisResult | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedCables, setExpandedCables] = useState<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [upstreamMode, setUpstreamMode] = useState<"auto" | "manual">("auto");
  const [upstreamVdPct, setUpstreamVdPct] = useState<string>("");
  const [upstreamZsOhms, setUpstreamZsOhms] = useState<string>("");
  const [supplyCapacity, setSupplyCapacity] = useState<string>("60");

  const toggleCable = (id: string) => {
    setExpandedCables(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleNode = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runAnalysis = async () => {
    if (cables.length === 0) {
      toast.error("No cables to analyse. Draw cables in Design Mode first.");
      return;
    }

    setRunning(true);
    try {
      // Fetch cable catalogue and DNO ruleset in parallel
      const [catalogueRes, rulesetRes] = await Promise.all([
        supabase.from("cable_catalogue").select("*").eq("is_default", true),
        dnoCode
          ? supabase
              .from("dno_rulesets")
              .select("*")
              .eq("dno_code", dnoCode)
              .eq("is_active", true)
              .order("version", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      // If no DNO-specific ruleset, try UK_ALL baseline
      let ruleset = rulesetRes.data;
      if (!ruleset && dnoCode) {
        const { data: baseline } = await supabase
          .from("dno_rulesets")
          .select("*")
          .eq("dno_code", "UK_ALL")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        ruleset = baseline;
      }

      // Build DNO rule overrides from ruleset
      let dnoRules: DnoRuleOverrides | undefined;
      if (ruleset) {
        const rj = ruleset.rules_json as Record<string, any>;
        dnoRules = {
          dno_code: ruleset.dno_code,
          ruleset_version: ruleset.version,
          vd_limit_pct: rj.vd_limit_pct,
          vd_limits: rj.vd_limits,
          ze_ohms: rj.ze_ohms,
          zs_thresholds: rj.zs_thresholds,
          zs_limit_ohms: rj.zs_limit_ohms,
          pfc_ranges: rj.pfc_ranges,
          earthing_system: rj.earthing_system,
          max_service_length_m: rj.max_service_length_m,
          joint_spacing_m: rj.joint_spacing_m?.LV ?? rj.joint_spacing_m,
          service_length_cap_m: rj.service_length_cap_m,
          cover_depths_mm: rj.cover_depths_mm,
        };
        toast.info(`Loaded ${ruleset.dno_code} G81 ruleset (${ruleset.version})`);
      } else if (dnoCode) {
        toast.warning(`No G81 ruleset found for ${dnoCode} — using G81 defaults`);
      }

      const cableSpecs: Record<string, CableSpec> = {};
      if (catalogueRes.data) {
        for (const cat of catalogueRes.data) {
          const key = cat.voltage_class === "LV" && cat.mains_allowed ? "lv_main"
            : cat.voltage_class === "LV" && cat.service_allowed ? "lv_service"
            : cat.voltage_class === "HV" ? "hv_cable"
            : null;
          if (key) {
            cableSpecs[key] = {
              impedance_per_km: cat.impedance_per_km,
              current_rating_a: cat.current_rating_a,
              cost_per_m: cat.cost_per_m,
              diameter_mm: cat.diameter_mm,
              cable_type: cat.cable_type,
              voltage_class: cat.voltage_class,
            };
          }
        }
      }

      // Build upstream conditions
      const hasManualUpstream = upstreamMode === "manual" && (upstreamVdPct || upstreamZsOhms);
      const upstream = hasManualUpstream ? {
        existing_vd_pct: parseFloat(upstreamVdPct) || 0,
        existing_zs_ohms: parseFloat(upstreamZsOhms) || 0.35,
        source: "manual" as const,
      } : undefined;

      const input: DesignAnalysisInput = {
        cables,
        elements,
        proposed_kw: proposedKw,
        supply_capacity_a: parseInt(supplyCapacity) || 100,
        cable_specs: cableSpecs,
        dno_rules: dnoRules,
        upstream,
      };

      const analysisResult = runDesignAnalysis(input);
      setResult(analysisResult);

      // Highlight cables on map
      analysisResult.cables.forEach(c => {
        onHighlightCable?.(c.cable_id, c.status);
      });

      toast.success("Analysis complete");
    } catch (err: any) {
      toast.error(`Analysis failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const saveResults = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("studies")
        .update({
          engine_output_json: {
            ...(await supabase.from("studies").select("engine_output_json").eq("id", studyId).single()).data?.engine_output_json as any,
            design_analysis: result,
          } as any,
        })
        .eq("id", studyId);

      if (error) throw error;
      toast.success("Results saved to study");
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute top-2 right-14 z-30 w-[380px] max-h-[calc(100vh-100px)] bg-background/95 backdrop-blur-sm border rounded-lg shadow-xl flex flex-col pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Analyse Design</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 overflow-auto">
        <div className="px-4 py-3 space-y-4">
          {/* Study info */}
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Study</span>
              <span className="font-medium">{studyName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Load</span>
              <span className="font-medium">{proposedKw} kW</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cables</span>
              <span>{cables.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Equipment</span>
              <span>{elements.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">DNO Ruleset</span>
              <span className="font-medium">{dnoCode || "Generic"}</span>
            </div>
          </div>

          {/* Upstream POC Conditions */}
          {!result && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <PlugZap className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold">Point of Connection</span>
              </div>

              {/* Supply capacity */}
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Supply Capacity — 3-Phase (determines Zs limit)</label>
                <div className="flex gap-1">
                  {["60", "80", "100"].map(cap => (
                    <Button
                      key={cap}
                      variant={supplyCapacity === cap ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-[10px] flex-1"
                      onClick={() => setSupplyCapacity(cap)}
                    >
                      {cap}A
                    </Button>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  Zs limit: {supplyCapacity === "100" ? "0.10" : supplyCapacity === "80" ? "0.20" : "0.35"}Ω (TT/PME)
                </p>
              </div>

              <Separator />

              {/* Auto/Manual POC */}
              <div className="flex gap-1">
                <Button
                  variant={upstreamMode === "auto" ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] flex-1"
                  onClick={() => setUpstreamMode("auto")}
                >
                  Auto (Ze only)
                </Button>
                <Button
                  variant={upstreamMode === "manual" ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] flex-1"
                  onClick={() => setUpstreamMode("manual")}
                >
                  Manual (DNO values)
                </Button>
              </div>
              {upstreamMode === "manual" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Existing VD at joint (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={upstreamVdPct}
                      onChange={e => setUpstreamVdPct(e.target.value)}
                      placeholder="e.g. 1.2"
                      className="w-full h-7 px-2 text-xs border rounded bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Zs at joint (Ω)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      max="5"
                      value={upstreamZsOhms}
                      onChange={e => setUpstreamZsOhms(e.target.value)}
                      placeholder="e.g. 0.28"
                      className="w-full h-7 px-2 text-xs border rounded bg-background"
                    />
                  </div>
                  <p className="col-span-2 text-[9px] text-muted-foreground">
                    Enter values from DNO connection offer at the joint/POC.
                  </p>
                </div>
              )}
              {upstreamMode === "auto" && (
                <p className="text-[9px] text-muted-foreground">
                  Starts from Ze (PME 0.35Ω default). Use Manual to enter known DNO values.
                </p>
              )}
            </div>
          )}

          {!result ? (
            <Button className="w-full" onClick={runAnalysis} disabled={running}>
              {running ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running analysis…</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" />Run Electrical Analysis</>
              )}
            </Button>
          ) : (
            <>
              {/* Summary */}
               <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Overall Result</span>
                  <Badge variant="outline" className={result.summary.overall_pass ? statusBadgeClass.pass : statusBadgeClass.fail}>
                    {result.summary.overall_pass ? "PASS" : "FAIL"}
                  </Badge>
                </div>

                {/* Segmented VD breakdown — G81 */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Voltage Drop (G81)</span>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    <div className="rounded bg-muted/30 px-2 py-1">
                      <span className="text-[10px] text-muted-foreground block">Mains</span>
                      <div className="flex items-center gap-1">
                        {result.summary.mains_vd_pass ? statusIcon.pass : statusIcon.fail}
                        <span className="font-semibold">{result.summary.mains_vd_pct}%</span>
                        <span className="text-muted-foreground text-[9px]">/ 3%</span>
                      </div>
                    </div>
                    <div className="rounded bg-muted/30 px-2 py-1">
                      <span className="text-[10px] text-muted-foreground block">Service</span>
                      <div className="flex items-center gap-1">
                        {result.summary.service_vd_pass ? statusIcon.pass : statusIcon.fail}
                        <span className="font-semibold">{result.summary.service_vd_pct}%</span>
                        <span className="text-muted-foreground text-[9px]">/ 2%</span>
                      </div>
                    </div>
                    <div className="rounded bg-muted/30 px-2 py-1">
                      <span className="text-[10px] text-muted-foreground block">Total</span>
                      <div className="flex items-center gap-1">
                        {result.summary.total_vd_pass ? statusIcon.pass : statusIcon.fail}
                        <span className="font-semibold">{result.summary.total_vd_pct}%</span>
                        <span className="text-muted-foreground text-[9px]">/ 5%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-muted/30 px-2 py-1.5">
                    <span className="text-muted-foreground">Max Utilisation</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      {result.summary.max_utilisation_pct <= 80 ? statusIcon.pass : result.summary.max_utilisation_pct <= 100 ? statusIcon.warning : statusIcon.fail}
                      <span className="font-semibold">{result.summary.max_utilisation_pct}%</span>
                    </div>
                  </div>
                  <div className="rounded bg-muted/30 px-2 py-1.5">
                    <span className="text-muted-foreground">Zs Limit ({result.summary.supply_capacity_a}A)</span>
                    <span className="block font-semibold mt-0.5">{result.summary.zs_limit_applied}Ω</span>
                  </div>
                  <div className="rounded bg-muted/30 px-2 py-1.5">
                    <span className="text-muted-foreground">ESQCR Voltage</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      {result.summary.esqcr_pass ? statusIcon.pass : statusIcon.fail}
                      <span className="font-semibold">{result.summary.min_delivered_v}V</span>
                      <span className="text-muted-foreground text-[9px]">≥216V</span>
                    </div>
                  </div>
                  <div className="rounded bg-muted/30 px-2 py-1.5">
                    <span className="text-muted-foreground">PFC Range</span>
                    <span className="block font-semibold mt-0.5">
                      {result.summary.min_pfc_a > 0
                        ? `${(result.summary.min_pfc_a/1000).toFixed(1)}–${(result.summary.max_pfc_a/1000).toFixed(1)} kA`
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Limiting factor */}
                {result.summary.limiting_factor !== "none" && (
                  <div className="rounded border border-dashed px-2 py-1 text-[10px] flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span>Limiting factor: <strong className="capitalize">{
                      result.summary.limiting_factor === "vd" ? "Voltage Drop"
                      : result.summary.limiting_factor === "zs" ? "Earth Loop Impedance (Zs)"
                      : "Thermal Rating"
                    }</strong></span>
                  </div>
                )}

                {/* Upstream POC info */}
                {result.summary.upstream_source === "manual" && (
                  <div className="rounded bg-muted/20 border border-dashed px-2 py-1.5 text-[10px] space-y-0.5">
                    <span className="font-medium flex items-center gap-1"><PlugZap className="h-3 w-3" />POC Conditions (manual)</span>
                    <div className="flex gap-4">
                      <span>Upstream VD: <strong>{result.summary.upstream_vd_pct}%</strong></span>
                      <span>Upstream Zs: <strong>{result.summary.upstream_zs_ohms}Ω</strong></span>
                    </div>
                  </div>
                )}

                {/* Earthing & audit */}
                <div className="text-[9px] text-muted-foreground flex gap-3">
                  <span>Earthing: {result.summary.earthing_system}</span>
                  <span>Length: {result.summary.total_length_m}m</span>
                  {result.summary.dno_code && <span>{result.summary.dno_code} {result.summary.ruleset_version}</span>}
                </div>

                {/* Issue counts */}
                <div className="flex gap-3 text-xs">
                  {result.summary.error_count > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <XCircle className="h-3 w-3" />{result.summary.error_count} error{result.summary.error_count !== 1 ? "s" : ""}
                    </span>
                  )}
                  {result.summary.warning_count > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-3 w-3" />{result.summary.warning_count} warning{result.summary.warning_count !== 1 ? "s" : ""}
                    </span>
                  )}
                  {result.summary.suggestion_count > 0 && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <Lightbulb className="h-3 w-3" />{result.summary.suggestion_count} fix{result.summary.suggestion_count !== 1 ? "es" : ""}
                    </span>
                  )}
                </div>
              </div>

              <Separator />

              {/* Cable Results */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Cable className="h-3 w-3" /> Cable Analysis
                </p>
                {result.cables.map((cable) => (
                  <div key={cable.cable_id} className="rounded border text-xs">
                    <button
                      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/30 transition-colors"
                      onClick={() => toggleCable(cable.cable_id)}
                    >
                      {statusIcon[cable.status]}
                      <span className="flex-1 text-left font-medium truncate">{cable.cable_label}</span>
                      <span className="text-muted-foreground">{cable.length_m}m</span>
                      <Badge variant="outline" className={`text-[9px] ${statusBadgeClass[cable.status]}`}>
                        VD {cable.vd_pct}%
                      </Badge>
                      {expandedCables.has(cable.cable_id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>

                    {expandedCables.has(cable.cable_id) && (
                      <div className="px-2 pb-2 space-y-1.5 border-t bg-muted/10">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1.5">
                          <span className="text-muted-foreground">Cable Size</span>
                          <span className="font-medium">{cable.cable_size}</span>
                          <span className="text-muted-foreground">Voltage Drop</span>
                          <span className={cable.vd_pass ? "" : "text-destructive font-medium"}>{cable.vd_volts}V ({cable.vd_pct}%)</span>
                          <span className="text-muted-foreground">Design Current</span>
                          <span>{cable.design_current_a}A</span>
                          <span className="text-muted-foreground">Cable Rating</span>
                          <span>{cable.cable_rating_a}A</span>
                          <span className="text-muted-foreground">Utilisation</span>
                          <span>
                            <Progress value={Math.min(cable.utilisation_pct, 100)} className="h-1.5 w-16 inline-block mr-1" />
                            {cable.utilisation_pct}%
                          </span>
                          <span className="text-muted-foreground">Impedance</span>
                          <span>{cable.impedance_ohms}Ω</span>
                        </div>

                        {cable.flags.length > 0 && (
                          <div className="space-y-0.5">
                            {cable.flags.map((f, i) => (
                              <div key={i} className={`flex items-start gap-1 text-[10px] ${f.severity === "error" ? "text-red-600" : f.severity === "warning" ? "text-amber-600" : "text-muted-foreground"}`}>
                                {f.severity === "error" ? <XCircle className="h-3 w-3 mt-0.5 shrink-0" /> : f.severity === "warning" ? <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> : <CheckCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                {f.message}
                              </div>
                            ))}
                          </div>
                        )}

                        {cable.suggestions.length > 0 && (
                          <div className="space-y-0.5">
                            {cable.suggestions.map((s, i) => (
                              <div key={i} className="flex items-start gap-1 text-[10px] text-blue-600">
                                <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
                                {s}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Node Results */}
              {result.nodes.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Node Analysis
                    </p>
                    {result.nodes.map((node) => {
                      const nodeStatus = node.flags.some(f => f.severity === "error") ? "fail"
                        : node.flags.some(f => f.severity === "warning") ? "warning" : "pass";
                      return (
                        <div key={node.element_id} className="rounded border text-xs">
                          <button
                            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/30 transition-colors"
                            onClick={() => toggleNode(node.element_id)}
                          >
                            {statusIcon[nodeStatus]}
                            <span className="flex-1 text-left font-medium truncate capitalize">{node.label}</span>
                            <span className="text-muted-foreground">{node.pfc_amps.toLocaleString()}A PFC</span>
                            {expandedNodes.has(node.element_id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>

                          {expandedNodes.has(node.element_id) && (
                            <div className="px-2 pb-2 space-y-1 border-t bg-muted/10 pt-1.5">
                              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                                <span className="text-muted-foreground">Zs</span>
                                <span className={node.zs_pass === false ? "text-destructive font-medium" : ""}>{node.zs_ohms}Ω <span className="text-muted-foreground text-[9px]">(limit {node.zs_limit_ohms}Ω)</span></span>
                                <span className="text-muted-foreground">PFC</span>
                                <span className={node.pfc_in_range ? "" : "text-amber-600 font-medium"}>
                                  {(node.pfc_amps/1000).toFixed(1)}kA
                                  <span className="text-muted-foreground text-[9px]"> ({(node.pfc_expected_min/1000).toFixed(0)}–{(node.pfc_expected_max/1000).toFixed(0)}kA)</span>
                                </span>
                                <span className="text-muted-foreground">Delivered Voltage</span>
                                <span className={node.esqcr_pass ? "" : "text-destructive font-medium"}>
                                  {node.delivered_voltage_v}V
                                  <span className="text-muted-foreground text-[9px]"> (ESQCR 216–253V)</span>
                                </span>
                                <span className="text-muted-foreground">Earthing</span>
                                <span>{node.earthing_ok ? "✓ OK" : "⚠ Review"}</span>
                              </div>
                              {node.flags.map((f, i) => (
                                <div key={i} className={`flex items-start gap-1 text-[10px] ${f.severity === "error" ? "text-destructive" : f.severity === "warning" ? "text-amber-600" : "text-muted-foreground"}`}>
                                  {f.severity === "error" ? <XCircle className="h-3 w-3 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />}
                                  {f.message}
                                </div>
                              ))}
                              {node.suggestions.map((s, i) => (
                                <div key={i} className="flex items-start gap-1 text-[10px] text-blue-600">
                                  <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
                                  {s}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1 sticky bottom-0 bg-background/95 pb-1">
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={runAnalysis} disabled={running}>
                  Re-run
                </Button>
                <Button size="sm" className="flex-1 text-xs" onClick={saveResults} disabled={saving}>
                  {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                  Save to Study
                </Button>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
