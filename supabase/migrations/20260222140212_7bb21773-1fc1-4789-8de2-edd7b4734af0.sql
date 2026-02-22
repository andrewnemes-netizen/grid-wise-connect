
-- EV Hub Rulesets table for versioned rule storage
CREATE TABLE public.ev_hub_rulesets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dno_key TEXT NOT NULL,
  rule_set_id TEXT NOT NULL DEFAULT 'DNO_EV_HUB_V1',
  version TEXT NOT NULL DEFAULT 'v1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.ev_hub_rulesets ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage ev_hub_rulesets"
  ON public.ev_hub_rulesets
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated read access
CREATE POLICY "Authenticated can read ev_hub_rulesets"
  ON public.ev_hub_rulesets
  FOR SELECT
  USING (true);

-- Index for efficient lookup
CREATE INDEX idx_ev_hub_rulesets_lookup ON public.ev_hub_rulesets (dno_key, rule_set_id, is_active);

-- Insert UK_ALL baseline ruleset
INSERT INTO public.ev_hub_rulesets (dno_key, rule_set_id, version, is_active, rules_json)
VALUES (
  'UK_ALL',
  'DNO_EV_HUB_V1',
  'v1',
  true,
  '{
    "lv_max_demand_kva": {"value": 276, "confidence": "HIGH", "source": "UK_baseline", "pending": false},
    "service_cable_default": {"value": "pending", "confidence": "LOW", "source": "UK_baseline", "pending": true},
    "lv_main_cables": {"value": [], "confidence": "LOW", "source": "UK_baseline", "pending": true},
    "cover_depths_mm": {"value": {"footway": 450, "carriageway": 600, "verge": 450}, "confidence": "MEDIUM", "source": "UK_baseline", "pending": false},
    "extraneous_distance_threshold_m": {"value": 2.5, "confidence": "HIGH", "source": "UK_baseline", "pending": false},
    "headroom_factor": {"value": null, "confidence": "LOW", "source": "UK_baseline", "pending": true},
    "fault_level_thresholds": {"value": null, "confidence": "LOW", "source": "UK_baseline", "pending": true},
    "transformer_loading_thresholds": {"value": null, "confidence": "LOW", "source": "UK_baseline", "pending": true},
    "reinforcement_mitigation_sequence": {"value": [], "confidence": "LOW", "source": "UK_baseline", "pending": true},
    "cable_scoring_weights": {"value": {"distance": 0.4, "capacity": 0.3, "age": 0.15, "accessibility": 0.15}, "confidence": "MEDIUM", "source": "UK_baseline", "pending": false},
    "protection_grading": {"value": null, "confidence": "LOW", "source": "UK_baseline", "pending": true},
    "traffic_management_rules": {"value": {"carriageway_requires_tm": true, "footway_requires_tm": false}, "confidence": "MEDIUM", "source": "UK_baseline", "pending": false}
  }'::jsonb
);
