
-- Threads
CREATE TABLE public.assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  context_programme_id uuid,
  context_wp_id uuid,
  context_site_id uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_threads TO authenticated;
GRANT ALL ON public.assistant_threads TO service_role;
ALTER TABLE public.assistant_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own assistant threads" ON public.assistant_threads
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX assistant_threads_user_updated_idx ON public.assistant_threads(user_id, updated_at DESC);

-- Messages
CREATE TABLE public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.assistant_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  tokens_in integer,
  tokens_out integer,
  cost_cents numeric(10,4),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_messages TO service_role;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage messages in own threads" ON public.assistant_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.assistant_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.assistant_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  );
CREATE INDEX assistant_messages_thread_created_idx ON public.assistant_messages(thread_id, created_at);

-- Tool-call audit
CREATE TABLE public.assistant_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.assistant_threads(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  tool_name text NOT NULL,
  params jsonb,
  result_summary text,
  record_ids uuid[],
  status text NOT NULL CHECK (status IN ('ok','denied','error')),
  execution_ms integer,
  model text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_tool_calls TO authenticated;
GRANT ALL ON public.assistant_tool_calls TO service_role;
ALTER TABLE public.assistant_tool_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own tool calls" ON public.assistant_tool_calls
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.is_platform_admin = true)
  );
CREATE INDEX assistant_tool_calls_user_idx ON public.assistant_tool_calls(user_id, created_at DESC);

-- updated_at trigger for threads
CREATE TRIGGER assistant_threads_updated_at
  BEFORE UPDATE ON public.assistant_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
