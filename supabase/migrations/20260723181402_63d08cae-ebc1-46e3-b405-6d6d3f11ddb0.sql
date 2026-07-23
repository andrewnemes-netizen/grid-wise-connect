CREATE TABLE IF NOT EXISTS public.outlook_app_user_connection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gateway_session_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'wrong_tenant', 'failed')),
  microsoft_email text,
  error_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.outlook_app_user_connection_sessions TO authenticated;
GRANT ALL ON public.outlook_app_user_connection_sessions TO service_role;

ALTER TABLE public.outlook_app_user_connection_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own Outlook connection sessions"
ON public.outlook_app_user_connection_sessions
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS outlook_app_user_connection_sessions_user_idx
ON public.outlook_app_user_connection_sessions (user_id, created_at DESC);

CREATE TRIGGER update_outlook_app_user_connection_sessions_updated_at
BEFORE UPDATE ON public.outlook_app_user_connection_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();