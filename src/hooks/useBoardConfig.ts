import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BUILTIN_COLUMNS, BoardColumn, BoardView, BoardAutomation } from "@/lib/board/types";

export function useBoardConfig(projectId: string) {
  const qc = useQueryClient();

  const columnsQ = useQuery({
    queryKey: ["board-columns", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_columns" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("sort_index");
      if (error) throw error;
      return (data ?? []) as unknown as BoardColumn[];
    },
  });

  const viewsQ = useQuery({
    queryKey: ["board-views", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_views" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as BoardView[];
    },
  });

  const automationsQ = useQuery({
    queryKey: ["board-automations", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_automations" as any)
        .select("*")
        .eq("project_id", projectId);
      if (error) throw error;
      return (data ?? []) as unknown as BoardAutomation[];
    },
  });

  // Auto-seed built-in columns on first load
  useEffect(() => {
    if (columnsQ.isLoading || !columnsQ.data) return;
    if (columnsQ.data.length > 0) return;
    (async () => {
      const rows = BUILTIN_COLUMNS.map((c) => ({ ...c, project_id: projectId }));
      const { error } = await supabase.from("board_columns" as any).insert(rows as any);
      if (!error) qc.invalidateQueries({ queryKey: ["board-columns", projectId] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsQ.data?.length, columnsQ.isLoading]);

  const upsertColumn = useMutation({
    mutationFn: async (col: Partial<BoardColumn> & { id?: string }) => {
      if (col.id) {
        const { error } = await supabase.from("board_columns" as any).update(col as any).eq("id", col.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("board_columns" as any).insert({ ...col, project_id: projectId } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-columns", projectId] }),
  });

  const deleteColumn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("board_columns" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-columns", projectId] }),
  });

  const upsertView = useMutation({
    mutationFn: async (v: Partial<BoardView> & { id?: string }) => {
      if (v.id) {
        const { error } = await supabase.from("board_views" as any).update(v as any).eq("id", v.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("board_views" as any).insert({ ...v, project_id: projectId, user_id: u.user?.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-views", projectId] }),
  });

  const deleteView = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("board_views" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-views", projectId] }),
  });

  const upsertAutomation = useMutation({
    mutationFn: async (a: Partial<BoardAutomation> & { id?: string }) => {
      if (a.id) {
        const { error } = await supabase.from("board_automations" as any).update(a as any).eq("id", a.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("board_automations" as any).insert({ ...a, project_id: projectId } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-automations", projectId] }),
  });

  const deleteAutomation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("board_automations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-automations", projectId] }),
  });

  return {
    columns: columnsQ.data ?? [],
    views: viewsQ.data ?? [],
    automations: automationsQ.data ?? [],
    loading: columnsQ.isLoading,
    upsertColumn,
    deleteColumn,
    upsertView,
    deleteView,
    upsertAutomation,
    deleteAutomation,
  };
}