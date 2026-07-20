
ALTER TABLE public.quotation_sends
  ADD COLUMN site_estimate_id uuid NULL REFERENCES public.site_estimates(id) ON DELETE CASCADE;

ALTER TABLE public.quotation_sends
  ALTER COLUMN estimate_id DROP NOT NULL;

ALTER TABLE public.quotation_sends
  ADD CONSTRAINT quotation_sends_exactly_one_estimate CHECK (
    (estimate_id IS NOT NULL)::int + (site_estimate_id IS NOT NULL)::int = 1
  );

CREATE INDEX IF NOT EXISTS idx_quotation_sends_site_estimate
  ON public.quotation_sends (site_estimate_id, created_at DESC);
