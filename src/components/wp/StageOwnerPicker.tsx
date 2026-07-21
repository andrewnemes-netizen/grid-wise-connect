import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInternalDirectory } from "@/hooks/useInternalDirectory";

type Props = {
  wpId: string;
  value: string | null;
  onChange: (userId: string | null) => void;
  /** Optional label above the picker. */
  label?: string;
};

/**
 * Explicit stage-owner picker. Lists WP team members joined to their profile.
 * No default is ever pre-selected — the user picks an owner when ready, and
 * the database trigger (notify_stage_owner_assignment) fires the notification.
 */
export function StageOwnerPicker({ wpId, value, onChange, label = "Stage owner" }: Props) {
  const { data: members = [], isLoading } = useQuery({
    queryKey: ["wp-team-members", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wp_team")
        .select("user_id, team_role, profiles:profiles!wp_team_user_id_fkey(id, full_name, email)")
        .eq("work_package_id", wpId);
      if (error) {
        // Fallback: query without FK alias
        const { data: raw } = await (supabase as any)
          .from("wp_team")
          .select("user_id, team_role")
          .eq("work_package_id", wpId);
        const ids = (raw ?? []).map((r: any) => r.user_id);
        if (!ids.length) return [];
        const { data: profs } = await (supabase as any)
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
        return (raw ?? []).map((r: any) => ({
          user_id: r.user_id,
          team_role: r.team_role,
          profiles: map.get(r.user_id),
        }));
      }
      return data ?? [];
    },
  });
  const { data: internal = [] } = useInternalDirectory();

  // Union: WP team first, then internal-directory users not already listed.
  const teamIds = new Set((members as any[]).map((m: any) => m.user_id));
  const combined = [
    ...(members as any[]).map((m: any) => ({
      user_id: m.user_id,
      name: m.profiles?.full_name || m.profiles?.email || m.user_id,
      badge: m.team_role || null,
      internal: false,
    })),
    ...internal
      .filter((u) => !teamIds.has(u.user_id))
      .map((u) => ({
        user_id: u.user_id,
        name: u.full_name || u.email || u.user_id,
        badge: "Internal",
        internal: true,
      })),
  ];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[11px]"
            onClick={() => onChange(null)}
          >
            Unassign
          </Button>
        )}
      </div>
      <Select value={value ?? "__unassigned"} onValueChange={(v) => onChange(v === "__unassigned" ? null : v)}>
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? "Loading…" : "Pick an owner"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unassigned">
            <span className="text-muted-foreground">Unassigned — no notification will fire</span>
          </SelectItem>
          {combined.map((m) => (
            <SelectItem key={m.user_id} value={m.user_id}>
              <span className="flex items-center gap-2">
                <span>{m.name}</span>
                {m.badge && (
                  <Badge variant={m.internal ? "secondary" : "outline"} className="text-[10px]">
                    {m.badge}
                  </Badge>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isLoading && combined.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No team members or internal users available yet.
        </p>
      )}
    </div>
  );
}