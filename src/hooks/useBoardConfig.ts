import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BUILTIN_COLUMNS, BUILTIN_COLUMNS_WP, BoardColumn, BoardView, BoardAutomation, BuiltinSet } from "@/lib/board/types";

export type BoardScopeColumn = "project_id" | "work_package_id" | "programme_id";

export function useBoardConfig(scopeId: string, scopeCol: BoardScopeColumn = "project_id", builtinSet: BuiltinSet = "tasks") {
  const qc = useQueryClient();

  const columnsQ = useQuery({
    queryKey: ["board-columns", scopeCol, scopeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_columns" as any)
        .select("*")
        .eq(scopeCol, scopeId)
        .order("sort_index");
      if (error) throw error;
      return (data ?? []) as unknown as BoardColumn[];
    },
  });

  const viewsQ = useQuery({
    queryKey: ["board-views", scopeCol, scopeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_views" as any)
        .select("*")
        .eq(scopeCol, scopeId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as BoardView[];
    },
  });

  const automationsQ = useQuery({
    queryKey: ["board-automations", scopeCol, scopeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_automations" as any)
        .select("*")
        .eq(scopeCol, scopeId);
      if (error) throw error;
      return (data ?? []) as unknown as BoardAutomation[];
    },
  });

  useEffect(() => {
    if (columnsQ.isLoading || !columnsQ.data) return;
    if (columnsQ.data.length > 0) return;
    (async () => {
      const seed = builtinSet === "work_packages" ? BUILTIN_COLUMNS_WP : BUILTIN_COLUMNS;
      const rows = seed.map((c) => ({ ...c, [scopeCol]: scopeId }));
      const { error } = await supabase.from("board_columns" as any).insert(rows as any);
      if (!error) qc.invalidateQueries({ queryKey: ["board-columns", scopeCol, scopeId] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsQ.data?.length, columnsQ.isLoading]);

  const invalidate = (key: string) => qc.invalidateQueries({ queryKey: [key, scopeCol, scopeId] });

  const upsertColumn = useMutation({
    mutationFn: async (col: Partial<BoardColumn> & { id?: string }) => {
      if (col.id) {
        const { error } = await supabase.from("board_columns" as any).update(col as any).eq("id", col.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("board_columns" as any).insert({ ...col, [scopeCol]: scopeId } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate("board-columns"),
  });

  const deleteColumn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("board_columns" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("board-columns"),
  });

  const upsertView = useMutation({
    mutationFn: async (v: Partial<BoardView> & { id?: string }) => {
      if (v.id) {
        const { error } = await supabase.from("board_views" as any).update(v as any).eq("id", v.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("board_views" as any).insert({ ...v, [scopeCol]: scopeId, user_id: u.user?.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate("board-views"),
  });

  const deleteView = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("board_views" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("board-views"),
  });

  const upsertAutomation = useMutation({
    mutationFn: async (a: Partial<BoardAutomation> & { id?: string }) => {
      if (a.id) {
        const { error } = await supabase.from("board_automations" as any).update(a as any).eq("id", a.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("board_automations" as any).insert({ ...a, [scopeCol]: scopeId } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate("board-automations"),
  });

  const deleteAutomation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("board_automations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate("board-automations"),
  });

  return {
    columns: columnsQ.data ?? [],
    views: viewsQ.data ?? [],
    automations: automationsQ.data ?? [],
    loading: columnsQ.isLoading,
    upsertColumn, deleteColumn,
    upsertView, deleteView,
    upsertAutomation, deleteAutomation,
  };
}