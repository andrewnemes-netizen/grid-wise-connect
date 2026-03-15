import { useState } from "react";
import { X, Activity, AlertTriangle, CheckCircle, XCircle, Lightbulb, Zap, Cable, Loader2, ChevronDown, ChevronRight } from "lucide-react";
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
  onClose,
  onHighlightCable,
}: DesignAnalysisPanelProps) {
  const [result, setResult] = useState<DesignAnalysisResult | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedCables, setExpandedCables] = useState<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

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
      // Fetch cable catalogue for specs
      const { data: catalogue } = await supabase
        .from("cable_catalogue")
        .select("*")
        .eq("is_default", true);

      const cableSpecs: Record<string, CableSpec> = {};
      if (catalogue) {
        // Map catalogue entries to cable types
        for (const cat of catalogue) {
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

      const input: DesignAnalysisInput = {
        cables,
        elements,
        proposed_kw: proposedKw,
        cable_specs: cableSpecs,
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
          </div>

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
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-muted/30 px-2 py-1.5">
                    <span className="text-muted-foreground">Voltage Drop</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      {result.summary.total_vd_pass ? statusIcon.pass : statusIcon.fail}
                      <span className="font-semibold">{result.summary.total_vd_pct}%</span>
                      <span className="text-muted-foreground">/ 5%</span>
                    </div>
                  </div>
                  <div className="rounded bg-muted/30 px-2 py-1.5">
                    <span className="text-muted-foreground">Max Utilisation</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      {result.summary.max_utilisation_pct <= 80 ? statusIcon.pass : result.summary.max_utilisation_pct <= 100 ? statusIcon.warning : statusIcon.fail}
                      <span className="font-semibold">{result.summary.max_utilisation_pct}%</span>
                    </div>
                  </div>
                  <div className="rounded bg-muted/30 px-2 py-1.5">
                    <span className="text-muted-foreground">Total Length</span>
                    <span className="block font-semibold mt-0.5">{result.summary.total_length_m.toLocaleString()}m</span>
                  </div>
                  <div className="rounded bg-muted/30 px-2 py-1.5">
                    <span className="text-muted-foreground">PFC Range</span>
                    <span className="block font-semibold mt-0.5">
                      {result.summary.min_pfc_a > 0 ? `${result.summary.min_pfc_a.toLocaleString()}A` : "—"}
                    </span>
                  </div>
                </div>

                {/* Issue counts */}
                <div className="flex gap-3 text-xs">
                  {result.summary.error_count > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
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
                          <span className="text-muted-foreground">Voltage Drop</span>
                          <span className={cable.vd_pass ? "" : "text-red-600 font-medium"}>{cable.vd_volts}V ({cable.vd_pct}%)</span>
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
                                <span>{node.zs_ohms}Ω</span>
                                <span className="text-muted-foreground">PFC</span>
                                <span>{node.pfc_amps.toLocaleString()}A</span>
                                <span className="text-muted-foreground">Earthing</span>
                                <span>{node.earthing_ok ? "✓ OK" : "⚠ Review"}</span>
                              </div>
                              {node.flags.map((f, i) => (
                                <div key={i} className={`flex items-start gap-1 text-[10px] ${f.severity === "error" ? "text-red-600" : f.severity === "warning" ? "text-amber-600" : "text-muted-foreground"}`}>
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
