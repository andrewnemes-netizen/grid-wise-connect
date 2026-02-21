import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { createNotification } from "@/hooks/useNotifications";

interface StudyComment {
  id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

interface StudyCommentsPanelProps {
  studyId: string;
}

export function StudyCommentsPanel({ studyId }: StudyCommentsPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");

  const { data: comments, isLoading } = useQuery({
    queryKey: ["study-comments", studyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_comments")
        .select("*")
        .eq("study_id", studyId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as StudyComment[];
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("study_comments").insert({
        study_id: studyId,
        user_id: user!.id,
        content: newComment.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["study-comments", studyId] });
      // Notify study owner and shared users about the new comment
      const { data: study } = await supabase.from("studies").select("created_by, study_name").eq("id", studyId).maybeSingle();
      if (study && study.created_by !== user!.id) {
        await createNotification({
          userId: study.created_by,
          studyId,
          type: "comment_added",
          message: `New comment on "${study.study_name}"`,
        });
      }
      setNewComment("");
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from("study_comments").delete().eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study-comments", studyId] });
    },
  });

  // Group into threads: top-level comments and their replies
  const topLevel = comments?.filter((c) => !c.parent_id) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Comments</h3>
        {comments && comments.length > 0 && (
          <span className="text-xs text-muted-foreground">({comments.length})</span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      ) : topLevel.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment.</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {topLevel.map((comment) => {
            const replies = comments?.filter((c) => c.parent_id === comment.id) ?? [];
            return (
              <div key={comment.id} className="space-y-1">
                <CommentBubble
                  comment={comment}
                  isOwn={comment.user_id === user?.id}
                  onDelete={() => deleteComment.mutate(comment.id)}
                />
                {replies.map((reply) => (
                  <div key={reply.id} className="ml-6">
                    <CommentBubble
                      comment={reply}
                      isOwn={reply.user_id === user?.id}
                      onDelete={() => deleteComment.mutate(reply.id)}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* New comment input */}
      <div className="flex gap-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment…"
          className="text-sm min-h-[60px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && newComment.trim()) {
              addComment.mutate();
            }
          }}
        />
        <Button
          size="icon"
          disabled={!newComment.trim() || addComment.isPending}
          onClick={() => addComment.mutate()}
          className="shrink-0 self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-[9px] text-muted-foreground">Ctrl+Enter to send</p>
    </div>
  );
}

function CommentBubble({
  comment,
  isOwn,
  onDelete,
}: {
  comment: StudyComment;
  isOwn: boolean;
  onDelete: () => void;
}) {
  return (
    <div className={`rounded-lg border p-2.5 text-sm ${isOwn ? "bg-primary/5 border-primary/20" : "bg-muted/30"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground font-medium">
          {isOwn ? "You" : comment.user_id.slice(0, 8) + "…"}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">
            {new Date(comment.created_at).toLocaleDateString()} {new Date(comment.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {isOwn && (
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onDelete}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          )}
        </div>
      </div>
      <p className="text-foreground whitespace-pre-wrap">{comment.content}</p>
    </div>
  );
}
