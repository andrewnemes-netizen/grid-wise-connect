import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputSubmit, PromptInputFooter } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ToolProposalCard } from "./ToolProposalCard";
import { AgentSelector, type AgentId } from "./AgentSelector";
import { toast } from "sonner";

const WRITE_TOOL_NAMES = new Set([
  "mark_stage_done_bulk",
  "set_stage_status_bulk",
  "assign_stage_owner",
  "reassign_waiting_stage_owner",
  "add_sites_to_wp",
  "remove_sites_from_wp",
  "queue_survey_for_sites",
  "update_site_fields",
  "archive_programme",
  "archive_work_package",
  "archive_site",
  "archive_programmes_bulk",
  "archive_work_packages_bulk",
]);

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
  const [agentId, setAgentId] = useState<AgentId>("general");
  const [autoExecuteSafe, setAutoExecuteSafe] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  useEffect(() => {
    let cancelled = false;
    setInitialMessages(null);
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        if (!cancelled) setLoadError("Please sign in again.");
        return;
      }
      const [msgRes, threadRes] = await Promise.all([
        supabase
          .from("assistant_messages")
          .select("id, role, parts, created_at")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true }),
        supabase
          .from("assistant_threads")
          .select("agent_id, auto_execute_safe")
          .eq("id", threadId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (msgRes.error) {
        setLoadError(msgRes.error.message);
        return;
      }
      if (threadRes.data) {
        if (threadRes.data.agent_id) setAgentId(threadRes.data.agent_id as AgentId);
        setAutoExecuteSafe(!!threadRes.data.auto_execute_safe);
      }
      const msgs: UIMessage[] = (msgRes.data ?? []).map((row: any) => ({
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
          body: { messages, threadId, agentId, autoExecuteSafe, ...(body ?? {}) },
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        };
      },
    });
  }, [threadId, agentId, autoExecuteSafe]);

  const { messages, sendMessage, status, error, stop, addToolResult } = useChat({
    id: threadId,
    messages: initialMessages ?? [],
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  async function decideProposal(
    toolName: string,
    toolCallId: string,
    input: any,
    decision: "approve" | "reject",
  ) {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        toast.error("Sign-in expired — please refresh.");
        return;
      }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gridwise-agent-execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ tool: toolName, input, tool_call_id: toolCallId, thread_id: threadId, decision, agent_id: agentId }),
      });
      const body = await res.json().catch(() => ({}));
      const output = body?.output ?? (body?.error ? { error: body.error } : body);
      if (decision === "approve") {
        if (body?.error || output?.error) {
          toast.error(`Action failed: ${body?.error ?? output?.error}`);
        } else {
          toast.success("Action completed.");
        }
      } else {
        toast.info("Action rejected.");
      }
      addToolResult({ tool: toolName, toolCallId, output });
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(`Could not run action: ${msg}`);
      addToolResult({ tool: toolName, toolCallId, output: { error: msg } });
    }
  }

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
    if ((!text && attachments.length === 0) || busy) return;
    const files = attachments;
    setInput("");
    setAttachments([]);
    if (files.length === 0) {
      await sendMessage({ text });
      return;
    }
    const fileParts = await Promise.all(
      files.map(
        (f) =>
          new Promise<{ type: "file"; mediaType: string; url: string; filename: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                type: "file",
                mediaType: f.type || "application/octet-stream",
                url: String(reader.result),
                filename: f.name,
              });
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(f);
          }),
      ),
    );
    await sendMessage({
      role: "user",
      parts: [...(text ? [{ type: "text" as const, text }] : []), ...fileParts],
    } as any);
  }

  if (initialMessages === null && !loadError) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading conversation…</div>;
  }
  if (loadError) {
    return <div className="flex-1 flex items-center justify-center text-sm text-destructive">{loadError}</div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <AgentSelector
        threadId={threadId}
        agentId={agentId}
        onChange={setAgentId}
        autoExecuteSafe={autoExecuteSafe}
        onAutoExecuteChange={setAutoExecuteSafe}
      />
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
                  const isWrite = WRITE_TOOL_NAMES.has(toolName);
                  // Write tools awaiting approval — render the card
                  if (isWrite && (state === "input-available" || state === "input-streaming")) {
                    if (state === "input-streaming" || !p.toolCallId) {
                      return (
                        <div key={`${message.id}-tool-${idx}`} className="ml-11 mr-4 text-xs text-muted-foreground">
                          Preparing action…
                        </div>
                      );
                    }
                    return (
                      <ToolProposalCard
                        key={`${message.id}-tool-${idx}`}
                        proposal={{ toolName, toolCallId: p.toolCallId, input: p.input }}
                        onDecide={(decision) => decideProposal(toolName, p.toolCallId, p.input, decision)}
                        disabled={busy}
                      />
                    );
                  }
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
            <div className="text-sm px-4">
              {String(error.message ?? "").includes("402") || String(error.message ?? "").includes("Payment Required") ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700">
                  <p className="font-medium">AI credit limit reached</p>
                  <p className="text-xs mt-1">
                    The assistant cannot send requests right now because the workspace AI credit budget is exhausted.
                    Add credits under workspace billing or wait for the next daily reset.
                  </p>
                </div>
              ) : (
                <span className="text-destructive">{error.message}</span>
              )}
            </div>
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
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                {attachments.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-[160px] truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <PromptInputFooter>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) setAttachments((prev) => [...prev, ...files]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                aria-label="Attach files"
                title="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <div className="ml-auto">
                <PromptInputSubmit
                  status={busy ? "streaming" : undefined}
                  onStop={stop}
                  disabled={!input.trim() && attachments.length === 0 && !busy}
                />
              </div>
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