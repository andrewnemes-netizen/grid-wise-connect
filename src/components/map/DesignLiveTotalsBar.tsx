import { useMemo } from "react";
import { Zap, Cable, PoundSterling, Activity } from "lucide-react";
import type { DesignCable, DesignElement } from "@/hooks/useDesignMode";
import { totalConnectedKva, kvaToKw } from "@/lib/designLoadCalc";
import { estimateConnectionCost } from "@/lib/connectionCosts";
import { useUnitRates } from "@/hooks/useUnitRates";

interface DesignLiveTotalsBarProps {
  elements: DesignElement[];
  cables: DesignCable[];
  /** Set while the user is actively dragging something — pulses the bar. */
  isLive: boolean;
}

function formatGbp(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(1)}k`;
  return `£${Math.round(n).toLocaleString()}`;
}

/**
 * FlowEmo-style sticky strip pinned to the top of the map while Design Mode
 * is on. Ticks live as the user drags equipment / cables.
 */
export function DesignLiveTotalsBar({ elements, cables, isLive }: DesignLiveTotalsBarProps) {
  const { data: rates } = useUnitRates();

  const totals = useMemo(() => {
    const kva = totalConnectedKva(elements);
    const kw = kvaToKw(kva);
    const cableLength = Math.round(cables.reduce((s, c) => s + c.length_m, 0));

    let costMid = 0;
    let costLow = 0;
    let costHigh = 0;
    if (kw > 0 && cableLength > 0) {
      try {
        const est = estimateConnectionCost(
          {
            proposed_kw: kw,
            distances: { primary_m: 0, feeder_m: cableLength, capacity_segment_m: cableLength },
          },
          rates
        );
        costMid = est.total_estimate;
        costLow = Math.round(est.total_estimate * 0.85);
        costHigh = Math.round(est.total_estimate * 1.2);
      } catch (e) {
        // If the engine throws (e.g. extreme inputs), keep the bar visible
        // but suppress the cost segment.
        console.warn("Live cost estimate failed", e);
      }
    }

    return { kva, kw, cableLength, costLow, costMid, costHigh };
  }, [elements, cables, rates]);

  const empty = elements.length === 0 && cables.length === 0;

  return (
    <div
      className={`absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-full border bg-background/95 backdrop-blur shadow-lg px-4 py-2 text-xs ${
        isLive ? "ring-2 ring-primary/60" : ""
      }`}
      aria-live="polite"
    >
      <Activity className={`h-3.5 w-3.5 ${isLive ? "text-primary animate-pulse" : "text-muted-foreground"}`} />

      {empty ? (
        <span className="text-muted-foreground italic">
          Drag a part from the right onto the map to begin designing.
        </span>
      ) : (
        <>
          <div className="flex items-center gap-1.5" title="Total connected load">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span className="font-mono tabular-nums font-semibold">{totals.kva}</span>
            <span className="text-muted-foreground">kVA</span>
            <span className="text-muted-foreground/70 text-[10px]">≈ {totals.kw} kW</span>
          </div>

          <span className="text-muted-foreground/40">·</span>

          <div className="flex items-center gap-1.5" title="Total cable length">
            <Cable className="h-3.5 w-3.5 text-blue-500" />
            <span className="font-mono tabular-nums font-semibold">
              {totals.cableLength.toLocaleString()}
            </span>
            <span className="text-muted-foreground">m</span>
          </div>

          {totals.costMid > 0 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <div className="flex items-center gap-1.5" title="Live connection cost estimate">
                <PoundSterling className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-mono tabular-nums font-semibold">
                  {formatGbp(totals.costLow)}–{formatGbp(totals.costHigh)}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  (mid {formatGbp(totals.costMid)})
                </span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}