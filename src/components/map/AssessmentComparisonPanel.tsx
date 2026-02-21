import { ArrowLeft, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SavedAssessment } from "./ConnectAssessmentPanel";

interface AssessmentComparisonPanelProps {
  assessments: SavedAssessment[];
  onBack: () => void;
}

const scoreIcons: Record<string, typeof CheckCircle> = {
  GREEN: CheckCircle,
  AMBER: AlertTriangle,
  RED: XCircle,
};
const scoreColors: Record<string, string> = {
  GREEN: "text-emerald-600",
  AMBER: "text-amber-600",
  RED: "text-red-600",
};

type RowDef = {
  label: string;
  getValue: (a: SavedAssessment) => string | number;
  best?: "min" | "max" | "score";
};

const rows: RowDef[] = [
  { label: "Source Asset", getValue: (a) => {
    const p = a.endpoints.source.properties;
    return (p.site_name as string) || (p.name as string) || (p.asset_id as string) || a.endpoints.source.layerLabel;
  }},
  { label: "Destination", getValue: (a) => `${a.endpoints.destination.lngLat[1].toFixed(4)}, ${a.endpoints.destination.lngLat[0].toFixed(4)}` },
  { label: "Route Distance (m)", getValue: (a) => a.distances.primary_m, best: "min" },
  { label: "Proposed kW", getValue: (a) => a.proposedKw },
  { label: "Voltage Level", getValue: (a) => a.voltageLevel },
  { label: "Score", getValue: (a) => a.result.score, best: "score" },
  { label: "Total Cost (£)", getValue: (a) => a.totalEstimate, best: "min" },
  { label: "Cable Cost (£)", getValue: (a) => a.costEstimate?.cable_cost ?? "-", best: "min" },
  { label: "Excavation (£)", getValue: (a) => a.costEstimate?.excavation_cost ?? "-", best: "min" },
  { label: "Equipment (£)", getValue: (a) => a.costEstimate?.equipment_cost ?? "-", best: "min" },
  { label: "Reinforcement (£)", getValue: (a) => a.costEstimate?.reinforcement_cost ?? "-", best: "min" },
  { label: "Confidence", getValue: (a) => a.confidence },
  { label: "NDP Intersect", getValue: (a) => a.result.constraints?.ndp_intersect ? "Yes" : "No" },
  { label: "Wayleave", getValue: (a) => a.result.constraints?.wayleave_intersect ? "Yes" : "No" },
  { label: "Capacity Flag", getValue: (a) => a.result.constraints?.capacity_flag ?? "-" },
];

const scoreRank: Record<string, number> = { GREEN: 3, AMBER: 2, RED: 1 };

function bestIndex(values: (string | number)[], mode?: "min" | "max" | "score"): number {
  if (!mode) return -1;
  if (mode === "score") {
    let best = -1, bestRank = -1;
    values.forEach((v, i) => {
      const rank = scoreRank[String(v)] ?? 0;
      if (rank > bestRank) { bestRank = rank; best = i; }
    });
    return best;
  }
  const nums = values.map((v) => (typeof v === "number" ? v : NaN));
  if (nums.every(isNaN)) return -1;
  const fn = mode === "min" ? Math.min : Math.max;
  const target = fn(...nums.filter((n) => !isNaN(n)));
  return nums.indexOf(target);
}

export function AssessmentComparisonPanel({ assessments, onBack }: AssessmentComparisonPanelProps) {
  return (
    <div className="absolute top-0 right-0 z-20 h-full w-[540px] max-w-full border-l bg-background shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-semibold text-sm">Compare Options ({assessments.length})</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-36">Metric</TableHead>
                {assessments.map((a) => (
                  <TableHead key={a.id} className="text-xs text-center">
                    {a.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const values = assessments.map((a) => row.getValue(a));
                const best = bestIndex(values, row.best);

                return (
                  <TableRow key={row.label}>
                    <TableCell className="text-xs font-medium text-muted-foreground py-1.5 px-2">
                      {row.label}
                    </TableCell>
                    {values.map((v, i) => {
                      const isBest = best === i;
                      const isScore = row.best === "score";

                      return (
                        <TableCell
                          key={i}
                          className={`text-xs text-center py-1.5 px-2 ${isBest ? "font-bold bg-primary/5" : ""}`}
                        >
                          {isScore ? (
                            <span className="inline-flex items-center gap-1">
                              {(() => {
                                const Icon = scoreIcons[String(v)] ?? AlertTriangle;
                                const color = scoreColors[String(v)] ?? "";
                                return <Icon className={`h-3.5 w-3.5 ${color}`} />;
                              })()}
                              <Badge
                                variant={v === "GREEN" ? "default" : v === "RED" ? "destructive" : "secondary"}
                                className="text-[9px] px-1 py-0"
                              >
                                {String(v)}
                              </Badge>
                            </span>
                          ) : typeof v === "number" ? (
                            v.toLocaleString()
                          ) : (
                            String(v)
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>
    </div>
  );
}
