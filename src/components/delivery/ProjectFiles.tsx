import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ProjectFiles({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: files = [] } = useQuery({
    queryKey: ["delivery-files", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_files")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const path = `${projectId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("project-files").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("project_files").insert({
        project_id: projectId,
        storage_path: path,
        filename: file.name,
        mime: file.type,
        size_bytes: file.size,
        uploaded_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: ["delivery-files", projectId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (f: any) => {
      await supabase.storage.from("project-files").remove([f.storage_path]);
      const { error } = await supabase.from("project_files").delete().eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delivery-files", projectId] }),
    onError: (e: any) => toast.error(e.message),
  });

  async function download(f: any) {
    const { data, error } = await supabase.storage.from("project-files").createSignedUrl(f.storage_path, 300);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }}
        />
        <Button size="sm" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
          <Upload className="h-4 w-4 mr-1" /> Upload
        </Button>
      </div>
      {files.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No files.</Card>
      ) : (
        <div className="space-y-2">
          {files.map((f: any) => (
            <Card key={f.id} className="p-3 flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <button className="flex-1 text-left text-sm hover:underline truncate" onClick={() => download(f)}>{f.filename}</button>
              <span className="text-xs text-muted-foreground">{f.size_bytes ? `${Math.round(f.size_bytes / 1024)} KB` : ""}</span>
              <Button size="icon" variant="ghost" onClick={() => remove.mutate(f)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}