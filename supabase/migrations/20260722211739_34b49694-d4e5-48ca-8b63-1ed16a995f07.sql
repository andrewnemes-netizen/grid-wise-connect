
-- Widen assistant tool call audit to support proposal/approval flow
ALTER TABLE public.assistant_tool_calls DROP CONSTRAINT IF EXISTS assistant_tool_calls_status_check;
ALTER TABLE public.assistant_tool_calls
  ADD CONSTRAINT assistant_tool_calls_status_check
  CHECK (status IN ('ok','denied','error','proposed','approved','rejected','executed'));

ALTER TABLE public.assistant_tool_calls
  ADD COLUMN IF NOT EXISTS tool_call_id text,
  ADD COLUMN IF NOT EXISTS preview text,
  ADD COLUMN IF NOT EXISTS executed_at timestamptz;

CREATE INDEX IF NOT EXISTS assistant_tool_calls_tool_call_id_idx
  ON public.assistant_tool_calls (tool_call_id);
