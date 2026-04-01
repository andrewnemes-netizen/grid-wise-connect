import { useMemo, useState } from "react";
import { PoundSterling, ChevronDown, ChevronUp, AlertCircle, CheckCircle, HelpCircle, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { estimateConnectionCost, generateBom, type CostEstimate, type BomItem, type VoltageOverride } from "@/lib/connectionCosts";
import { useUnitRates } from "@/hooks/useUnitRates";

interface CostEstimatePanelProps {
  proposed_kw: number;
  distances: { primary_m: number; feeder_m: number; capacity_segment_m: number };
  constraints?: {
    capacity_flag?: string;
    min_footway_m?: number | null;
    min_carriageway_m?: number | null;
  };
  nearest_headroom_kw?: number;
  voltageOverride: VoltageOverride;
  includeFeederPillar?: boolean;
}

const CONFIDENCE_CONFIG = {
  high: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "High confidence" },
  medium: { icon: HelpCircle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Medium confidence" },
  low: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Low confidence" },
};

function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(amount);
}

export function CostEstimatePanel({ proposed_kw, distances, constraints, nearest_headroom_kw, voltageOverride }: CostEstimatePanelProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showBom, setShowBom] = useState(false);
  const { data: unitRates } = useUnitRates();

  const estimate = useMemo<CostEstimate>(
    () => estimateConnectionCost({ proposed_kw, distances, constraints, nearest_headroom_kw, voltage_override: voltageOverride }, unitRates),
    [proposed_kw, distances, constraints, nearest_headroom_kw, unitRates, voltageOverride]
  );

  const bom = useMemo<BomItem[]>(
    () => generateBom({ proposed_kw, distances, constraints, voltage_override: voltageOverride, nearest_headroom_kw: nearest_headroom_kw }, unitRates),
    [proposed_kw, distances, constraints, voltageOverride, nearest_headroom_kw, unitRates]
  );

  const conf = CONFIDENCE_CONFIG[estimate.confidence];
  const ConfIcon = conf.icon;

  // Group breakdown by category
  const groupedBreakdown = estimate.breakdown.reduce<Record<string, typeof estimate.breakdown>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  // Group BOM by category
  const groupedBom = bom.reduce<Record<string, BomItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const bomTotal = bom.reduce((s, b) => s + b.total_cost, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PoundSterling className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Budget Estimate</p>
      </div>

      {/* Active voltage indicator */}
      <p className="text-[10px] text-muted-foreground">
        Using: <span className="font-medium">{estimate.voltage_level}</span>
      </p>

      {/* Total cost card */}
      <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Estimated Total</p>
            <p className="text-2xl font-bold text-foreground">{formatGBP(estimate.total_estimate)}</p>
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] ${conf.bg}`}>
            <ConfIcon className={`h-3 w-3 ${conf.color}`} />
            <span className={conf.color}>{conf.label}</span>
          </div>
        </div>

        {/* Cost breakdown bars */}
        <div className="mt-3 space-y-1">
        {[
            { label: "Cable", value: estimate.cable_cost, color: "bg-blue-500" },
            { label: "Excavation", value: estimate.excavation_cost, color: "bg-amber-500" },
            { label: "Equipment", value: estimate.equipment_cost, color: "bg-purple-500" },
            { label: "Labour", value: estimate.labour_cost, color: "bg-emerald-500" },
            ...(estimate.reinforcement_cost > 0 ? [{ label: "Reinforcement", value: estimate.reinforcement_cost, color: "bg-red-500" }] : []),
          ].map((bar) => (
            <div key={bar.label} className="flex items-center gap-2 text-[10px]">
              <span className="w-20 text-muted-foreground">{bar.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${(bar.value / estimate.subtotal) * 100}%` }} />
              </div>
              <span className="w-16 text-right font-medium">{formatGBP(bar.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded border bg-muted/20 px-2 py-1.5">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="float-right font-semibold">{formatGBP(estimate.subtotal)}</span>
        </div>
        <div className="rounded border bg-muted/20 px-2 py-1.5">
          <span className="text-muted-foreground">Fees + Contingency</span>
          <span className="float-right font-semibold">{formatGBP(estimate.design_fee + estimate.project_management + estimate.contingency)}</span>
        </div>
      </div>

      {/* Detailed breakdown toggle */}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs h-7"
        onClick={() => setShowBreakdown(!showBreakdown)}
      >
        {showBreakdown ? <ChevronUp className="mr-1.5 h-3 w-3" /> : <ChevronDown className="mr-1.5 h-3 w-3" />}
        Detailed Cost Breakdown
      </Button>

      {showBreakdown && (
        <div className="space-y-2">
          {Object.entries(groupedBreakdown).map(([category, items]) => (
            <div key={category}>
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{category}</p>
              {items.map((item, i) => (
                <div key={i} className="flex justify-between text-[10px] py-0.5">
                  <span className="text-foreground">{item.description}</span>
                  <span className="font-medium">{formatGBP(item.total)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* BOM toggle */}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs h-7"
        onClick={() => setShowBom(!showBom)}
      >
        <FileText className="mr-1.5 h-3 w-3" />
        {showBom ? <ChevronUp className="mr-1.5 h-3 w-3" /> : <ChevronDown className="mr-1.5 h-3 w-3" />}
        Bill of Materials
      </Button>

      {showBom && (
        <div className="space-y-2">
          {Object.entries(groupedBom).map(([category, items]) => (
            <div key={category}>
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{category}</p>
              <div className="space-y-0.5">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-[10px] py-0.5">
                    <span className="text-foreground truncate max-w-[55%]">{item.item}</span>
                    <span className="text-muted-foreground">{item.quantity} {item.unit}</span>
                    <span className="font-medium w-14 text-right">{formatGBP(item.total_cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-between text-xs font-semibold border-t pt-1">
            <span>BoM Total</span>
            <span>{formatGBP(bomTotal)}</span>
          </div>
        </div>
      )}

      <p className="text-[9px] text-muted-foreground italic">
        Budget estimates use UK industry-standard unit rates. Actual costs may vary based on site-specific conditions, DNO quotation, and market rates.
      </p>
    </div>
  );
}
