CREATE TABLE public.quotation_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name text,
  cc_emails text[],
  subject text NOT NULL,
  message text,
  pdf_storage_path text NOT NULL,
  pdf_signed_url text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.quotation_sends TO authenticated;
GRANT ALL ON public.quotation_sends TO service_role;

ALTER TABLE public.quotation_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view quotation sends"
  ON public.quotation_sends FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can create quotation sends"
  ON public.quotation_sends FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Sender can update own quotation sends"
  ON public.quotation_sends FOR UPDATE
  TO authenticated
  USING (sent_by = auth.uid())
  WITH CHECK (sent_by = auth.uid());

CREATE INDEX idx_quotation_sends_estimate ON public.quotation_sends(estimate_id, created_at DESC);

CREATE TRIGGER update_quotation_sends_updated_at
  BEFORE UPDATE ON public.quotation_sends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();