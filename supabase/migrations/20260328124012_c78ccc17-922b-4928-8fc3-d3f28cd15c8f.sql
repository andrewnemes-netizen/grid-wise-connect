
-- Fix Site Utilisation Forecast to use site_utilisation table
UPDATE layer_registry 
SET storage_table = 'site_utilisation', 
    feature_count = (SELECT count(*) FROM site_utilisation WHERE geom IS NOT NULL)
WHERE slug = 'npg_site_utilisation_forecast';

-- Disable layers that have zero data to avoid confusion
UPDATE layer_registry 
SET enabled = false 
WHERE slug IN (
  'npg_dfes_primary_forecasts',
  'npg_ndp_generation_headroom', 
  'npg_hv_oh_feeders',
  'npg_idno_zones',
  'npg_substation_sites'
) AND feature_count = 0;
