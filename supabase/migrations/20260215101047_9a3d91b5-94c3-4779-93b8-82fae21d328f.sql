-- Table for DNO licence area polygons (used for spatial filtering)
CREATE TABLE public.dno_licence_areas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dno_code text NOT NULL UNIQUE,
  dno_name text NOT NULL,
  geom geometry(MultiPolygon, 4326),
  attrs_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Spatial index
CREATE INDEX idx_dno_licence_areas_geom ON public.dno_licence_areas USING GIST (geom);
CREATE INDEX idx_dno_licence_areas_dno_code ON public.dno_licence_areas (dno_code);

-- Enable RLS
ALTER TABLE public.dno_licence_areas ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated can read dno_licence_areas"
  ON public.dno_licence_areas FOR SELECT
  USING (true);

-- Admins can manage
CREATE POLICY "Admins can manage dno_licence_areas"
  ON public.dno_licence_areas FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
