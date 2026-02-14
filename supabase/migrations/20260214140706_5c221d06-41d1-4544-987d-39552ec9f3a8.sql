
-- ============================================================
-- LAYER REGISTRY — catalogue of every uploaded dataset
-- ============================================================
CREATE TABLE public.layer_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,                        -- machine name e.g. "npg_hv_substations"
  display_name text NOT NULL,                       -- human label e.g. "HV Substations (Utilisation)"
  dno text NOT NULL,                                -- e.g. NPG, UKPN, ENWL, SSEN, SPEN, WPD
  category text NOT NULL,                           -- e.g. substations, feeders, cables, constraints, points, polygons
  subcategory text,                                 -- optional finer grouping e.g. "33kv", "ehv"
  geometry_type text NOT NULL DEFAULT 'Point',      -- Point, LineString, Polygon, MultiLineString, etc.
  storage_table text NOT NULL,                      -- which geo_* table stores this layer's features
  style_json jsonb NOT NULL DEFAULT '{}'::jsonb,    -- MapLibre paint/layout config
  legend_json jsonb NOT NULL DEFAULT '[]'::jsonb,   -- legend entries [{label, color, icon}]
  bbox jsonb,                                       -- [minLng, minLat, maxLng, maxLat] for viewport filtering
  min_zoom numeric DEFAULT 8,                       -- don't load below this zoom
  max_zoom numeric DEFAULT 18,
  feature_count integer DEFAULT 0,
  source_date date,
  attribution text,
  visible_by_default boolean DEFAULT false,
  enabled boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_layer_registry_dno ON public.layer_registry(dno);
CREATE INDEX idx_layer_registry_category ON public.layer_registry(category);
CREATE INDEX idx_layer_registry_enabled ON public.layer_registry(enabled);

ALTER TABLE public.layer_registry ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the registry (needed to build layer tree)
CREATE POLICY "Authenticated can read layer_registry"
  ON public.layer_registry FOR SELECT TO authenticated USING (true);

-- Only admins can manage
CREATE POLICY "Admins can manage layer_registry"
  ON public.layer_registry FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- GEO_SUBSTATIONS — Point features (HV subs, primary subs, BSPs)
-- ============================================================
CREATE TABLE public.geo_substations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id uuid NOT NULL REFERENCES public.layer_registry(id) ON DELETE CASCADE,
  dno text NOT NULL,
  asset_id text,
  name text,
  voltage_kv numeric,
  status text DEFAULT 'unknown',
  capacity_kw numeric,
  demand_kw numeric,
  headroom_kw numeric,
  utilisation_pct numeric,
  attrs_json jsonb DEFAULT '{}'::jsonb,
  geom geometry(Point, 4326),
  source_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_geo_substations_layer ON public.geo_substations(layer_id);
CREATE INDEX idx_geo_substations_dno ON public.geo_substations(dno);
CREATE INDEX idx_geo_substations_geom ON public.geo_substations USING GIST(geom);

ALTER TABLE public.geo_substations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read geo_substations"
  ON public.geo_substations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage geo_substations"
  ON public.geo_substations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- GEO_FEEDERS — LineString features (HV/EHV feeders)
-- ============================================================
CREATE TABLE public.geo_feeders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id uuid NOT NULL REFERENCES public.layer_registry(id) ON DELETE CASCADE,
  dno text NOT NULL,
  asset_id text,
  name text,
  feeder_ref text,
  voltage_kv numeric,
  status text DEFAULT 'unknown',
  attrs_json jsonb DEFAULT '{}'::jsonb,
  geom geometry(MultiLineString, 4326),
  source_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_geo_feeders_layer ON public.geo_feeders(layer_id);
CREATE INDEX idx_geo_feeders_dno ON public.geo_feeders(dno);
CREATE INDEX idx_geo_feeders_geom ON public.geo_feeders USING GIST(geom);

ALTER TABLE public.geo_feeders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read geo_feeders"
  ON public.geo_feeders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage geo_feeders"
  ON public.geo_feeders FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- GEO_CABLES — LineString features with capacity data
-- ============================================================
CREATE TABLE public.geo_cables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id uuid NOT NULL REFERENCES public.layer_registry(id) ON DELETE CASCADE,
  dno text NOT NULL,
  asset_id text,
  name text,
  voltage_kv numeric,
  capacity_value numeric,
  capacity_unit text,
  capacity_flag text DEFAULT 'unknown',
  status text DEFAULT 'unknown',
  attrs_json jsonb DEFAULT '{}'::jsonb,
  geom geometry(MultiLineString, 4326),
  source_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_geo_cables_layer ON public.geo_cables(layer_id);
CREATE INDEX idx_geo_cables_dno ON public.geo_cables(dno);
CREATE INDEX idx_geo_cables_geom ON public.geo_cables USING GIST(geom);

ALTER TABLE public.geo_cables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read geo_cables"
  ON public.geo_cables FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage geo_cables"
  ON public.geo_cables FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- GEO_CONSTRAINTS — Polygon/Line features (wayleaves, NDP, highways)
-- ============================================================
CREATE TABLE public.geo_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id uuid NOT NULL REFERENCES public.layer_registry(id) ON DELETE CASCADE,
  dno text NOT NULL,
  asset_id text,
  name text,
  constraint_type text,          -- wayleave, ndp, highway_width, planning, etc.
  status text DEFAULT 'unknown',
  attrs_json jsonb DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326), -- accepts any geometry type
  source_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_geo_constraints_layer ON public.geo_constraints(layer_id);
CREATE INDEX idx_geo_constraints_dno ON public.geo_constraints(dno);
CREATE INDEX idx_geo_constraints_geom ON public.geo_constraints USING GIST(geom);

ALTER TABLE public.geo_constraints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read geo_constraints"
  ON public.geo_constraints FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage geo_constraints"
  ON public.geo_constraints FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- GEO_POINTS — Generic point datasets
-- ============================================================
CREATE TABLE public.geo_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id uuid NOT NULL REFERENCES public.layer_registry(id) ON DELETE CASCADE,
  dno text NOT NULL,
  asset_id text,
  name text,
  attrs_json jsonb DEFAULT '{}'::jsonb,
  geom geometry(Point, 4326),
  source_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_geo_points_layer ON public.geo_points(layer_id);
CREATE INDEX idx_geo_points_dno ON public.geo_points(dno);
CREATE INDEX idx_geo_points_geom ON public.geo_points USING GIST(geom);

ALTER TABLE public.geo_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read geo_points"
  ON public.geo_points FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage geo_points"
  ON public.geo_points FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- GEO_POLYGONS — Generic polygon datasets (licence areas, zones)
-- ============================================================
CREATE TABLE public.geo_polygons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id uuid NOT NULL REFERENCES public.layer_registry(id) ON DELETE CASCADE,
  dno text NOT NULL,
  asset_id text,
  name text,
  attrs_json jsonb DEFAULT '{}'::jsonb,
  geom geometry(MultiPolygon, 4326),
  source_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_geo_polygons_layer ON public.geo_polygons(layer_id);
CREATE INDEX idx_geo_polygons_dno ON public.geo_polygons(dno);
CREATE INDEX idx_geo_polygons_geom ON public.geo_polygons USING GIST(geom);

ALTER TABLE public.geo_polygons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read geo_polygons"
  ON public.geo_polygons FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage geo_polygons"
  ON public.geo_polygons FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- UPDATED_AT TRIGGER for layer_registry
-- ============================================================
CREATE TRIGGER update_layer_registry_updated_at
  BEFORE UPDATE ON public.layer_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
