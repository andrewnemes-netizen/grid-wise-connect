
CREATE TABLE public.site_estimate_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_estimate_id uuid NOT NULL REFERENCES public.site_estimates(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX site_estimate_groups_estimate_idx
  ON public.site_estimate_groups(site_estimate_id, sort_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_estimate_groups TO authenticated;
GRANT ALL ON public.site_estimate_groups TO service_role;

ALTER TABLE public.site_estimate_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view site estimate groups"
  ON public.site_estimate_groups FOR SELECT
  USING (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can insert site estimate groups"
  ON public.site_estimate_groups FOR INSERT
  WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can update site estimate groups"
  ON public.site_estimate_groups FOR UPDATE
  USING (public.is_gridwise_staff(auth.uid()))
  WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can delete site estimate groups"
  ON public.site_estimate_groups FOR DELETE
  USING (public.is_gridwise_staff(auth.uid()));

CREATE TRIGGER update_site_estimate_groups_updated_at
  BEFORE UPDATE ON public.site_estimate_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.site_estimate_lines
  ADD COLUMN group_id uuid REFERENCES public.site_estimate_groups(id) ON DELETE SET NULL;

CREATE INDEX site_estimate_lines_group_idx
  ON public.site_estimate_lines(group_id);
