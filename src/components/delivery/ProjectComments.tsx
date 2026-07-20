import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export function ProjectComments({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["delivery-comments", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_comments")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const post = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("project_comments").insert({
        project_id: projectId,
        author_user_id: user!.id,
        body_md: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["delivery-comments", projectId] });
      qc.invalidateQueries({ queryKey: ["delivery-activity", projectId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…" rows={2} />
        <Button disabled={!body.trim() || post.isPending} onClick={() => post.mutate()}>Post</Button>
      </div>
      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c: any) => (
            <Card key={c.id} className="p-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span className="font-mono">{String(c.author_user_id).slice(0, 8)}</span>
                <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.body_md}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}