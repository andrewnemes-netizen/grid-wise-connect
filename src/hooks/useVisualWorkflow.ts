import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DesignElement, DesignCable } from "@/hooks/useDesignMode";
import {
  WORKFLOW_STEPS,
  evaluateSteps,
  highestCompletedStep,
  workflowStatusFor,
  type WorkflowStepId,
} from "@/lib/designWorkflow/steps";
import { subscribeRecalc, wireDesignEvents } from "@/lib/designWorkflow/recalcBus";

interface UseVisualWorkflowArgs {
  studyId: string | null;
  hasSiteLocation: boolean;
  hasBoundary: boolean;
  elements: DesignElement[];
  cables: DesignCable[];
}

export interface VisualWorkflowState {
  steps: typeof WORKFLOW_STEPS;
  states: Record<WorkflowStepId, boolean>;
  highestStep: number;
  workflowStatus: string;
  /** Manual flags that the recalc bus / panels can flip. */
  flags: {
    dnoRulesPassed: boolean;
    electricalValidated: boolean;
    costGenerated: boolean;
    packExported: boolean;
  };
  setFlag: (key: keyof VisualWorkflowState["flags"], value: boolean) => void;
  /** Tick counter incremented on each recalc bus event — useful for re-render. */
  recalcTick: number;
  logEvent: (eventType: string, label?: string, metadata?: Record<string, unknown>) => Promise<void>;
}

export function useVisualWorkflow({
  studyId,
  hasSiteLocation,
  hasBoundary,
  elements,
  cables,
}: UseVisualWorkflowArgs): VisualWorkflowState {
  const [flags, setFlags] = useState({
    dnoRulesPassed: false,
    electricalValidated: false,
    costGenerated: false,
    packExported: false,
  });
  const [recalcTick, setRecalcTick] = useState(0);
  const lastPersistedStatus = useRef<string | null>(null);

  // Wire global design events into the recalc bus once.
  useEffect(() => {
    wireDesignEvents();
    const unsub = subscribeRecalc(() => setRecalcTick((n) => n + 1));
    return unsub;
  }, []);

  const states = useMemo(
    () =>
      evaluateSteps({
        hasSiteLocation,
        hasBoundary,
        elements,
        cables,
        ...flags,
      }),
    [hasSiteLocation, hasBoundary, elements, cables, flags]
  );

  const highestStep = useMemo(() => highestCompletedStep(states), [states]);
  const workflowStatus = useMemo(() => workflowStatusFor(highestStep), [highestStep]);

  // Persist status back to studies (best-effort, debounced via state).
  useEffect(() => {
    if (!studyId) return;
    if (lastPersistedStatus.current === workflowStatus) return;
    lastPersistedStatus.current = workflowStatus;
    supabase
      .from("studies")
      .update({ workflow_status: workflowStatus } as never)
      .eq("id", studyId)
      .then(({ error }) => {
        if (error) console.warn("Failed to persist workflow_status", error);
      });
  }, [studyId, workflowStatus]);

  const setFlag: VisualWorkflowState["setFlag"] = (key, value) => {
    setFlags((prev) => ({ ...prev, [key]: value }));
  };

  const logEvent: VisualWorkflowState["logEvent"] = async (eventType, label, metadata) => {
    if (!studyId) return;
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    await supabase.from("design_workflow_events").insert({
      study_id: studyId,
      event_type: eventType,
      event_label: label ?? null,
      metadata_json: (metadata ?? {}) as never,
      created_by: user.user.id,
    } as never);
  };

  return {
    steps: WORKFLOW_STEPS,
    states,
    highestStep,
    workflowStatus,
    flags,
    setFlag,
    recalcTick,
    logEvent,
  };
}