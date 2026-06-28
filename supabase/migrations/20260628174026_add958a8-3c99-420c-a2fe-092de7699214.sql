-- Repoint the misleading "UKPN Substations" layer to reflect what it actually contains:
-- UKPN half-hourly smart meter feeder usage readings (not a substation register).
-- The actual substation registers are already exposed via:
--   * uk_power_networks_grid_and_primary_sites (3,014 rows)
--   * uk_power_networks_secondary_sites (88,745 rows)

UPDATE public.layer_registry
SET
  slug = 'ukpn-smart-meter-feeder-usage',
  display_name = 'UKPN Smart Meter Feeder Usage (½-hourly)',
  category = 'Low Carbon',
  subcategory = 'Smart Meter',
  visible_by_default = false,
  updated_at = now()
WHERE id = '1c96f8c5-059b-41d1-a928-6d3b03c9170a';