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
        duct_per_m: Number(data.duct_per_m),
        excavation_footway_per_m: Number(data.excavation_footway_per_m),
        excavation_carriageway_per_m: Number(data.excavation_carriageway_per_m),
        excavation_verge_per_m: Number(data.excavation_verge_per_m),
        jointing_each: Number(data.jointing_each),
        jointing_lv_each: Number(data.jointing_lv_each),
        termination_each: Number(data.termination_each),
        switchgear_ring_main: Number(data.switchgear_ring_main),
        switchgear_circuit_breaker: Number(data.switchgear_circuit_breaker),
        transformer_500kva: Number(data.transformer_500kva),
        transformer_1000kva: Number(data.transformer_1000kva),
        transformer_1500kva: Number(data.transformer_1500kva),
        metering_ct: Number(data.metering_ct),
        metering_wc: Number(data.metering_wc),
        feeder_pillar_each: Number(data.feeder_pillar_each),
        cutout_100a_3ph: Number(data.cutout_100a_3ph),
        earthing_lot: Number(data.earthing_lot),
        transformer_plinth_each: Number(data.transformer_plinth_each),
        cable_marker_tape_per_m: Number(data.cable_marker_tape_per_m),
        design_fee_pct: Number(data.design_fee_pct),
        project_management_pct: Number(data.project_management_pct),
        contingency_pct: Number(data.contingency_pct),
        reinforcement_per_kw_over_capacity: Number(data.reinforcement_per_kw_over_capacity),
        // SOR rates
        lv_joint_team_day: Number((data as any).lv_joint_team_day) || DEFAULT_UNIT_RATES.lv_joint_team_day,
        joint_bay_soft: Number((data as any).joint_bay_soft) || DEFAULT_UNIT_RATES.joint_bay_soft,
        joint_bay_footway: Number((data as any).joint_bay_footway) || DEFAULT_UNIT_RATES.joint_bay_footway,
        joint_bay_carriageway: Number((data as any).joint_bay_carriageway) || DEFAULT_UNIT_RATES.joint_bay_carriageway,
        cable_joint_kit_185mm: Number((data as any).cable_joint_kit_185mm) || DEFAULT_UNIT_RATES.cable_joint_kit_185mm,
        cable_joint_kit_pot_end: Number((data as any).cable_joint_kit_pot_end) || DEFAULT_UNIT_RATES.cable_joint_kit_pot_end,
        service_cable_35mm_per_m: Number((data as any).service_cable_35mm_per_m) || DEFAULT_UNIT_RATES.service_cable_35mm_per_m,
        mains_extension_threshold_m: Number((data as any).mains_extension_threshold_m) || DEFAULT_UNIT_RATES.mains_extension_threshold_m,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
