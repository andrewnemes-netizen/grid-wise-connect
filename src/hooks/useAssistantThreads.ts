import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AssistantThread {
  id: string;
  title: string;
  context_programme_id: string | null;
  context_wp_id: string | null;
  context_site_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useAssistantThreads() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setThreads([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("assistant_threads")
      .select("id, title, context_programme_id, context_wp_id, context_site_id, archived_at, created_at, updated_at")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (!error && data) setThreads(data as AssistantThread[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createThread = useCallback(
    async (opts?: { title?: string; site_id?: string | null; programme_id?: string | null; wp_id?: string | null }) => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("assistant_threads")
        .insert({
          user_id: user.id,
          title: opts?.title ?? "New conversation",
          context_site_id: opts?.site_id ?? null,
          context_programme_id: opts?.programme_id ?? null,
          context_wp_id: opts?.wp_id ?? null,
        })
        .select("id, title, context_programme_id, context_wp_id, context_site_id, archived_at, created_at, updated_at")
        .single();
      if (error || !data) return null;
      setThreads((prev) => [data as AssistantThread, ...prev]);
      return data as AssistantThread;
    },
    [user],
  );

  const renameThread = useCallback(async (id: string, title: string) => {
    await supabase.from("assistant_threads").update({ title }).eq("id", id);
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  const archiveThread = useCallback(async (id: string) => {
    await supabase.from("assistant_threads").update({ archived_at: new Date().toISOString() }).eq("id", id);
    setThreads((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { threads, loading, refresh, createThread, renameThread, archiveThread };
}