import { useState } from "react";
import { Zap, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { VoltageComparisonResult, VoltageComparisonTier } from "@/lib/voltageComparison";

function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(amount);
}

interface VoltageComparisonPanelProps {
  result: VoltageComparisonResult;
}

function TierCard({ tier, isRecommended }: { tier: VoltageComparisonTier; isRecommended: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasPass = tier.passes_all;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${isRecommended ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-muted/20"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={tier.voltage === "LV" ? "secondary" : "default"} className="text-[10px]">
            {tier.voltage}
          </Badge>
          {isRecommended && (
            <Badge className="text-[9px] bg-primary text-primary-foreground gap-1">
              <Crown className="h-2.5 w-2.5" />Recommended
            </Badge>
          )}
          {hasPass ? (
            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-red-600" />
          )}
        </div>
        {tier.total_installed_cost !== null && (
          <span className="text-sm font-bold">{formatGBP(tier.total_installed_cost)}</span>
        )}
      </div>

      {/* Key details */}
      <div className="grid grid-cols-2 gap-1 text-[10px]">
        <span className="text-muted-foreground">Cable</span>
        <span className="font-medium text-right truncate">{tier.cable_type ?? "—"}</span>
        <span className="text-muted-foreground">Design Current</span>
        <span className="font-medium text-right">{tier.design_current_a?.toFixed(1) ?? "—"}A</span>
        <span className="text-muted-foreground">Voltage Drop</span>
        <span className={`font-medium text-right ${(tier.vd_pct ?? 0) > 5 ? "text-destructive" : ""}`}>
          {tier.vd_pct?.toFixed(2) ?? "—"}%
        </span>
        {tier.transformer_info && (
          <>
            <span className="text-muted-foreground">Transformer</span>
            <span className="font-medium text-right">{tier.transformer_info}</span>
          </>
        )}
      </div>

      {/* Flags */}
      {tier.constraint_flags.length > 0 && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-[10px] h-6"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
            {tier.constraint_flags.length} Flag{tier.constraint_flags.length !== 1 ? "s" : ""}
          </Button>
          {expanded && (
            <div className="space-y-0.5">
              {tier.constraint_flags.map((f, i) => {
                const isWarn = f.includes("WARN");
                return (
                  <div key={i} className={`text-[9px] flex items-start gap-1 ${isWarn ? "text-amber-600" : "text-destructive"}`}>
                    {isWarn ? <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                    {f}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {!hasPass && (
        <p className="text-[9px] text-destructive italic">No passing cable solution found</p>
      )}
    </div>
  );
}

export function VoltageComparisonPanel({ result }: VoltageComparisonPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voltage Comparison</p>
      </div>

      {/* Recommendation banner */}
      <div className={`rounded-lg border p-3 ${result.recommended ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}>
        <p className="text-xs font-medium">
          {result.recommended ? (
            <>Recommended: <span className="font-bold text-primary">{result.recommended}</span></>
          ) : (
            <span className="text-destructive font-bold">No viable option</span>
          )}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{result.recommendation_reason}</p>
        {result.cost_difference_pct !== null && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Cost difference: <span className="font-medium">{Math.abs(result.cost_difference_pct)}%</span>
          </p>
        )}
      </div>

      {/* Tier cards */}
      <div className="space-y-2">
        {result.tiers.map((tier) => (
          <TierCard
            key={tier.voltage}
            tier={tier}
            isRecommended={tier.voltage === result.recommended}
          />
        ))}
      </div>

      <p className="text-[9px] text-muted-foreground italic">
        Comparison uses same route ({result.lv_result.meta.route_length_m}m) and demand ({result.lv_result.meta.proposed_kw}kW) for both voltage tiers.
      </p>
    </div>
  );
}
