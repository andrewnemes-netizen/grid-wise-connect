ALTER TABLE public.assistant_threads
  ADD COLUMN IF NOT EXISTS agent_id text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS auto_execute_safe boolean DEFAULT false;

ALTER TABLE public.assistant_tool_calls
  ADD COLUMN IF NOT EXISTS agent_id text,
  ADD COLUMN IF NOT EXISTS execution_mode text,
  ADD COLUMN IF NOT EXISTS risk_tier text;

CREATE TABLE IF NOT EXISTS public.agent_auto_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  tool_name text NOT NULL,
  params jsonb,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL,
  result_summary text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_threads TO authenticated;
GRANT ALL ON public.assistant_threads TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_tool_calls TO authenticated;
GRANT ALL ON public.assistant_tool_calls TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_auto_execution_log TO authenticated;
GRANT ALL ON public.agent_auto_execution_log TO service_role;

ALTER TABLE public.agent_auto_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own agent execution log"
  ON public.agent_auto_execution_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage agent execution log"
  ON public.agent_auto_execution_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_agent_auto_exec_user_created
  ON public.agent_auto_execution_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_auto_exec_agent_created
  ON public.agent_auto_execution_log(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_tool_calls_thread_created
  ON public.assistant_tool_calls(thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_tool_calls_agent_created
  ON public.assistant_tool_calls(agent_id, created_at DESC);