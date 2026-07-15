import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Fetch a map of site_id -> { site_name, postcode } for the provided ids. */
export function useSitesMap(siteIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(siteIds.filter(Boolean))) as string[];
  const key = ids.sort().join(",");
  const [map, setMap] = useState<Record<string, { site_name: string | null; postcode: string | null }>>({});

  useEffect(() => {
    let cancelled = false;
    if (ids.length === 0) {
      setMap({});
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, site_name, postcode")
        .in("id", ids);
      if (cancelled || error || !data) return;
      const next: Record<string, { site_name: string | null; postcode: string | null }> = {};
      for (const s of data as any[]) next[s.id] = { site_name: s.site_name, postcode: s.postcode };
      setMap(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}

/** Attach { sites: { site_name, postcode } } to each row based on row.site_id. */
export function attachSites<T extends { site_id?: string | null }>(
  rows: T[],
  map: Record<string, { site_name: string | null; postcode: string | null }>
): (T & { sites: { site_name: string | null; postcode: string | null } | null })[] {
  return rows.map((r) => ({
    ...r,
    sites: r.site_id ? map[r.site_id] ?? null : null,
  }));
}