import { useMemo, useState } from "react";
import { Zap, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, XCircle, Cable, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { OptimiserResult, OptimiserSolution } from "@/lib/lvOptimiser";

function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(amount);
}

interface OptimiserResultPanelProps {
  result: OptimiserResult;
}

function SolutionCard({ solution, isSelected }: { solution: OptimiserSolution; isSelected: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const mainsEdge = solution.network_edges.find((e) => e.section === "mains");
  const serviceEdge = solution.network_edges.find((e) => e.section === "service");

  const hardFlags = solution.constraint_flags.filter(
    (f) => !f.includes("WARN")
  );
  const warnFlags = solution.constraint_flags.filter(
    (f) => f.includes("WARN")
  );

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${isSelected ? "border-primary bg-primary/5" : "bg-muted/20"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isSelected && <Badge className="text-[9px] bg-primary text-primary-foreground">Selected</Badge>}
          <Badge variant="outline" className="text-[9px]">Rank #{solution.rank}</Badge>
          {solution.passes_all ? (
            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-red-600" />
          )}
        </div>
        <span className="text-sm font-bold">{formatGBP(solution.cost.total_installed_cost)}</span>
      </div>

      {/* Cable selections */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded border bg-background px-2 py-1.5">
          <p className="text-muted-foreground uppercase tracking-wider mb-0.5">Mains</p>
          <p className="font-medium">{mainsEdge?.cable_type}</p>
          <p className="text-muted-foreground">{mainsEdge?.length_m}m</p>
        </div>
        <div className="rounded border bg-background px-2 py-1.5">
          <p className="text-muted-foreground uppercase tracking-wider mb-0.5">Service</p>
          <p className="font-medium">{serviceEdge?.cable_type}</p>
          <p className="text-muted-foreground">{serviceEdge?.length_m}m</p>
        </div>
      </div>

      {/* Key electrical figures */}
      <div className="flex gap-3 text-[10px]">
        <span className="text-muted-foreground">VD: <span className={`font-medium ${solution.electrical.total_vd_pct > 5 ? "text-red-600" : "text-foreground"}`}>{solution.electrical.total_vd_pct}%</span></span>
        <span className="text-muted-foreground">Ib: <span className="font-medium">{solution.electrical.design_current_a}A</span></span>
        <span className="text-muted-foreground">Util: <span className={`font-medium ${solution.electrical.mains_utilisation_pct > 80 ? "text-amber-600" : "text-foreground"}`}>{solution.electrical.mains_utilisation_pct}%</span></span>
        {solution.electrical.zs_pass !== null && (
          <span className="text-muted-foreground">Zs: <span className={`font-medium ${solution.electrical.zs_pass ? "text-emerald-600" : "text-red-600"}`}>{solution.electrical.zs_pass ? "Pass" : "Fail"}</span></span>
        )}
      </div>

      {/* Flags */}
      {hardFlags.length > 0 && (
        <div className="space-y-0.5">
          {hardFlags.map((f, i) => (
            <div key={i} className="flex items-start gap-1 text-[9px] text-red-600">
              <XCircle className="h-3 w-3 mt-0.5 shrink-0" />{f}
            </div>
          ))}
        </div>
      )}
      {warnFlags.length > 0 && (
        <div className="space-y-0.5">
          {warnFlags.map((f, i) => (
            <div key={i} className="flex items-start gap-1 text-[9px] text-amber-600">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{f}
            </div>
          ))}
        </div>
      )}

      {/* Expandable cost detail */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-[10px] h-6"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
        Cost Breakdown
      </Button>

      {expanded && (
        <div className="space-y-0.5 text-[10px]">
          <div className="flex justify-between"><span className="text-muted-foreground">Cable</span><span>{formatGBP(solution.cost.cable_cost)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Duct</span><span>{formatGBP(solution.cost.duct_cost)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Excavation</span><span>{formatGBP(solution.cost.excavation_cost)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Jointing</span><span>{formatGBP(solution.cost.jointing_cost)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Commercial uplift</span><span>{formatGBP(solution.cost.commercial_uplift)}</span></div>
          <Separator />
          <div className="flex justify-between font-semibold"><span>Total</span><span>{formatGBP(solution.cost.total_installed_cost)}</span></div>
        </div>
      )}
    </div>
  );
}

export function OptimiserResultPanel({ result }: OptimiserResultPanelProps) {
  const [showAlts, setShowAlts] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">LV Optimiser Result</p>
      </div>

      {/* Status */}
      <div className={`rounded-lg border p-3 ${result.status === "OK" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
        <div className="flex items-center gap-2">
          {result.status === "OK" ? (
            <CheckCircle className="h-5 w-5 text-emerald-600" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600" />
          )}
          <div>
            <p className={`text-sm font-bold ${result.status === "OK" ? "text-emerald-700" : "text-red-700"}`}>
              {result.status === "OK" ? "Passing Solution Found" : "No Passing Solution"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {result.meta.candidates_evaluated} candidates evaluated · {result.meta.route_length_m}m route · {result.meta.proposed_kw}kW
            </p>
          </div>
        </div>
      </div>

      {/* Constraint failures (if no solution) */}
      {result.status === "NO_PASSING_SOLUTION" && result.constraint_failures.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase">Constraint Failures</p>
          {result.constraint_failures.map((f, i) => (
            <div key={i} className="flex items-start gap-1 text-[10px] text-red-600">
              <XCircle className="h-3 w-3 mt-0.5 shrink-0" />{f}
            </div>
          ))}
        </div>
      )}

      {/* Selected solution */}
      {result.selected && (
        <SolutionCard solution={result.selected} isSelected />
      )}

      {/* Alternatives */}
      {result.alternatives.length > 0 && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-7"
            onClick={() => setShowAlts(!showAlts)}
          >
            <Cable className="mr-1.5 h-3 w-3" />
            {showAlts ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
            {result.alternatives.length} Alternative{result.alternatives.length !== 1 ? "s" : ""}
          </Button>
          {showAlts && (
            <div className="space-y-2">
              {result.alternatives.map((alt) => (
                <SolutionCard key={alt.rank} solution={alt} isSelected={false} />
              ))}
            </div>
          )}
        </>
      )}

      <p className="text-[9px] text-muted-foreground italic">
        Split: {result.meta.route_length_m - result.meta.service_length_cap_m}m mains + {result.meta.service_length_cap_m}m service (cap). Cost minimisation from catalogue.
      </p>
    </div>
  );
}
