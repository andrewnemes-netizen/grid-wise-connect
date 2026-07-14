import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

export function ProjectActivity({ projectId }: { projectId: string }) {
  const { data: events = [] } = useQuery({
    queryKey: ["delivery-activity", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_activity")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });
  if (events.length === 0) return <p className="text-xs text-muted-foreground">No activity yet.</p>;
  return (
    <div className="relative pl-4 border-l-2 border-muted space-y-3">
      {events.map((e: any) => (
        <div key={e.id} className="relative">
          <span className="absolute -left-[calc(0.25rem+1px)] top-1.5 h-2 w-2 rounded-full bg-primary" />
          <p className="text-xs">{e.summary || `${e.entity_type} ${e.action}`}</p>
          <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
        </div>
      ))}
    </div>
  );
}