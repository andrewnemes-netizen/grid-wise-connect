import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Check, CheckCheck, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Notif = {
  id: string;
  user_id: string;
  type: string;
  message: string;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

function relativeTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function typeLabel(t: string) {
  if (t.startsWith("wp_task.")) return "Task";
  if (t === "design.approved") return "Design";
  if (t === "rams.approved") return "RAMS";
  if (t === "precon.ready_for_delivery") return "Release";
  if (t === "dno_offer.received") return "DNO offer";
  return t.split(".")[0] || "Update";
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`notifications:${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications", uid] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, qc]);

  const unread = useMemo(() => items.filter((n) => !n.read_at), [items]);

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", uid] }),
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  const handleClick = (n: Notif) => {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-medium text-white flex items-center justify-center tabular-nums">
              {unread.length > 99 ? "99+" : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Notifications</div>
            {unread.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {unread.length} new
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={!unread.length || markRead.isPending}
            onClick={() => markRead.mutate(unread.map((n) => n.id))}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Mark all read
          </Button>
        </div>
        <ScrollArea className="max-h-[420px]">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors flex gap-2 items-start",
                      !n.read_at && "bg-primary/5",
                    )}
                  >
                    <div className="pt-1 shrink-0">
                      {n.read_at ? (
                        <Check className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Circle className="h-2.5 w-2.5 fill-primary text-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wide">
                        <span>{typeLabel(n.type)}</span>
                        <span>·</span>
                        <span>{relativeTime(n.created_at)}</span>
                      </div>
                      <div className="text-sm mt-0.5 line-clamp-2">{n.message}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}