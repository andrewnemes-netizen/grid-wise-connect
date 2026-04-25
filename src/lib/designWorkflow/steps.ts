import type { DesignElement, DesignCable } from "@/hooks/useDesignMode";

export type WorkflowStepId =
  | "site_selected"
  | "boundary_drawn"
  | "poc_selected"
  | "feeder_pillar_placed"
  | "chargers_placed"
  | "routes_connected"
  | "dno_rules_passed"
  | "electrical_validated"
  | "cost_generated"
  | "pack_exported";

export interface WorkflowStep {
  id: WorkflowStepId;
  number: number;
  label: string;
  hint: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: "site_selected", number: 1, label: "Site selected", hint: "Pick a postcode or drop a pin." },
  { id: "boundary_drawn", number: 2, label: "Boundary drawn", hint: "Use the Boundary tool to outline the site." },
  { id: "poc_selected", number: 3, label: "POC selected", hint: "Place a transformer, RMU or cutout." },
  { id: "feeder_pillar_placed", number: 4, label: "Feeder pillar placed", hint: "Drop a feeder pillar near the POC." },
  { id: "chargers_placed", number: 5, label: "Chargers placed", hint: "Drag EV chargers onto the map." },
  { id: "routes_connected", number: 6, label: "Cable route connected", hint: "Auto-cable or draw cables to link chargers back to a POC." },
  { id: "dno_rules_passed", number: 7, label: "DNO rules passed", hint: "Run DNO validation." },
  { id: "electrical_validated", number: 8, label: "Electrical validated", hint: "Run electrical sizing and earthing checks." },
  { id: "cost_generated", number: 9, label: "Cost generated", hint: "Generate the cost estimate and BOQ." },
  { id: "pack_exported", number: 10, label: "Pack exported", hint: "Export the client / DNO / installer pack." },
];

export interface WorkflowEvalInputs {
  hasSiteLocation: boolean;
  hasBoundary: boolean;
  elements: DesignElement[];
  cables: DesignCable[];
  dnoRulesPassed: boolean;
  electricalValidated: boolean;
  costGenerated: boolean;
  packExported: boolean;
}

const POC_TYPES = new Set(["transformer", "rmu", "cutout"]);

/**
 * Returns a map of step id -> completed boolean. Pure function, no IO.
 */
export function evaluateSteps(input: WorkflowEvalInputs): Record<WorkflowStepId, boolean> {
  const hasPoc = input.elements.some((e) => POC_TYPES.has(e.element_type));
  const hasFeeder = input.elements.some((e) => e.element_type === "feeder_pillar");
  const chargers = input.elements.filter((e) => e.element_type === "ev_charger");
  const hasChargers = chargers.length > 0;

  // "Routes connected" = every charger has at least one cable referencing it,
  // OR (legacy) any cable exists alongside chargers.
  const cableTouchesIds = new Set<string>();
  for (const c of input.cables) {
    const props = (c.properties_json ?? {}) as { from_id?: string; to_id?: string };
    if (props.from_id) cableTouchesIds.add(props.from_id);
    if (props.to_id) cableTouchesIds.add(props.to_id);
  }
  const everyChargerWired =
    hasChargers &&
    chargers.every((ch) => cableTouchesIds.has(ch.id) || input.cables.length >= chargers.length);

  return {
    site_selected: input.hasSiteLocation,
    boundary_drawn: input.hasBoundary,
    poc_selected: hasPoc,
    feeder_pillar_placed: hasFeeder,
    chargers_placed: hasChargers,
    routes_connected: everyChargerWired,
    dno_rules_passed: input.dnoRulesPassed,
    electrical_validated: input.electricalValidated,
    cost_generated: input.costGenerated,
    pack_exported: input.packExported,
  };
}

/** Highest contiguous step that's complete (1..10), or 0 if none. */
export function highestCompletedStep(states: Record<WorkflowStepId, boolean>): number {
  let n = 0;
  for (const step of WORKFLOW_STEPS) {
    if (states[step.id]) n = step.number;
    else break;
  }
  return n;
}

/** Map step number → workflow_status string for the studies table. */
export function workflowStatusFor(stepNumber: number): string {
  switch (stepNumber) {
    case 0:
    case 1: return "draft";
    case 2: return "site_selected";
    case 3: return "boundary_drawn";
    case 4:
    case 5: return "assets_placed";
    case 6: return "routes_connected";
    case 7:
    case 8: return "validated";
    case 9: return "costed";
    case 10: return "exported";
    default: return "draft";
  }
}