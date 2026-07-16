
-- Xero connection (single-row, shared across the whole app)
CREATE TABLE public.xero_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  tenant_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scopes text,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.xero_connection TO authenticated;
GRANT ALL ON public.xero_connection TO service_role;

ALTER TABLE public.xero_connection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read xero connection"
ON public.xero_connection FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Cached Xero contacts (shared for the whole app)
CREATE TABLE public.xero_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_contact_id text NOT NULL UNIQUE,
  name text NOT NULL,
  email text,
  contact_status text,
  is_customer boolean DEFAULT false,
  is_supplier boolean DEFAULT false,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.xero_contacts TO authenticated;
GRANT ALL ON public.xero_contacts TO service_role;

ALTER TABLE public.xero_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read xero contacts"
ON public.xero_contacts FOR SELECT TO authenticated
USING (true);

CREATE INDEX xero_contacts_email_idx ON public.xero_contacts (lower(email));

-- Reuse existing updated_at trigger fn (public.update_updated_at_column)
CREATE TRIGGER update_xero_connection_updated_at
BEFORE UPDATE ON public.xero_connection
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_xero_contacts_updated_at
BEFORE UPDATE ON public.xero_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Xero tracking columns on invoices
ALTER TABLE public.revenue_invoices
  ADD COLUMN IF NOT EXISTS xero_invoice_id text,
  ADD COLUMN IF NOT EXISTS xero_status text,
  ADD COLUMN IF NOT EXISTS xero_amount_paid numeric,
  ADD COLUMN IF NOT EXISTS xero_amount_due numeric,
  ADD COLUMN IF NOT EXISTS xero_synced_at timestamptz;

-- Xero tracking columns on purchase orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS xero_purchase_order_id text,
  ADD COLUMN IF NOT EXISTS xero_status text,
  ADD COLUMN IF NOT EXISTS xero_synced_at timestamptz;
