
-- Site utilisation data from NPG
CREATE TABLE public.site_utilisation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL,
  site_id TEXT UNIQUE NOT NULL,
  ams_site_asset_id TEXT,
  transformer_id TEXT,
  substation_type TEXT,
  licence_area TEXT,
  loadings_data_source TEXT,
  max_demand_kw NUMERIC,
  connected_customers INT,
  firm_capacity_kw NUMERIC,
  transformer_headroom_kw NUMERIC,
  headroom_band TEXT,
  utilisation_pct INT,
  utilisation_band TEXT,
  substation_class TEXT,
  three_phase TEXT,
  upstream_site TEXT,
  site_easting NUMERIC,
  site_northing NUMERIC,
  site_band TEXT,
  geo_point TEXT,
  msoa_name TEXT,
  msoa_code TEXT,
  lsoa_name TEXT,
  lsoa_code TEXT,
  local_authority TEXT,
  local_authority_code TEXT,
  ward_name TEXT,
  ward_code TEXT,
  geom geometry(Geometry, 27700),
  attrs_json JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.site_utilisation ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_site_utilisation_geom ON public.site_utilisation USING GIST (geom);
CREATE INDEX idx_site_utilisation_band ON public.site_utilisation (site_band);
CREATE INDEX idx_site_utilisation_util ON public.site_utilisation (utilisation_band);

-- RLS: engineers and admins can read
CREATE POLICY "Engineers can read site_utilisation" ON public.site_utilisation FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can read site_utilisation" ON public.site_utilisation FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage site_utilisation" ON public.site_utilisation FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
-- Clients can see limited view (utilisation band, headroom band only - handled in edge function)
CREATE POLICY "Authenticated can read site_utilisation" ON public.site_utilisation FOR SELECT TO authenticated USING (true);

-- Add to allowed tables in get_layer_geojson function
CREATE OR REPLACE FUNCTION public.get_layer_geojson(
  _table_name TEXT,
  _bbox_filter TEXT DEFAULT '',
  _limit INT DEFAULT 5000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  query TEXT;
BEGIN
  IF _table_name NOT IN (
    'feeders_ehv', 'feeders_hv_33kv', 'feeders_hv_66kv',
    'primary_substations_33kv', 'primary_substations_66kv',
    'cables_hv_ug_capacity', 'cables_ehv_ug_capacity',
    'ndp_projects', 'highway_widths', 'wayleaves',
    'site_utilisation'
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  query := format(
    'SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        ''type'', ''Feature'',
        ''geometry'', ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb,
        ''properties'', to_jsonb(t.*) - ''geom'' - ''attrs_json''
      )
    ), ''[]''::jsonb)
    FROM (
      SELECT * FROM %I
      WHERE geom IS NOT NULL %s
      LIMIT %s
    ) t',
    _table_name,
    _bbox_filter,
    _limit
  );

  EXECUTE query INTO result;
  RETURN result;
END;
$$;
