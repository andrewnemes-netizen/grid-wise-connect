import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_UNIT_RATES, type UnitRates } from "@/lib/connectionCosts";

export function useUnitRates() {
  return useQuery<UnitRates>({
    queryKey: ["unit-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unit_rates")
        .select("*")
        .limit(1)
        .single();
      if (error || !data) return DEFAULT_UNIT_RATES;
      return {
        cable_lv_per_m: Number(data.cable_lv_per_m),
        cable_hv_per_m: Number(data.cable_hv_per_m),
        cable_ehv_per_m: Number(data.cable_ehv_per_m),
        excavation_footway_per_m: Number(data.excavation_footway_per_m),
        excavation_carriageway_per_m: Number(data.excavation_carriageway_per_m),
        excavation_verge_per_m: Number(data.excavation_verge_per_m),
        jointing_each: Number(data.jointing_each),
        jointing_lv_each: Number(data.jointing_lv_each),
        switchgear_ring_main: Number(data.switchgear_ring_main),
        switchgear_circuit_breaker: Number(data.switchgear_circuit_breaker),
        transformer_500kva: Number(data.transformer_500kva),
        transformer_1000kva: Number(data.transformer_1000kva),
        transformer_1500kva: Number(data.transformer_1500kva),
        metering_ct: Number(data.metering_ct),
        metering_wc: Number(data.metering_wc),
        feeder_pillar_each: Number(data.feeder_pillar_each),
        cutout_100a_3ph: Number(data.cutout_100a_3ph),
        design_fee_pct: Number(data.design_fee_pct),
        project_management_pct: Number(data.project_management_pct),
        contingency_pct: Number(data.contingency_pct),
        reinforcement_per_kw_over_capacity: Number(data.reinforcement_per_kw_over_capacity),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
