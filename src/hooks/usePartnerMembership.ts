import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PartnerMembership {
  loading: boolean;
  isPartner: boolean;
  partnerIds: string[];
}

export function usePartnerMembership(): PartnerMembership {
  const { user } = useAuth();
  const [state, setState] = useState<PartnerMembership>({
    loading: true,
    isPartner: false,
    partnerIds: [],
  });

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setState({ loading: false, isPartner: false, partnerIds: [] });
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("partner_users")
        .select("partner_id")
        .eq("user_id", user.id);
      if (cancelled) return;
      if (error || !data) {
        setState({ loading: false, isPartner: false, partnerIds: [] });
        return;
      }
      const ids = Array.from(new Set(data.map((r) => r.partner_id).filter(Boolean))) as string[];
      setState({ loading: false, isPartner: ids.length > 0, partnerIds: ids });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return state;
}