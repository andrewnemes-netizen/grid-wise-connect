ALTER TABLE public.rate_cards ALTER COLUMN contract_id DROP NOT NULL;
ALTER TABLE public.rate_cards ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.rate_cards DROP CONSTRAINT IF EXISTS rate_cards_contract_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS rate_cards_contract_name_uidx
  ON public.rate_cards(contract_id, name) WHERE contract_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rate_cards_library_name_uidx
  ON public.rate_cards(name) WHERE contract_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_rate_cards_category ON public.rate_cards(category);