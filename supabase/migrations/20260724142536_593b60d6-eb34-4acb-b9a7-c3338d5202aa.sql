ALTER TABLE public.rate_cards ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS rate_cards_archived_at_idx ON public.rate_cards (archived_at);