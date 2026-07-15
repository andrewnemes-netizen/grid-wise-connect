ALTER TABLE public.estimate_lines ADD COLUMN IF NOT EXISTS rate_item_id UUID REFERENCES public.rate_items(id) ON DELETE SET NULL;
ALTER TABLE public.estimate_lines ADD COLUMN IF NOT EXISTS rate_card_version_id UUID REFERENCES public.rate_card_versions(id) ON DELETE SET NULL;
ALTER TABLE public.estimate_lines ADD COLUMN IF NOT EXISTS rate_code TEXT;
CREATE INDEX IF NOT EXISTS idx_estimate_lines_rate_item ON public.estimate_lines(rate_item_id);

ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS rate_card_version_id UUID REFERENCES public.rate_card_versions(id) ON DELETE SET NULL;