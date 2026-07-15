import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Resolve a Gridwise OS feature flag. Precedence: user > org > global.
 * Returns true if any matching enabled row is found.
 */
export function useFeatureFlag(flagKey: string): { enabled: boolean; loading: boolean } {
  const { user, orgId } = useAuth() as { user: { id: string } | null; orgId?: string | null };
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("feature_flags")
          .select("scope, enabled, user_id, org_id")
          .eq("flag_key", flagKey);
        if (error || cancelled) {
          if (!cancelled) setEnabled(false);
          return;
        }
        const rows = data ?? [];
        const userRow = user ? rows.find((r) => r.scope === "user" && r.user_id === user.id) : undefined;
        if (userRow) return void setEnabled(!!userRow.enabled);
        const orgRow = orgId ? rows.find((r) => r.scope === "org" && r.org_id === orgId) : undefined;
        if (orgRow) return void setEnabled(!!orgRow.enabled);
        const globalRow = rows.find((r) => r.scope === "global");
        setEnabled(globalRow ? !!globalRow.enabled : false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flagKey, user?.id, orgId]);

  return { enabled, loading };
}