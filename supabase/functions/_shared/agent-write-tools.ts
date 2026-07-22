// Shared spec for Gridwise Assistant WRITE tools.
// The assistant edge function declares these to the model WITHOUT `execute`
// so every call arrives at the client as a proposal that requires human
// approval. On approval the client posts to `gridwise-agent-execute`, which
// runs the corresponding branch below as the signed-in user (RLS enforced).
import { z } from "npm:zod@^3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type WriteToolName =
  | "mark_stage_done_bulk"
  | "add_sites_to_wp"
  | "remove_sites_from_wp"
  | "queue_survey_for_sites"
  | "update_site_fields";

// Zod schemas — mirrored client-side via the tool call payload.
export const writeToolSchemas = {
  mark_stage_done_bulk: z.object({
    work_package_id: z.string().uuid(),
    site_ids: z.array(z.string().uuid()).min(1).max(200),
    stage_key: z.string().min(1),
    next_stage_recipient_user_ids: z.array(z.string().uuid()).default([]),
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
} as const;

// Human-readable tool descriptions for the model.
export const writeToolDescriptions: Record<WriteToolName, string> = {
  mark_stage_done_bulk:
    "Mark a Pre-Con stage as DONE for one or more sites in a work package, and optionally assign owners for the NEXT stage. Requires human approval. Use exact stage_key from stage_definitions (e.g. 'poc_application').",
  add_sites_to_wp:
    "Attach existing sites to a work package. Requires human approval. Does not create sites.",
  remove_sites_from_wp:
    "Detach sites from a work package. DESTRUCTIVE. Requires human approval and an explicit confirm_phrase 'remove N sites' matching the count.",
  queue_survey_for_sites:
    "Create pending survey invitations for one or more sites and email the surveyor. Requires human approval.",
  update_site_fields:
    "Edit editable metadata on a site (name, postcode, client code, proposed kW, socket count, blocker reason). Requires human approval.",
};

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
    case "add_sites_to_wp":
      return `Attach ${p.site_ids.length} site${p.site_ids.length === 1 ? "" : "s"} to WP ${short(p.work_package_id)}.`;
    case "remove_sites_from_wp":
      return `⚠️ Remove ${p.site_ids.length} site${p.site_ids.length === 1 ? "" : "s"} from WP ${short(p.work_package_id)}. Destructive — confirm phrase required.`;
    case "queue_survey_for_sites":
      return `Queue a survey to **${p.surveyor_email}** for ${p.site_ids.length} site${p.site_ids.length === 1 ? "" : "s"}.`;
    case "update_site_fields":
      return `Update site ${short(p.site_id)}: ${Object.entries(p.fields).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(", ")}.`;
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
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const WRITE_TOOL_NAMES = Object.keys(writeToolSchemas) as WriteToolName[];