// Shared spec for Gridwise Assistant WRITE tools.
// The assistant edge function declares these to the model WITHOUT `execute`
// so every call arrives at the client as a proposal that requires human
// approval. On approval the client posts to `gridwise-agent-execute`, which
// runs the corresponding branch below as the signed-in user (RLS enforced).
//
// SAFE tools (configured per agent in agent-registry.ts) may also be executed
// inline by gridwise-assistant when the user has enabled auto_execute_safe.
import { z } from "npm:zod@^3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type WriteToolName =
  | "mark_stage_done_bulk"
  | "set_stage_status_bulk"
  | "assign_stage_owner"
  | "reassign_waiting_stage_owner"
  | "add_sites_to_wp"
  | "remove_sites_from_wp"
  | "queue_survey_for_sites"
  | "update_site_fields"
  | "archive_programme"
  | "archive_work_package"
  | "archive_site"
  | "archive_programmes_bulk"
  | "archive_work_packages_bulk";

// Zod schemas — mirrored client-side via the tool call payload.
export const writeToolSchemas = {
  mark_stage_done_bulk: z.object({
    work_package_id: z.string().uuid(),
    site_ids: z.array(z.string().uuid()).min(1).max(200),
    stage_key: z.string().min(1),
    next_stage_recipient_user_ids: z.array(z.string().uuid()).default([]),
  }),
  set_stage_status_bulk: z.object({
    work_package_id: z.string().uuid(),
    site_ids: z.array(z.string().uuid()).min(1).max(200),
    stage_key: z.string().min(1),
    status: z.enum(["in_progress", "blocked", "review"]),
    blocked_reason: z.string().optional(),
  }),
  assign_stage_owner: z.object({
    work_package_id: z.string().uuid(),
    site_ids: z.array(z.string().uuid()).min(1).max(200),
    stage_key: z.string().min(1),
    owner_user_id: z.string().uuid().optional(),
    recipient_user_ids: z.array(z.string().uuid()).default([]),
  }),
  reassign_waiting_stage_owner: z.object({
    work_package_id: z.string().uuid(),
    site_ids: z.array(z.string().uuid()).min(1).max(200),
    stage_key: z.string().min(1),
    new_owner_user_id: z.string().uuid(),
  }),
  add_sites_to_wp: z.object({
    work_package_id: z.string().uuid(),
    site_ids: z.array(z.string().uuid()).min(1).max(200),
  }),
  remove_sites_from_wp: z.object({
    work_package_id: z.string().uuid(),
    site_ids: z.array(z.string().uuid()).min(1).max(200),
    confirm_phrase: z.string().describe(
      "The user must type 'remove N sites' exactly, matching site_ids length. Assistant must not fabricate this.",
    ),
  }),
  queue_survey_for_sites: z.object({
    site_ids: z.array(z.string().uuid()).min(1).max(50),
    surveyor_email: z.string().email(),
    surveyor_name: z.string().optional(),
    message: z.string().max(2000).optional(),
  }),
  update_site_fields: z.object({
    site_id: z.string().uuid(),
    fields: z
      .object({
        site_name: z.string().optional(),
        postcode: z.string().optional(),
        client_site_code: z.string().optional(),
        proposed_kw: z.number().optional(),
        socket_count: z.number().int().optional(),
        blocker_reason: z.string().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, "fields cannot be empty"),
  }),
  archive_programme: z.object({
    programme_id: z.string().uuid(),
    reason: z.string().min(3),
  }),
  archive_work_package: z.object({
    work_package_id: z.string().uuid(),
    reason: z.string().min(3),
  }),
  archive_site: z.object({
    site_id: z.string().uuid(),
    reason: z.string().min(3),
  }),
  archive_programmes_bulk: z.object({
    programme_ids: z.array(z.string().uuid()).min(1).max(100),
    reason: z.string().min(3),
    confirm_phrase: z.string().describe("User must type 'archive N programmes' exactly."),
  }),
  archive_work_packages_bulk: z.object({
    work_package_ids: z.array(z.string().uuid()).min(1).max(100),
    reason: z.string().min(3),
    confirm_phrase: z.string().describe("User must type 'archive N work packages' exactly."),
  }),
} as const;

// Human-readable tool descriptions for the model.
export const writeToolDescriptions: Record<WriteToolName, string> = {
  mark_stage_done_bulk:
    "Mark a Pre-Con stage as DONE for one or more sites in a work package, and optionally assign owners for the NEXT stage. Requires human approval. Use exact stage_key from stage_definitions (e.g. 'poc_application').",
  set_stage_status_bulk:
    "Set the workflow status of a stage to in_progress / blocked / review for one or more sites. Safe — may auto-execute when the user has enabled safe auto-execution.",
  assign_stage_owner:
    "Assign an owner and/or recipients to a stage for one or more sites. Safe — may auto-execute.",
  reassign_waiting_stage_owner:
    "Reassign the owner of an overdue waiting/counter stage (e.g. PoC Offer Due, Survey PO Gate) to a new user. Safe — may auto-execute.",
  add_sites_to_wp:
    "Attach existing sites to a work package. Requires human approval. Does not create sites.",
  remove_sites_from_wp:
    "Detach sites from a work package. DESTRUCTIVE. Requires human approval and an explicit confirm_phrase 'remove N sites' matching the count.",
  queue_survey_for_sites:
    "Create pending survey invitations for one or more sites and email the surveyor. Requires human approval.",
  update_site_fields:
    "Edit editable metadata on a site (name, postcode, client code, proposed kW, socket count, blocker reason). Requires human approval.",
  archive_programme:
    "Archive a single programme (soft delete → recoverable from Admin Archive). Requires human approval and a reason.",
  archive_work_package:
    "Archive a single work package (soft delete → recoverable from Admin Archive). Requires human approval and a reason.",
  archive_site:
    "Archive a single site (soft delete → recoverable from Admin Archive). Requires human approval and a reason.",
  archive_programmes_bulk:
    "DESTRUCTIVE. Archive multiple programmes in one action. Requires approval, a reason, and confirm_phrase 'archive N programmes' matching count. Call search_programmes first — never guess IDs.",
  archive_work_packages_bulk:
    "DESTRUCTIVE. Archive multiple work packages in one action. Requires approval, a reason, and confirm_phrase 'archive N work packages' matching count. Never guess IDs.",
};

// Risk tier used for UI badges and auto-execution eligibility.
export function riskTierFor(tool: WriteToolName): "safe" | "destructive" | "external" | "cost" {
  switch (tool) {
    case "set_stage_status_bulk":
    case "assign_stage_owner":
    case "reassign_waiting_stage_owner":
      return "safe";
    case "queue_survey_for_sites":
      return "external";
    case "archive_programme":
    case "archive_work_package":
    case "archive_site":
    case "archive_programmes_bulk":
    case "archive_work_packages_bulk":
    case "remove_sites_from_wp":
      return "destructive";
    default:
      return "cost";
  }
}

// Preview (shown to the user in the approval card) — synchronous, no I/O.
export function previewFor(tool: WriteToolName, input: unknown): string {
  const parsed = writeToolSchemas[tool].safeParse(input);
  if (!parsed.success) return `Invalid ${tool} input`;
  const p: any = parsed.data;
  switch (tool) {
    case "mark_stage_done_bulk":
      return `Mark stage **${p.stage_key}** DONE for ${p.site_ids.length} site${p.site_ids.length === 1 ? "" : "s"} in WP ${short(p.work_package_id)}${
        p.next_stage_recipient_user_ids.length
          ? ` and assign ${p.next_stage_recipient_user_ids.length} owner${p.next_stage_recipient_user_ids.length === 1 ? "" : "s"} to the next stage`
          : ""
      }.`;
    case "set_stage_status_bulk":
      return `Set stage **${p.stage_key}** to **${p.status}** for ${p.site_ids.length} site${p.site_ids.length === 1 ? "" : "s"} in WP ${short(p.work_package_id)}.`;
    case "assign_stage_owner":
      return `Assign owner/recipients to stage **${p.stage_key}** for ${p.site_ids.length} site${p.site_ids.length === 1 ? "" : "s"} in WP ${short(p.work_package_id)}.`;
    case "reassign_waiting_stage_owner":
      return `Reassign waiting stage **${p.stage_key}** for ${p.site_ids.length} site${p.site_ids.length === 1 ? "" : "s"} to owner ${short(p.new_owner_user_id)}.`;
    case "add_sites_to_wp":
      return `Attach ${p.site_ids.length} site${p.site_ids.length === 1 ? "" : "s"} to WP ${short(p.work_package_id)}.`;
    case "remove_sites_from_wp":
      return `⚠️ Remove ${p.site_ids.length} site${p.site_ids.length === 1 ? "" : "s"} from WP ${short(p.work_package_id)}. Destructive — confirm phrase required.`;
    case "queue_survey_for_sites":
      return `Queue a survey to **${p.surveyor_email}** for ${p.site_ids.length} site${p.site_ids.length === 1 ? "" : "s"}.`;
    case "update_site_fields":
      return `Update site ${short(p.site_id)}: ${Object.entries(p.fields).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(", ")}.`;
    case "archive_programme":
      return `⚠️ Archive programme ${short(p.programme_id)}. Reason: ${p.reason}.`;
    case "archive_work_package":
      return `⚠️ Archive work package ${short(p.work_package_id)}. Reason: ${p.reason}.`;
    case "archive_site":
      return `⚠️ Archive site ${short(p.site_id)}. Reason: ${p.reason}.`;
    case "archive_programmes_bulk":
      return `⚠️ Archive ${p.programme_ids.length} programme${p.programme_ids.length === 1 ? "" : "s"}. Reason: ${p.reason}. Confirm phrase required.`;
    case "archive_work_packages_bulk":
      return `⚠️ Archive ${p.work_package_ids.length} work package${p.work_package_ids.length === 1 ? "" : "s"}. Reason: ${p.reason}. Confirm phrase required.`;
  }
}

function short(id: string) {
  return id.slice(0, 8);
}

// Executor — runs the write on the caller-scoped Supabase client.
// RLS enforces that the caller can perform the write; if they can't, PostgREST
// returns an error that we forward verbatim.
export async function executeWriteTool(
  supabase: SupabaseClient,
  tool: WriteToolName,
  rawInput: unknown,
): Promise<{ ok: true; result: any } | { ok: false; error: string }> {
  const parsed = writeToolSchemas[tool].safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const input: any = parsed.data;

  try {
    switch (tool) {
      case "mark_stage_done_bulk": {
        const { data, error } = await supabase.rpc("bulk_complete_stage_and_assign_next", {
          p_wp_id: input.work_package_id,
          p_site_ids: input.site_ids,
          p_stage: input.stage_key,
          p_next_recipient_user_ids: input.next_stage_recipient_user_ids,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { updated: input.site_ids.length, rpc: data ?? null } };
      }
      case "set_stage_status_bulk": {
        const today = new Date().toISOString().slice(0, 10);
        const failed: { site_id: string; message: string }[] = [];
        let updated = 0;
        for (const siteId of input.site_ids) {
          const { data: existing } = await supabase
            .from("site_stage_status")
            .select("actual_start_date")
            .eq("site_id", siteId)
            .eq("stage", input.stage_key)
            .maybeSingle();
          const payload: Record<string, any> = {
            work_package_id: input.work_package_id,
            site_id: siteId,
            stage: input.stage_key,
            workflow_status: input.status,
            blocked_reason: input.status === "blocked" ? (input.blocked_reason ?? null) : null,
          };
          if (input.status === "in_progress" && !existing?.actual_start_date) {
            payload.actual_start_date = today;
          }
          const { error } = await supabase.from("site_stage_status").upsert(payload, { onConflict: "site_id,stage" });
          if (error) {
            failed.push({ site_id: siteId, message: error.message });
          } else {
            updated++;
          }
        }
        return { ok: true, result: { updated, failed } };
      }
      case "assign_stage_owner": {
        const failed: { site_id: string; message: string }[] = [];
        let updated = 0;
        for (const siteId of input.site_ids) {
          const { error } = await supabase.from("site_stage_status").upsert({
            work_package_id: input.work_package_id,
            site_id: siteId,
            stage: input.stage_key,
            owner_id: input.owner_user_id ?? null,
            recipient_user_ids: input.recipient_user_ids,
          }, { onConflict: "site_id,stage" });
          if (error) {
            failed.push({ site_id: siteId, message: error.message });
          } else {
            updated++;
          }
        }
        return { ok: true, result: { updated, failed } };
      }
      case "reassign_waiting_stage_owner": {
        const failed: { site_id: string; message: string }[] = [];
        let updated = 0;
        for (const siteId of input.site_ids) {
          const { data: existing } = await supabase
            .from("site_stage_status")
            .select("workflow_status")
            .eq("site_id", siteId)
            .eq("stage", input.stage_key)
            .maybeSingle();
          if (!existing || (existing.workflow_status !== "in_progress" && existing.workflow_status !== "review")) {
            failed.push({ site_id: siteId, message: "Stage is not active; cannot reassign" });
            continue;
          }
          const { error } = await supabase.from("site_stage_status").upsert({
            work_package_id: input.work_package_id,
            site_id: siteId,
            stage: input.stage_key,
            owner_id: input.new_owner_user_id,
            recipient_user_ids: [input.new_owner_user_id],
          }, { onConflict: "site_id,stage" });
          if (error) {
            failed.push({ site_id: siteId, message: error.message });
          } else {
            updated++;
          }
        }
        return { ok: true, result: { updated, failed } };
      }
      case "add_sites_to_wp": {
        const rows = input.site_ids.map((site_id: string) => ({
          work_package_id: input.work_package_id,
          site_id,
        }));
        const { data, error } = await supabase
          .from("wp_sites")
          .upsert(rows, { onConflict: "work_package_id,site_id", ignoreDuplicates: true })
          .select("id, site_id");
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { attached: data?.length ?? 0 } };
      }
      case "remove_sites_from_wp": {
        const expected = `remove ${input.site_ids.length} sites`;
        if (input.confirm_phrase.trim().toLowerCase() !== expected) {
          return {
            ok: false,
            error: `Confirm phrase must be exactly "${expected}"`,
          };
        }
        const { data, error } = await supabase
          .from("wp_sites")
          .delete()
          .eq("work_package_id", input.work_package_id)
          .in("site_id", input.site_ids)
          .select("id");
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { removed: data?.length ?? 0 } };
      }
      case "queue_survey_for_sites": {
        const { data: userRes } = await supabase.auth.getUser();
        const sent_by = userRes?.user?.id ?? null;
        const rows = input.site_ids.map((site_id: string) => ({
          site_id,
          token: crypto.randomUUID().replace(/-/g, ""),
          sent_to_email: input.surveyor_email,
          sent_to_name: input.surveyor_name ?? null,
          message: input.message ?? null,
          sent_by,
          status: "pending",
          expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        }));
        const { data, error } = await supabase.from("site_surveys").insert(rows).select("id, site_id, token");
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { queued: data?.length ?? 0, surveys: data } };
      }
      case "update_site_fields": {
        const { data, error } = await supabase
          .from("sites")
          .update({ ...input.fields, updated_at: new Date().toISOString() })
          .eq("id", input.site_id)
          .select("id, site_name, postcode, client_site_code, proposed_kw, socket_count, blocker_reason")
          .maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: "Site not found or not editable by you" };
        return { ok: true, result: { site: data } };
      }
      case "archive_programme": {
        const { data, error } = await supabase.rpc("archive_entity", {
          _entity_type: "programme", _entity_id: input.programme_id, _reason: input.reason,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { archive_id: data } };
      }
      case "archive_work_package": {
        const { data, error } = await supabase.rpc("archive_entity", {
          _entity_type: "work_package", _entity_id: input.work_package_id, _reason: input.reason,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { archive_id: data } };
      }
      case "archive_site": {
        const { data, error } = await supabase.rpc("archive_entity", {
          _entity_type: "site", _entity_id: input.site_id, _reason: input.reason,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { archive_id: data } };
      }
      case "archive_programmes_bulk": {
        const expected = `archive ${input.programme_ids.length} programmes`;
        if (input.confirm_phrase.trim().toLowerCase() !== expected) {
          return { ok: false, error: `Confirm phrase must be exactly "${expected}"` };
        }
        const results: { id: string; archive_id?: string; error?: string }[] = [];
        for (const id of input.programme_ids) {
          const { data, error } = await supabase.rpc("archive_entity", {
            _entity_type: "programme", _entity_id: id, _reason: input.reason,
          });
          results.push(error ? { id, error: error.message } : { id, archive_id: data as string });
        }
        const ok = results.filter((r) => !r.error).length;
        return { ok: true, result: { archived: ok, failed: results.length - ok, results } };
      }
      case "archive_work_packages_bulk": {
        const expected = `archive ${input.work_package_ids.length} work packages`;
        if (input.confirm_phrase.trim().toLowerCase() !== expected) {
          return { ok: false, error: `Confirm phrase must be exactly "${expected}"` };
        }
        const results: { id: string; archive_id?: string; error?: string }[] = [];
        for (const id of input.work_package_ids) {
          const { data, error } = await supabase.rpc("archive_entity", {
            _entity_type: "work_package", _entity_id: id, _reason: input.reason,
          });
          results.push(error ? { id, error: error.message } : { id, archive_id: data as string });
        }
        const ok = results.filter((r) => !r.error).length;
        return { ok: true, result: { archived: ok, failed: results.length - ok, results } };
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const WRITE_TOOL_NAMES = Object.keys(writeToolSchemas) as WriteToolName[];
