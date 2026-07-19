
CREATE TABLE public.site_socket_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  power_rating_kw numeric NOT NULL CHECK (power_rating_kw > 0),
  phases smallint NOT NULL CHECK (phases IN (1,3)),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_socket_groups_site ON public.site_socket_groups(site_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_socket_groups TO authenticated;
GRANT ALL ON public.site_socket_groups TO service_role;

ALTER TABLE public.site_socket_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access socket groups via parent site select"
ON public.site_socket_groups FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_socket_groups.site_id));

CREATE POLICY "Insert socket groups when can access parent site"
ON public.site_socket_groups FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_socket_groups.site_id));

CREATE POLICY "Update socket groups when can access parent site"
ON public.site_socket_groups FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_socket_groups.site_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_socket_groups.site_id));

CREATE POLICY "Delete socket groups when can access parent site"
ON public.site_socket_groups FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_socket_groups.site_id));

CREATE TRIGGER trg_site_socket_groups_updated_at
BEFORE UPDATE ON public.site_socket_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_site_totals_from_socket_groups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _site_id uuid;
BEGIN
  _site_id := COALESCE(NEW.site_id, OLD.site_id);
  UPDATE public.sites s
     SET socket_count = COALESCE((SELECT SUM(quantity) FROM public.site_socket_groups g WHERE g.site_id = _site_id), s.socket_count),
         proposed_kw  = COALESCE((SELECT SUM(quantity * power_rating_kw) FROM public.site_socket_groups g WHERE g.site_id = _site_id), s.proposed_kw)
   WHERE s.id = _site_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_site_totals_ai
AFTER INSERT OR UPDATE OR DELETE ON public.site_socket_groups
FOR EACH ROW EXECUTE FUNCTION public.sync_site_totals_from_socket_groups();

INSERT INTO public.site_socket_groups (site_id, quantity, power_rating_kw, phases, sort_order)
SELECT
  s.id,
  s.socket_count,
  ROUND((s.proposed_kw / s.socket_count)::numeric, 2),
  CASE WHEN (s.proposed_kw / s.socket_count) >= 10 THEN 3 ELSE 1 END,
  0
FROM public.sites s
WHERE COALESCE(s.socket_count, 0) > 0
  AND COALESCE(s.proposed_kw, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM public.site_socket_groups g WHERE g.site_id = s.id);

DROP FUNCTION IF EXISTS public.get_sites_for_poc(uuid[]);

CREATE FUNCTION public.get_sites_for_poc(_site_ids uuid[])
RETURNS TABLE (
  id uuid,
  site_name text,
  postcode text,
  client_site_code text,
  socket_count integer,
  proposed_kw numeric,
  lat double precision,
  lng double precision,
  socket_groups jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.site_name,
    s.postcode,
    s.client_site_code,
    s.socket_count,
    s.proposed_kw,
    CASE WHEN s.geom IS NOT NULL THEN ST_Y(s.geom::geometry) END AS lat,
    CASE WHEN s.geom IS NOT NULL THEN ST_X(s.geom::geometry) END AS lng,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                 'id', g.id,
                 'quantity', g.quantity,
                 'power_rating_kw', g.power_rating_kw,
                 'phases', g.phases,
                 'sort_order', g.sort_order
              ) ORDER BY g.sort_order, g.power_rating_kw DESC)
         FROM public.site_socket_groups g WHERE g.site_id = s.id),
      '[]'::jsonb
    ) AS socket_groups
  FROM public.sites s
  WHERE s.id = ANY(_site_ids);
$$;

REVOKE EXECUTE ON FUNCTION public.get_sites_for_poc(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sites_for_poc(uuid[]) TO authenticated, service_role;
