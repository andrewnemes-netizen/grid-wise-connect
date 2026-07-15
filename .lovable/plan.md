
# Connect the app to Claude (Anthropic API)

Since Claude is not offered through Lovable AI Gateway, this uses your own Anthropic API key stored as a project secret and called from an edge function. No key ever reaches the browser.

Because you skipped the "what should the AI do" question, this plan sets up a **general-purpose Claude endpoint** you can call from anywhere in the app (site summaries, DNO rule explanations, chat, etc.). We can wire it into specific UI surfaces in a follow-up.

## 1. Secret

Request `ANTHROPIC_API_KEY` via the secure form (you paste it, it never appears in code or chat). You'll get it from https://console.anthropic.com/settings/keys.

## 2. Edge function: `supabase/functions/claude-chat/index.ts`

- Auth: `verify_jwt` stays on (default); function validates the user with `supabase.auth.getUser()` using the caller's bearer token, matching the security pattern already used across the project.
- CORS: standard `corsHeaders` with OPTIONS handler.
- Input validation (Zod):
  - `messages`: array of `{ role: 'user'|'assistant', content: string }`, 1–50 items, each content ≤ 20k chars
  - `system` (optional): string ≤ 4k chars
  - `model` (optional): defaults to `claude-sonnet-4-5` (current flagship); allowlist `claude-sonnet-4-5`, `claude-opus-4-1`, `claude-haiku-4-5`
  - `max_tokens` (optional): 1–8192, default 1024
  - `stream` (optional boolean, default true)
- Calls `https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`.
- Streaming: when `stream: true`, proxy the SSE stream straight back to the client with `text/event-stream` + CORS. When false, return the JSON response.
- Error surfacing: map Anthropic 401 → 500 "Claude not configured", 429 → 429 with retry hint, 529/5xx → 503, otherwise pass through status + safe error message.
- Deploy immediately after write.

## 3. Client helper: `src/lib/ai/claude.ts`

Small typed wrapper around `supabase.functions.invoke('claude-chat', ...)` with two exports:
- `askClaude({ messages, system?, model?, maxTokens? })` — non-streaming, returns `{ text, usage }`
- `streamClaude({ messages, system?, ... }, onDelta)` — streaming via `fetch` to the function URL (built from `VITE_SUPABASE_URL`) with the user's access token in `Authorization`, parses SSE `content_block_delta` events and calls `onDelta(textChunk)`.

No UI changes in this plan — the wrapper is ready for any component to import.

## 4. Verification

- Deploy function, then run one non-streaming smoke test via `supabase--curl_edge_functions` with a fixture prompt to confirm 200 + a text reply.
- Check `edge_function_logs` for auth and Anthropic call success.

## Out of scope (say the word to add)

- A visible chat UI, buttons, or panels in the portfolio/design pages
- Persisting conversations in the database
- Wiring Claude into an existing feature (site summary, DNO rules explainer, cable advisor, etc.)
- Fallback to Lovable AI Gateway when Anthropic errors or the key is missing

## Technical notes

- Model IDs use the current Anthropic naming (`claude-sonnet-4-5`, `claude-opus-4-1`, `claude-haiku-4-5`). Sonnet 4.5 is the default — best price/quality for most app tasks; swap to Opus for hardest reasoning, Haiku for cheapest/fastest.
- Streaming uses Anthropic's native SSE (not the AI SDK), because AI SDK on this project targets Lovable AI Gateway. Keeping Claude on a separate small path avoids entangling the two providers.
- Anthropic errors are never echoed verbatim to the client — only status + a safe short message — to avoid leaking key/account state.
