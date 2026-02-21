/**
 * Study Snapshot Service
 *
 * Creates immutable, versioned snapshots of electrical validation outputs
 * tied to a study. Each snapshot captures:
 *  - Electrical inputs + selected cable configuration
 *  - Validation results + cost summary
 *  - Engine version, ruleset version, price book version
 *
 * Snapshots are immutable once saved (enforced via RLS — no UPDATE/DELETE
 * policies for regular users).
 */

import { supabase } from "@/integrations/supabase/client";
import type { ElectricalValidationResult } from "./electricalEngine";
import type { OptimiserResult } from "./lvOptimiser";
import type { CostEstimate } from "./connectionCosts";

const PRICEBOOK_VERSION = "v1"; // Bump when unit_rates structure changes

export interface SnapshotInput {
  studyId: string;
  /** Electrical inputs used for this run */
  electricalInputs: Record<string, unknown>;
  /** Selected cable configuration */
  cableConfiguration: Record<string, unknown>;
  /** Electrical validation output */
  validationResults: ElectricalValidationResult;
  /** Cost estimate reference */
  costSummary: CostEstimate | Record<string, unknown>;
  /** Optimiser output (if run) */
  optimiserOutput?: OptimiserResult | null;
  /** Engine version from validation result */
  engineVersion: string;
  /** DNO ruleset version */
  rulesetVersion: string;
  /** Optional label */
  label?: string;
  /** Optional notes */
  notes?: string;
}

export interface StudySnapshot {
  id: string;
  study_id: string;
  created_at: string;
  engine_version: string;
  ruleset_version: string;
  pricebook_version: string;
  electrical_inputs: Record<string, unknown>;
  cable_configuration: Record<string, unknown>;
  validation_results: Record<string, unknown>;
  cost_summary: Record<string, unknown>;
  optimiser_output: Record<string, unknown> | null;
  snapshot_label: string | null;
  notes: string | null;
}

/**
 * Save an immutable snapshot to the study_snapshots table.
 * Returns the snapshot ID on success.
 */
export async function createSnapshot(input: SnapshotInput): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("study_snapshots" as any)
    .insert({
      study_id: input.studyId,
      created_by: user.id,
      engine_version: input.engineVersion,
      ruleset_version: input.rulesetVersion,
      pricebook_version: PRICEBOOK_VERSION,
      electrical_inputs: input.electricalInputs,
      cable_configuration: input.cableConfiguration,
      validation_results: input.validationResults as any,
      cost_summary: input.costSummary as any,
      optimiser_output: input.optimiserOutput ? (input.optimiserOutput as any) : null,
      snapshot_label: input.label || null,
      notes: input.notes || null,
    } as any)
    .select("id")
    .single();

  if (error) throw error;
  return (data as any).id;
}

/**
 * List snapshots for a given study, newest first.
 */
export async function listSnapshots(studyId: string): Promise<StudySnapshot[]> {
  const { data, error } = await supabase
    .from("study_snapshots" as any)
    .select("*")
    .eq("study_id", studyId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as StudySnapshot[];
}
