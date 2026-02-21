import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";
import type { Notification } from "@/hooks/useNotifications";

const typeLabels: Record<string, string> = {
  study_share: "Shared",
  comment_added: "Comment",
  status_changed: "Status",
};

export function StudyActivityFeed({ studyId }: { studyId: string }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["study-activity", studyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("study_id", studyId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Notification[];
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading activity…</p>;
  if (events.length === 0)
    return <p className="text-xs text-muted-foreground">No activity yet for this study.</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Activity</span>
      </div>
      <div className="relative pl-4 border-l-2 border-muted space-y-3">
        {events.map((e) => (
          <div key={e.id} className="relative">
            <span className="absolute -left-[calc(0.25rem+1px)] top-1.5 h-2 w-2 rounded-full bg-primary" />
            <p className="text-xs text-foreground">{e.message}</p>
            <div className="flex gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground">
                {typeLabels[e.type] || e.type}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
