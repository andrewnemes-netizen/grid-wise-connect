import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputSubmit, PromptInputFooter } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";
import { Link } from "react-router-dom";

interface Source {
  table: string;
  id: string;
  url: string;
  label?: string;
}

function extractSources(message: UIMessage): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const part of message.parts ?? []) {
    if (part.type?.startsWith("tool-")) {
      const output = (part as any).output;
      const raw = output?.sources;
      if (Array.isArray(raw)) {
        for (const s of raw) {
          if (s && typeof s.url === "string" && !seen.has(s.url)) {
            seen.add(s.url);
            out.push(s as Source);
          }
        }
      }
    }
  }
  return out;
}

function messageText(message: UIMessage): string {
  return (message.parts ?? [])
    .map((p) => (p.type === "text" ? (p as any).text : ""))
    .join("");
}

export function AssistantChat({ threadId }: { threadId: string }) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    setInitialMessages(null);
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        if (!cancelled) setLoadError("Please sign in again.");
        return;
      }
      const { data, error } = await supabase
        .from("assistant_messages")
        .select("id, role, parts, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }
      const msgs: UIMessage[] = (data ?? []).map((row: any) => ({
        id: row.id,
        role: row.role,
        parts: Array.isArray(row.parts) ? row.parts : [],
      }));
      setInitialMessages(msgs);
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gridwise-assistant`,
      prepareSendMessagesRequest: async ({ messages, body }) => {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        return {
          body: { messages, threadId, ...(body ?? {}) },
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        };
      },
    });
  }, [threadId]);

  const { messages, sendMessage, status, error, stop } = useChat({
    id: threadId,
    messages: initialMessages ?? [],
    transport,
  });

  // Focus composer on mount and after streaming completes
  useEffect(() => {
    if (status === "ready" || status === undefined) {
      composerRef.current?.focus();
    }
  }, [status, threadId]);

  const busy = status === "submitted" || status === "streaming";

  async function handleSubmit(_message: unknown, e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ text });
  }

  if (initialMessages === null && !loadError) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading conversation…</div>;
  }
  if (loadError) {
    return <div className="flex-1 flex items-center justify-center text-sm text-destructive">{loadError}</div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="max-w-3xl mx-auto w-full">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<div className="h-10 w-10 rounded-full bg-primary/10 grid place-items-center text-primary"><Bot className="h-5 w-5" /></div>}
              title="Ask about your Gridwise data"
              description="I can search sites and programmes, summarise studies, and explain feasibility results. I never invent engineering numbers or costs."
            />
          ) : null}
          {messages.map((message) => {
            const sources = message.role === "assistant" ? extractSources(message) : [];
            const text = messageText(message);
            return (
              <div key={message.id} className="space-y-2">
                <Message from={message.role}>
                  <MessageContent>
                    {message.role === "assistant" ? <MessageResponse>{text || ""}</MessageResponse> : text}
                  </MessageContent>
                </Message>
                {(message.parts ?? []).filter((p) => p.type?.startsWith("tool-")).map((part, idx) => {
                  const p = part as any;
                  const toolName = p.type.replace(/^tool-/, "");
                  const state = p.state as string | undefined;
                  const uiState = state === "output-available" ? "output-available" : state === "output-error" ? "output-error" : "input-streaming";
                  return (
                    <Tool key={`${message.id}-tool-${idx}`} defaultOpen={false}>
                      <ToolHeader type={toolName} state={uiState as any} />
                      <ToolContent>
                        {p.input ? <ToolInput input={p.input} /> : null}
                        {p.output || p.errorText ? (
                          <ToolOutput output={p.output ?? null} errorText={p.errorText} />
                        ) : null}
                      </ToolContent>
                    </Tool>
                  );
                })}
                {message.role === "assistant" && sources.length > 0 && (
                  <div className="ml-11 mr-4 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Sources</span>
                    {sources.map((s) => (
                      <Link key={s.url} to={s.url}>
                        <Badge variant="outline" className="hover:bg-accent hover:text-accent-foreground text-xs font-normal">
                          {s.label ?? `${s.table}/${s.id.slice(0, 8)}`}
                        </Badge>
                      </Link>
                    ))}
                    <Badge variant="secondary" className="text-[10px] font-normal ml-auto">AI-assisted</Badge>
                  </div>
                )}
              </div>
            );
          })}
          {busy && messages[messages.length - 1]?.role === "user" && (
            <div className="ml-4"><Shimmer>Thinking…</Shimmer></div>
          )}
          {error && (
            <div className="text-sm text-destructive px-4">{error.message}</div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t border-border/60 bg-background/85 backdrop-blur p-3">
        <div className="max-w-3xl mx-auto w-full">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea
              ref={composerRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your sites, programmes, studies, or delivery risks…"
              disabled={busy}
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={busy ? "streaming" : undefined} onStop={stop} disabled={!input.trim() && !busy} />
            </PromptInputFooter>
          </PromptInput>
          <p className="text-[11px] text-muted-foreground/70 mt-1.5 text-center">
            Gridwise Assistant reads your data via secure tools. It never invents engineering or commercial values.
          </p>
        </div>
      </div>
    </div>
  );
}