UPDATE public.stage_definitions
SET label = 'PoC Offer Due',
    updated_at = now()
WHERE key = 'poc_offer_awaiting';