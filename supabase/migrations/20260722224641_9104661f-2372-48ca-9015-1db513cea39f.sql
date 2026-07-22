ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_site_id ON public.estimates(site_id);
NOTIFY pgrst, 'reload schema';