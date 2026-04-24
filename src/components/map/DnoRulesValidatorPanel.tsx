/**
 * DNO Rules Validator Panel
 *
 * Step-by-step breakdown of why mains extension is or isn't required for the
 * current route, given the configured DNO threshold and the existing LV main
 * found by the spatial POC lookup. Auditable so an ICP designer can read the
 * rules trail without opening the cost-engine source.
 */

import { CheckCircle2, AlertTriangle, XCircle, Info, ChevronDown, ChevronUp, Scale } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface DnoRulesValidatorInput {
  drawnRouteM: number;
  spurToPocM: number | null;
  thresholdM: number;
  proposedKw: number;
  existingMainType?: string | null;
  existingMainEvCompatible?: boolean | null;
  existingMainDirectKva?: number | null;
  dno?: string | null;
}

type StepStatus = "pass" | "fail" | "warn" | "info";

interface ValidatorStep {
  id: string;
  title: string;
  status: StepStatus;
  rule: string;
  evidence: string;
  conclusion: string;
}

function buildSteps(input: DnoRulesValidatorInput): {
  steps: ValidatorStep[];
  overall: "standard_service" | "mains_extension" | "blocked";
  effectiveCableM: number;
} {
  const drawn = Math.max(0, Math.round(input.drawnRouteM));
  const spur = input.spurToPocM == null ? null : Math.max(0, Math.round(input.spurToPocM));
  const effective = drawn + (spur ?? 0);
  const threshold = Math.round(input.thresholdM);
  const dnoLabel = input.dno || "Standard ICP / NPG v3.0";

  const steps: ValidatorStep[] = [];

  // Step 1 — POC identification
  if (input.existingMainType) {
    steps.push({
      id: "poc",
      title: "Point of Connection identified",
      status: "pass",
      rule: "Self-determined POC must connect onto an existing 3-phase LV main.",
      evidence: `Spatial lookup matched: ${input.existingMainType}${
        input.existingMainDirectKva ? ` (${input.existingMainDirectKva} kVA direct-bury)` : ""
      }.`,
      conclusion: "POC asset confirmed.",
    });
  } else {
    steps.push({
      id: "poc",
      title: "Point of Connection identified",
      status: "warn",
      rule: "Self-determined POC must connect onto an existing 3-phase LV main.",
      evidence: "No compatible LV main returned by the spatial lookup yet.",
      conclusion: "Run the LV main search to populate this rule.",
    });
  }

  // Step 2 — EV compatibility of existing main
  if (input.existingMainType) {
    if (input.existingMainEvCompatible) {
      steps.push({
        id: "ev",
        title: "Existing main rated for the new EV load",
        status: "pass",
        rule: "EV charging connections (55 kVA / 80 A) require Waveform >=120 mm^2, CNE/Hybrid >=95 mm^2, or Cu/Al PILC at the equivalent threshold.",
        evidence: `${input.existingMainType} meets the compatibility threshold.`,
        conclusion: "No upstream cable replacement needed.",
      });
    } else {
      steps.push({
        id: "ev",
        title: "Existing main rated for the new EV load",
        status: "fail",
        rule: "EV charging connections (55 kVA / 80 A) require Waveform >=120 mm^2, CNE/Hybrid >=95 mm^2, or Cu/Al PILC at the equivalent threshold.",
        evidence: `${input.existingMainType} is below the threshold.`,
        conclusion: "Upstream reinforcement likely required — escalate to the DNO.",
      });
    }
  }

  // Step 3 — Self-determination cap (NPG v3.0: ICP up to 250 kVA LV)
  const proposedKva = input.proposedKw / 0.95;
  if (proposedKva <= 250) {
    steps.push({
      id: "icp_cap",
      title: "ICP self-determination cap (LV <= 250 kVA)",
      status: "pass",
      rule: "NPG v3.0 permits ICP self-determination of POC for LV demand up to 250 kVA.",
      evidence: `Proposed load ${input.proposedKw} kW ~ ${proposedKva.toFixed(0)} kVA at 0.95 PF.`,
      conclusion: "Within ICP scope — proceed with self-determined POC.",
    });
  } else {
    steps.push({
      id: "icp_cap",
      title: "ICP self-determination cap (LV <= 250 kVA)",
      status: "fail",
      rule: "NPG v3.0 permits ICP self-determination of POC for LV demand up to 250 kVA.",
      evidence: `Proposed load ${input.proposedKw} kW ~ ${proposedKva.toFixed(0)} kVA at 0.95 PF — exceeds the LV cap.`,
      conclusion: "Refer to the DNO for HV connection determination.",
    });
  }

  // Step 4 — Cable length build-up
  const spurEvidence =
    spur == null
      ? `Drawn route ${drawn} m. Spur not yet measured (no POC lookup).`
      : spur === 0
        ? `Drawn route ${drawn} m + spur 0 m (route already touches the existing main) = ${effective} m.`
        : `Drawn route ${drawn} m + spur ${spur} m to existing main = ${effective} m.`;
  steps.push({
    id: "length",
    title: "Total installed cable length",
    status: "info",
    rule: "Cable length billed in the BoQ = the polyline you drew on the map plus the perpendicular spur from the nearest point on that route to the existing LV main.",
    evidence: spurEvidence,
    conclusion: `Effective length used for the rule check: ${effective} m.`,
  });

  // Step 5 — Mains-extension trigger
  const exceedsThreshold = effective > threshold;
  steps.push({
    id: "trigger",
    title: `Mains-extension threshold (> ${threshold} m)`,
    status: exceedsThreshold ? "warn" : "pass",
    rule: `${dnoLabel}: a "service" is short. When the new cable run exceeds ${threshold} m, the additional length is laid as a mains extension (185mm^2 4c XLPE/SWA) rather than continuous service-grade cable.`,
    evidence: exceedsThreshold
      ? `${effective} m > ${threshold} m — threshold exceeded by ${effective - threshold} m.`
      : `${effective} m <= ${threshold} m — within service-cable scope.`,
    conclusion: exceedsThreshold
      ? "Mains extension is required."
      : "Standard service connection — no mains extension.",
  });

  // Step 6 — BoQ composition
  if (exceedsThreshold) {
    steps.push({
      id: "boq",
      title: "BoQ composition (auto-generated)",
      status: "info",
      rule: "When mains extension fires: cap the service portion at the threshold, route the remainder as 185mm^2 4c XLPE/SWA, and double-up terminations + joint bays.",
      evidence: `Service: ${threshold} m x 35mm^2 concentric CNE. Mains extension: ${effective - threshold} m x 185mm^2 4c XLPE/SWA. Terminations: 2 (vs 1 standard). Joint bays: 2. Plus pot end and additional jointing labour.`,
      conclusion: "BoQ table reflects the split automatically.",
    });
  } else {
    steps.push({
      id: "boq",
      title: "BoQ composition (auto-generated)",
      status: "info",
      rule: "Standard service: single cable, single termination, single joint bay.",
      evidence: `Service: ${effective} m x 35mm^2 concentric CNE. Terminations: 1. Joint bays: 1.`,
      conclusion: "BoQ reflects a standard LV service.",
    });
  }

  const blockingFail = steps.some((s) => s.status === "fail");
  const overall: "standard_service" | "mains_extension" | "blocked" = blockingFail
    ? "blocked"
    : exceedsThreshold
      ? "mains_extension"
      : "standard_service";

  return { steps, overall, effectiveCableM: effective };
}

function statusIcon(status: StepStatus) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

export function DnoRulesValidatorPanel(props: DnoRulesValidatorInput) {
  const [open, setOpen] = useState(true);
  const { steps, overall, effectiveCableM } = buildSteps(props);

  const verdictBadge =
    overall === "blocked"
      ? { label: "Action Required", variant: "destructive" as const }
      : overall === "mains_extension"
        ? { label: "Mains Extension Required", variant: "secondary" as const }
        : { label: "Standard Service", variant: "outline" as const };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8">
          <span className="flex items-center gap-2">
            <Scale className="h-3.5 w-3.5 text-primary" />
            DNO Rules Validator
            <Badge variant={verdictBadge.variant} className="text-[9px] ml-1">
              {verdictBadge.label}
            </Badge>
          </span>
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-1">
        <div className="rounded-md border bg-muted/10 p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Step-by-step rule trail driving the BoQ for this route. Auditable against{" "}
            <span className="font-medium">{props.dno || "NPG v3.0 / standard ICP"}</span>{" "}
            with a <span className="font-medium">{Math.round(props.thresholdM)} m</span>{" "}
            mains-extension threshold.
          </p>

          <ol className="space-y-2">
            {steps.map((step, idx) => (
              <li
                key={step.id}
                className="rounded-md border bg-background/60 p-2.5 space-y-1.5"
              >
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground mt-0.5 shrink-0">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="shrink-0 mt-0.5">{statusIcon(step.status)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold leading-tight">{step.title}</p>
                  </div>
                </div>
                <div className="pl-9 space-y-1">
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wider">Rule:</span>{" "}
                    {step.rule}
                  </p>
                  <p className="text-[10px]">
                    <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                      Evidence:
                    </span>{" "}
                    {step.evidence}
                  </p>
                  <p className="text-[10px] font-medium">
                    <span className="uppercase tracking-wider text-muted-foreground font-semibold">
                      Result:
                    </span>{" "}
                    {step.conclusion}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-md border border-primary/20 bg-primary/5 p-2 mt-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Final Determination
            </p>
            <p className="text-xs font-semibold mt-0.5">
              {overall === "blocked"
                ? `Blocked — ${effectiveCableM} m route fails an upstream rule. Resolve flagged step(s) above.`
                : overall === "mains_extension"
                  ? `Mains extension required for ${effectiveCableM} m route. BoQ split applied automatically.`
                  : `Standard ${effectiveCableM} m service connection. No mains extension needed.`}
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
