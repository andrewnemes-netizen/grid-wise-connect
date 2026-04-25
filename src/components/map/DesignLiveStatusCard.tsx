import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Activity, PoundSterling } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DesignCable, DesignElement, EquipmentType } from "@/hooks/useDesignMode";
import { totalConnectedKva, kvaToKw } from "@/lib/designLoadCalc";
import { estimateConnectionCost } from "@/lib/connectionCosts";
import { useUnitRates } from "@/hooks/useUnitRates";

interface DesignLiveStatusCardProps {
  elements: DesignElement[];
  cables: DesignCable[];
  /** Pulses the "live" indicator while a drag is in flight. */
  isLive: boolean;
}

/** FlowEmo-style coloured count tiles. */
const TILES: Array<{ key: EquipmentType[]; label: string; bg: string; fg: string }> = [
  { key: ["transformer", "rmu", "cutout"], label: "Point of connection (POC)", bg: "#f59e0b", fg: "#1f2937" },
  { key: ["feeder_pillar"], label: "Distribution Board (LVC)", bg: "#1f2937", fg: "#f9fafb" },
  { key: ["joint", "pole"], label: "DC Supply Unit (DCU)", bg: "#3b82f6", fg: "#ffffff" },
  { key: ["ev_charger"], label: "Satellite / Dispenser (S/D)", bg: "#10b981", fg: "#ffffff" },
];

function formatGbp(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "£0";
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(1)}k`;
  return `£${Math.round(n).toLocaleString()}`;
}

/**
 * FlowEmo-inspired live designer card.
 *
 * Top:    coloured count tiles (POC / LVC / DCU / S-D)
 * Middle: hierarchical "Total length" tree built from cable edges
 * Below:  cable BoM grouped by spec
 * Bottom: hardware + cables + project total
 */
export function DesignLiveStatusCard({ elements, cables, isLive }: DesignLiveStatusCardProps) {
  const { data: rates } = useUnitRates();
  const [collapsed, setCollapsed] = useState(false);

  const elementById = useMemo(
    () => new Map(elements.map((el) => [el.id, el])),
    [elements]
  );

  // Build hierarchical edges from properties_json metadata.
  const tree = useMemo(() => {
    return cables.map((cable) => {
      const props = (cable.properties_json ?? {}) as { from_id?: string; to_id?: string; leg?: string };
      const from = props.from_id ? elementById.get(props.from_id) : null;
      const to = props.to_id ? elementById.get(props.to_id) : null;
      const fromLabel = from?.label ?? "Unknown";
      const toLabel = to?.label ?? cable.label ?? "Load";
      const leg = props.leg ?? "manual";
      return { id: cable.id, fromLabel, toLabel, leg, length_m: cable.length_m };
    });
  }, [cables, elementById]);

  // Cable BoM grouped by spec string from properties_json.
  const bom = useMemo(() => {
    const acc = new Map<string, number>();
    for (const cable of cables) {
      const spec = (((cable.properties_json ?? {}) as { cable_spec?: string }).cable_spec) ?? "Unspecified";
      acc.set(spec, (acc.get(spec) ?? 0) + cable.length_m);
    }
    return [...acc.entries()].map(([spec, length_m]) => ({ spec, length_m }));
  }, [cables]);

  // Cost estimate (rough — full BoM lives in the assessment engine).
  const totals = useMemo(() => {
    const kva = totalConnectedKva(elements);
    const kw = kvaToKw(kva);
    const cableLength = Math.round(cables.reduce((s, c) => s + c.length_m, 0));
    let project = 0;
    let cablesCost = 0;
    let hardwareCost = 0;
    if (kw > 0 && cableLength > 0) {
      try {
        const est = estimateConnectionCost(
          {
            proposed_kw: kw,
            distances: { primary_m: 0, feeder_m: cableLength, capacity_segment_m: cableLength },
          },
          rates
        );
        project = est.total_estimate;
        // Heuristic split: ~12% cables, ~88% civils + hardware (matches typical LV breakdown).
        cablesCost = Math.round(project * 0.12);
        hardwareCost = Math.round(project - cablesCost);
      } catch (e) {
        console.warn("Live cost estimate failed", e);
      }
    }
    return { kva, kw, cableLength, project, cablesCost, hardwareCost };
  }, [elements, cables, rates]);

  const empty = elements.length === 0 && cables.length === 0;

  return (
    <div
      className={`w-[340px] rounded-lg border bg-background/95 backdrop-blur shadow-xl text-xs ${
        isLive ? "ring-2 ring-primary/50" : ""
      }`}
      aria-live="polite"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <span className={`flex h-2 w-2 rounded-full ${isLive ? "bg-primary animate-pulse" : "bg-emerald-500"}`} />
          <span className="font-bold tracking-wider text-[10px] uppercase">Live Status</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </Button>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
          {empty ? (
            <div className="text-center py-4 text-muted-foreground italic text-xs">
              <Activity className="h-4 w-4 mx-auto mb-1 opacity-50" />
              Drag a part from the right onto the map to begin designing.
            </div>
          ) : (
            <>
              {/* Count tiles */}
              <div className="grid grid-cols-2 gap-1.5">
                {TILES.map((tile) => {
                  const count = elements.filter((el) => tile.key.includes(el.element_type)).length;
                  return (
                    <div
                      key={tile.label}
                      className="rounded-md px-2 py-1.5 flex items-center justify-between font-semibold"
                      style={{ background: tile.bg, color: tile.fg }}
                    >
                      <span className="text-[10px] leading-tight">{tile.label}</span>
                      <span className="font-mono text-base tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </div>

              {/* Length tree */}
              {tree.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total length</p>
                  <div className="space-y-0.5 font-mono text-[11px]">
                    {tree.map((edge) => (
                      <div key={edge.id} className="flex items-center justify-between">
                        <span className={edge.leg === "feeder_to_evcp" ? "pl-3 text-muted-foreground" : ""}>
                          {edge.leg === "feeder_to_evcp" && <span className="opacity-50 mr-1">└─</span>}
                          {edge.fromLabel} → {edge.toLabel}
                        </span>
                        <span className="tabular-nums font-semibold">{edge.length_m.toFixed(2)} m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* BoM */}
              {bom.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cable total length</p>
                  <div className="space-y-0.5 font-mono text-[11px]">
                    {bom.map((row) => (
                      <div key={row.spec} className="flex items-center justify-between">
                        <span className="truncate pr-2">{row.spec}</span>
                        <span className="tabular-nums font-semibold">{row.length_m.toFixed(2)} m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Project total */}
              {totals.project > 0 && (
                <div className="space-y-1 pt-1 border-t">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Total Project Cost
                  </p>
                  <div className="space-y-0.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Hardware</span>
                      <span className="font-mono font-semibold tabular-nums">{formatGbp(totals.hardwareCost)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Cables</span>
                      <span className="font-mono font-semibold tabular-nums">{formatGbp(totals.cablesCost)}</span>
                    </div>
                    <div className="flex items-center justify-between bg-primary/10 -mx-1 px-1 py-1 rounded">
                      <span className="font-bold text-primary flex items-center gap-1">
                        <PoundSterling className="h-3 w-3" /> Total
                      </span>
                      <span className="font-mono font-bold tabular-nums text-primary">
                        {formatGbp(totals.project)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    {totals.kva} kVA connected · {totals.cableLength.toLocaleString()} m of cable
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}