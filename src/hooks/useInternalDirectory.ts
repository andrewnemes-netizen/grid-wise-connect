import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type InternalUser = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  org_id: string;
  org_name: string;
};

/**
 * Returns every profile that belongs to an organisation flagged as `internal`
 * (EcoPower and any future internal orgs). Cached org-wide so pickers can be
 * mounted without a wp_team lookup.
 */
export function useInternalDirectory() {
  return useQuery({
    queryKey: ["internal-directory"],
    staleTime: 60_000,
    queryFn: async (): Promise<InternalUser[]> => {
      const { data: orgs, error: orgErr } = await (supabase as any)
        .from("organisations")
        .select("id, name, org_type")
        .eq("org_type", "internal");
      if (orgErr) throw orgErr;
      const orgIds = (orgs ?? []).map((o: any) => o.id);
      if (orgIds.length === 0) return [];
      const orgById = new Map((orgs ?? []).map((o: any) => [o.id, o]));

      const { data: mems, error: memErr } = await (supabase as any)
        .from("org_members")
        .select("user_id, org_id")
        .in("org_id", orgIds);
      if (memErr) throw memErr;
      const userIds = Array.from(new Set((mems ?? []).map((m: any) => m.user_id)));
      if (userIds.length === 0) return [];

      const { data: profs, error: profErr } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      if (profErr) throw profErr;
      const profById = new Map<string, any>((profs ?? []).map((p: any) => [p.user_id, p]));

      const rows: InternalUser[] = (mems ?? []).map((m: any) => {
        const p = profById.get(m.user_id);
        const org = orgById.get(m.org_id) as any;
        return {
          user_id: m.user_id,
          full_name: p?.full_name ?? null,
          email: null,
          org_id: m.org_id,
          org_name: org?.name ?? "Internal",
        };
      });
      // dedupe by user_id (in case a user is in multiple internal orgs)
      const seen = new Set<string>();
      return rows
        .filter((r) => (seen.has(r.user_id) ? false : (seen.add(r.user_id), true)))
        .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
    },
  });
}