import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerMembership } from "@/hooks/usePartnerMembership";

export interface PartnerWorkPackage {
  id: string;
  code: string | null;
  name: string | null;
  status: string | null;
}

export function usePartnerWorkPackages() {
  const { partnerIds, loading: memLoading } = usePartnerMembership();
  const [wps, setWps] = useState<PartnerWorkPackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (memLoading) return;
    if (partnerIds.length === 0) {
      setWps([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: allocs } = await supabase
        .from("wp_partner_allocations")
        .select("work_package_id")
        .in("partner_id", partnerIds);
      const wpIds = Array.from(new Set((allocs ?? []).map((a) => a.work_package_id).filter(Boolean))) as string[];
      if (wpIds.length === 0) {
        if (!cancelled) {
          setWps([]);
          setLoading(false);
        }
        return;
      }
      const { data: rows } = await supabase
        .from("work_packages")
        .select("id, code, name, status")
        .in("id", wpIds)
        .order("code", { ascending: true });
      if (!cancelled) {
        setWps((rows ?? []) as PartnerWorkPackage[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerIds.join(","), memLoading]);

  const ids = useMemo(() => wps.map((w) => w.id), [wps]);
  return { workPackages: wps, workPackageIds: ids, loading };
}