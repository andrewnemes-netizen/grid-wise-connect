
-- 1. Disable stale legacy duplicates (lowercase-slug rows shadowed by canonical SPEN entries)
UPDATE layer_registry
SET enabled = false, updated_at = now()
WHERE slug IN ('point_assets', 'spen_substation', 'spen_line_asset', 'historic_substation_utilisation');

-- 2. Normalise category casing so 'substations' and 'Substations' don't render as two separate groups
UPDATE layer_registry
SET category = 'Substations', updated_at = now()
WHERE category = 'substations';

UPDATE layer_registry
SET category = 'Cables', updated_at = now()
WHERE category = 'cables';

UPDATE layer_registry
SET category = 'Feeders', updated_at = now()
WHERE category = 'feeders';

UPDATE layer_registry
SET category = 'Points', updated_at = now()
WHERE category = 'points';

UPDATE layer_registry
SET category = 'Network', updated_at = now()
WHERE category = 'Network Assets';
