import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAssistantThreads } from "@/hooks/useAssistantThreads";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";

export default function Assistant() {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const { threads, loading, createThread, archiveThread } = useAssistantThreads();

  // On /assistant, redirect to newest thread or create one
  useEffect(() => {
    if (threadId) return;
    if (loading) return;
    (async () => {
      if (threads.length > 0) {
        navigate(`/assistant/${threads[0].id}`, { replace: true });
      } else {
        const t = await createThread({ title: "New conversation" });
        if (t) navigate(`/assistant/${t.id}`, { replace: true });
      }
    })();
  }, [threadId, threads, loading, createThread, navigate]);

  async function handleNew() {
    const t = await createThread({ title: "New conversation" });
    if (t) navigate(`/assistant/${t.id}`);
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await archiveThread(id);
    if (id === threadId) navigate("/assistant", { replace: true });
  }

  return (
    <div className="flex h-[calc(100vh-56px)] w-full">
      {/* Thread list */}
      <aside className="w-64 shrink-0 border-r border-border/60 bg-muted/20 flex flex-col">
        <div className="p-3 border-b border-border/60">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-md bg-primary/10 grid place-items-center text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">Gridwise Assistant</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Read-only</div>
            </div>
          </div>
          <Button size="sm" className="w-full" onClick={handleNew}>
            <Plus className="h-3.5 w-3.5" /> New conversation
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loading && <div className="text-xs text-muted-foreground p-2">Loading…</div>}
          {!loading && threads.length === 0 && (
            <div className="text-xs text-muted-foreground p-2">No conversations yet.</div>
          )}
          {threads.map((t) => (
            <div key={t.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate(`/assistant/${t.id}`)}
                className={cn(
                  "flex-1 flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-0",
                  threadId === t.id && "bg-accent text-accent-foreground",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-70" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium leading-tight">{t.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDistanceToNowStrict(new Date(t.updated_at), { addSuffix: true })}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleDelete(t.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition"
                aria-label="Archive conversation"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat pane */}
      {threadId ? (
        <AssistantChat threadId={threadId} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Preparing…</div>
      )}
    </div>
  );
}