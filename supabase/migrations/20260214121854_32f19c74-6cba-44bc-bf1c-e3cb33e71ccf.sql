
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- 1) feeders_ehv
-- ============================================================
CREATE TABLE public.feeders_ehv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT UNIQUE NOT NULL,
  feeder_ref TEXT,
  voltage_kv NUMERIC,
  status TEXT DEFAULT 'unknown',
  source_date DATE,
  attrs_json JSONB DEFAULT '{}'::jsonb,
  geom geometry(LineString, 27700)
);
ALTER TABLE public.feeders_ehv ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_feeders_ehv_geom ON public.feeders_ehv USING GIST (geom);

CREATE POLICY "Engineers can read feeders_ehv" ON public.feeders_ehv FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can read feeders_ehv" ON public.feeders_ehv FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage feeders_ehv" ON public.feeders_ehv FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 2) feeders_hv_33kv
-- ============================================================
CREATE TABLE public.feeders_hv_33kv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT UNIQUE NOT NULL,
  feeder_ref TEXT,
  voltage_kv NUMERIC DEFAULT 33,
  status TEXT DEFAULT 'unknown',
  source_date DATE,
  attrs_json JSONB DEFAULT '{}'::jsonb,
  geom geometry(LineString, 27700)
);
ALTER TABLE public.feeders_hv_33kv ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_feeders_hv_33kv_geom ON public.feeders_hv_33kv USING GIST (geom);

CREATE POLICY "Engineers can read feeders_hv_33kv" ON public.feeders_hv_33kv FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can read feeders_hv_33kv" ON public.feeders_hv_33kv FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage feeders_hv_33kv" ON public.feeders_hv_33kv FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 3) feeders_hv_66kv
-- ============================================================
CREATE TABLE public.feeders_hv_66kv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT UNIQUE NOT NULL,
  feeder_ref TEXT,
  voltage_kv NUMERIC DEFAULT 66,
  status TEXT DEFAULT 'unknown',
  source_date DATE,
  attrs_json JSONB DEFAULT '{}'::jsonb,
  geom geometry(LineString, 27700)
);
ALTER TABLE public.feeders_hv_66kv ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_feeders_hv_66kv_geom ON public.feeders_hv_66kv USING GIST (geom);

CREATE POLICY "Engineers can read feeders_hv_66kv" ON public.feeders_hv_66kv FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can read feeders_hv_66kv" ON public.feeders_hv_66kv FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage feeders_hv_66kv" ON public.feeders_hv_66kv FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 4) primary_substations_33kv
-- ============================================================
CREATE TABLE public.primary_substations_33kv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT UNIQUE NOT NULL,
  name TEXT,
  voltage_kv NUMERIC DEFAULT 33,
  status TEXT DEFAULT 'unknown',
  source_date DATE,
  attrs_json JSONB DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 27700)
);
ALTER TABLE public.primary_substations_33kv ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_primary_substations_33kv_geom ON public.primary_substations_33kv USING GIST (geom);

CREATE POLICY "Engineers can read primary_substations_33kv" ON public.primary_substations_33kv FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can read primary_substations_33kv" ON public.primary_substations_33kv FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage primary_substations_33kv" ON public.primary_substations_33kv FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 5) primary_substations_66kv
-- ============================================================
CREATE TABLE public.primary_substations_66kv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT UNIQUE NOT NULL,
  name TEXT,
  voltage_kv NUMERIC DEFAULT 66,
  status TEXT DEFAULT 'unknown',
  source_date DATE,
  attrs_json JSONB DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 27700)
);
ALTER TABLE public.primary_substations_66kv ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_primary_substations_66kv_geom ON public.primary_substations_66kv USING GIST (geom);

CREATE POLICY "Engineers can read primary_substations_66kv" ON public.primary_substations_66kv FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can read primary_substations_66kv" ON public.primary_substations_66kv FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage primary_substations_66kv" ON public.primary_substations_66kv FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 6) cables_hv_ug_capacity
-- ============================================================
CREATE TABLE public.cables_hv_ug_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT UNIQUE NOT NULL,
  voltage_kv NUMERIC,
  capacity_value NUMERIC,
  capacity_unit TEXT DEFAULT 'unknown',
  capacity_flag TEXT DEFAULT 'unknown',
  status TEXT DEFAULT 'unknown',
  source_date DATE,
  attrs_json JSONB DEFAULT '{}'::jsonb,
  geom geometry(LineString, 27700)
);
ALTER TABLE public.cables_hv_ug_capacity ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cables_hv_ug_capacity_geom ON public.cables_hv_ug_capacity USING GIST (geom);

CREATE POLICY "Engineers can read cables_hv_ug_capacity" ON public.cables_hv_ug_capacity FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can read cables_hv_ug_capacity" ON public.cables_hv_ug_capacity FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage cables_hv_ug_capacity" ON public.cables_hv_ug_capacity FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 7) cables_ehv_ug_capacity
-- ============================================================
CREATE TABLE public.cables_ehv_ug_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT UNIQUE NOT NULL,
  voltage_kv NUMERIC,
  capacity_value NUMERIC,
  capacity_unit TEXT DEFAULT 'unknown',
  capacity_flag TEXT DEFAULT 'unknown',
  status TEXT DEFAULT 'unknown',
  source_date DATE,
  attrs_json JSONB DEFAULT '{}'::jsonb,
  geom geometry(LineString, 27700)
);
ALTER TABLE public.cables_ehv_ug_capacity ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cables_ehv_ug_capacity_geom ON public.cables_ehv_ug_capacity USING GIST (geom);

CREATE POLICY "Engineers can read cables_ehv_ug_capacity" ON public.cables_ehv_ug_capacity FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can read cables_ehv_ug_capacity" ON public.cables_ehv_ug_capacity FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage cables_ehv_ug_capacity" ON public.cables_ehv_ug_capacity FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 8) ndp_projects
-- ============================================================
CREATE TABLE public.ndp_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT UNIQUE NOT NULL,
  title TEXT,
  status TEXT DEFAULT 'unknown',
  planned_date DATE,
  source_date DATE,
  attrs_json JSONB DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 27700)
);
ALTER TABLE public.ndp_projects ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ndp_projects_geom ON public.ndp_projects USING GIST (geom);

CREATE POLICY "Engineers can read ndp_projects" ON public.ndp_projects FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can read ndp_projects" ON public.ndp_projects FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage ndp_projects" ON public.ndp_projects FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 9) highway_widths
-- ============================================================
CREATE TABLE public.highway_widths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id TEXT UNIQUE NOT NULL,
  footway_m NUMERIC,
  carriageway_m NUMERIC,
  restriction_flag TEXT DEFAULT 'unknown',
  source_date DATE,
  attrs_json JSONB DEFAULT '{}'::jsonb,
  geom geometry(LineString, 27700)
);
ALTER TABLE public.highway_widths ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_highway_widths_geom ON public.highway_widths USING GIST (geom);

CREATE POLICY "Engineers can read highway_widths" ON public.highway_widths FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can read highway_widths" ON public.highway_widths FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage highway_widths" ON public.highway_widths FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 10) wayleaves
-- ============================================================
CREATE TABLE public.wayleaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wayleave_id TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'unknown',
  owner TEXT,
  source_date DATE,
  attrs_json JSONB DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 27700)
);
ALTER TABLE public.wayleaves ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_wayleaves_geom ON public.wayleaves USING GIST (geom);

CREATE POLICY "Engineers can read wayleaves" ON public.wayleaves FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can read wayleaves" ON public.wayleaves FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage wayleaves" ON public.wayleaves FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 11) Recreate sites table with new schema
-- ============================================================
DROP TABLE IF EXISTS public.site_notes CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.sites CASCADE;

CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL,
  postcode TEXT,
  proposed_kw NUMERIC,
  site_type TEXT DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'new',
  score TEXT,
  score_reasons JSONB DEFAULT '[]'::jsonb,
  connection_options JSONB DEFAULT '[]'::jsonb,
  next_steps JSONB DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL,
  client_org TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  geom geometry(Geometry, 27700)
);
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sites_geom ON public.sites USING GIST (geom);
CREATE INDEX idx_sites_created_at ON public.sites (created_at);
CREATE INDEX idx_sites_score ON public.sites (score);
CREATE INDEX idx_sites_status ON public.sites (status);

-- Trigger for updated_at
CREATE TRIGGER update_sites_updated_at
  BEFORE UPDATE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: owner can CRUD own sites
CREATE POLICY "Users can view own sites" ON public.sites FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Users can insert own sites" ON public.sites FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update own sites" ON public.sites FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Users can delete own sites" ON public.sites FOR DELETE TO authenticated USING (auth.uid() = created_by);
-- Clients can see sites matching their org
CREATE POLICY "Clients can view org sites" ON public.sites FOR SELECT TO authenticated
  USING (
    client_org IS NOT NULL
    AND client_org = (SELECT company FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  );
-- Engineers and admins see all
CREATE POLICY "Engineers can view all sites" ON public.sites FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can view all sites" ON public.sites FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage all sites" ON public.sites FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 12) Recreate site_notes
-- ============================================================
CREATE TABLE public.site_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.site_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own notes" ON public.site_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can view notes on own sites" ON public.site_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sites WHERE sites.id = site_notes.site_id AND sites.created_by = auth.uid()));
CREATE POLICY "Engineers can view all notes" ON public.site_notes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Admins can view all notes" ON public.site_notes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 13) Recreate audit_log
-- ============================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  meta_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at);

CREATE POLICY "Admins can view audit log" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert audit log" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- Scoring function (PostGIS-based)
-- ============================================================
CREATE OR REPLACE FUNCTION public.score_site(
  _site_geom geometry,
  _proposed_kw NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dist_primary_33 NUMERIC;
  dist_primary_66 NUMERIC;
  dist_primary NUMERIC;
  dist_feeder_ehv NUMERIC;
  dist_feeder_33 NUMERIC;
  dist_feeder_66 NUMERIC;
  dist_feeder NUMERIC;
  dist_cable_hv NUMERIC;
  dist_cable_ehv NUMERIC;
  dist_capacity NUMERIC;
  cap_flag TEXT;
  ndp_intersect BOOLEAN;
  ndp_within_1000 BOOLEAN;
  wayleave_hit BOOLEAN;
  min_footway NUMERIC;
  min_carriageway NUMERIC;
  score TEXT;
  reasons JSONB := '[]'::jsonb;
  steps JSONB := '[]'::jsonb;
  site_buf geometry;
  corridor_buf geometry;
BEGIN
  -- Buffers: 50m around site for intersection, 100m corridor for highway checks
  site_buf := ST_Buffer(_site_geom, 50);
  corridor_buf := ST_Buffer(_site_geom, 100);

  -- Nearest primary substation (33kV)
  SELECT MIN(ST_Distance(_site_geom, geom)) INTO dist_primary_33 FROM primary_substations_33kv;
  -- Nearest primary substation (66kV)
  SELECT MIN(ST_Distance(_site_geom, geom)) INTO dist_primary_66 FROM primary_substations_66kv;
  dist_primary := LEAST(COALESCE(dist_primary_33, 999999), COALESCE(dist_primary_66, 999999));

  -- Nearest feeder
  SELECT MIN(ST_Distance(_site_geom, geom)) INTO dist_feeder_ehv FROM feeders_ehv;
  SELECT MIN(ST_Distance(_site_geom, geom)) INTO dist_feeder_33 FROM feeders_hv_33kv;
  SELECT MIN(ST_Distance(_site_geom, geom)) INTO dist_feeder_66 FROM feeders_hv_66kv;
  dist_feeder := LEAST(
    COALESCE(dist_feeder_ehv, 999999),
    COALESCE(dist_feeder_33, 999999),
    COALESCE(dist_feeder_66, 999999)
  );

  -- Nearest UG capacity segment
  SELECT MIN(ST_Distance(_site_geom, geom)) INTO dist_cable_hv FROM cables_hv_ug_capacity;
  SELECT MIN(ST_Distance(_site_geom, geom)) INTO dist_cable_ehv FROM cables_ehv_ug_capacity;
  dist_capacity := LEAST(COALESCE(dist_cable_hv, 999999), COALESCE(dist_cable_ehv, 999999));

  -- Capacity flag from nearest segment
  SELECT cf.capacity_flag INTO cap_flag FROM (
    SELECT capacity_flag, ST_Distance(_site_geom, geom) AS d FROM cables_hv_ug_capacity
    UNION ALL
    SELECT capacity_flag, ST_Distance(_site_geom, geom) AS d FROM cables_ehv_ug_capacity
  ) cf ORDER BY cf.d LIMIT 1;
  cap_flag := COALESCE(cap_flag, 'unknown');

  -- NDP intersect / within 1km
  SELECT EXISTS(SELECT 1 FROM ndp_projects WHERE ST_Intersects(geom, site_buf)) INTO ndp_intersect;
  SELECT EXISTS(SELECT 1 FROM ndp_projects WHERE ST_DWithin(geom, _site_geom, 1000)) INTO ndp_within_1000;

  -- Wayleave intersect
  SELECT EXISTS(SELECT 1 FROM wayleaves WHERE ST_Intersects(geom, corridor_buf)) INTO wayleave_hit;

  -- Highway widths within corridor
  SELECT MIN(footway_m), MIN(carriageway_m)
    INTO min_footway, min_carriageway
    FROM highway_widths WHERE ST_Intersects(geom, corridor_buf);

  -- Build reasons
  -- Primary distance
  IF dist_primary < 250 THEN reasons := reasons || '"Nearest primary substation within 250m"'::jsonb;
  ELSIF dist_primary <= 750 THEN reasons := reasons || '"Nearest primary substation between 250–750m"'::jsonb;
  ELSE reasons := reasons || '"Nearest primary substation >750m"'::jsonb;
  END IF;

  -- Feeder distance
  IF dist_feeder < 250 THEN reasons := reasons || '"Nearest feeder within 250m"'::jsonb;
  ELSIF dist_feeder <= 750 THEN reasons := reasons || '"Nearest feeder between 250–750m"'::jsonb;
  ELSE reasons := reasons || '"Nearest feeder >750m"'::jsonb;
  END IF;

  -- Capacity
  IF cap_flag = 'unknown' THEN reasons := reasons || '"Capacity data unknown on nearest segment"'::jsonb;
  ELSIF cap_flag = 'constrained' THEN reasons := reasons || '"Nearest capacity segment is constrained"'::jsonb;
  ELSE reasons := reasons || '"Nearest capacity segment is favourable"'::jsonb;
  END IF;

  -- NDP
  IF ndp_intersect THEN reasons := reasons || '"NDP intersects site area"'::jsonb;
  ELSIF ndp_within_1000 THEN reasons := reasons || '"NDP within 1km"'::jsonb;
  END IF;

  -- Wayleave
  IF wayleave_hit THEN reasons := reasons || '"Wayleave intersects likely route corridor"'::jsonb; END IF;

  -- Highway
  IF min_footway IS NOT NULL AND min_footway < 1.5 THEN reasons := reasons || '"Footway width constraint identified"'::jsonb; END IF;
  IF min_carriageway IS NOT NULL AND min_carriageway < 5.5 THEN reasons := reasons || '"Carriageway width constraint identified"'::jsonb; END IF;

  -- === SCORING RULES ===
  -- RED conditions
  IF (dist_primary > 750 AND dist_feeder > 750 AND dist_capacity > 750)
     OR (wayleave_hit AND (COALESCE(min_carriageway, 999) < 5.5 OR COALESCE(min_footway, 999) < 1.5))
     OR (cap_flag = 'constrained' AND COALESCE(_proposed_kw, 0) >= 500)
  THEN
    score := 'RED';
  -- GREEN conditions
  ELSIF (dist_primary < 250 OR dist_feeder < 250 OR dist_capacity < 250)
    AND NOT wayleave_hit
    AND (min_footway IS NULL OR min_footway >= 1.5)
    AND (min_carriageway IS NULL OR min_carriageway >= 5.5)
    AND cap_flag != 'constrained'
  THEN
    score := 'GREEN';
  ELSE
    score := 'AMBER';
  END IF;

  -- Next steps
  steps := steps || '"Desktop route review + topographical survey"'::jsonb;
  IF wayleave_hit THEN steps := steps || '"Confirm land rights/wayleave position"'::jsonb; END IF;
  steps := steps || '"Request DNO budget estimate / formal capacity check"'::jsonb;
  IF min_carriageway IS NOT NULL AND min_carriageway < 5.5 THEN
    steps := steps || '"Traffic management review due to carriageway width"'::jsonb;
  END IF;
  steps := steps || '"Site survey to confirm cable route and constructability"'::jsonb;

  RETURN jsonb_build_object(
    'score', score,
    'reasons', reasons,
    'next_steps', steps,
    'data_timestamp', now(),
    'distances', jsonb_build_object(
      'primary_m', round(dist_primary::numeric, 1),
      'feeder_m', round(dist_feeder::numeric, 1),
      'capacity_segment_m', round(dist_capacity::numeric, 1)
    ),
    'constraints', jsonb_build_object(
      'ndp_intersect', ndp_intersect,
      'ndp_within_1000m', ndp_within_1000,
      'wayleave_intersect', wayleave_hit,
      'capacity_flag', cap_flag,
      'min_footway_m', min_footway,
      'min_carriageway_m', min_carriageway
    )
  );
END;
$$;
