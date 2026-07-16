import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cloud, Loader2, Upload, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface OneDriveStatus {
  connected: boolean;
  drive_name?: string;
  owner?: string;
  quota?: { used?: number; total?: number };
  root_folder?: string;
  error?: string;
}

function formatBytes(n?: number): string {
  if (!n && n !== 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function OneDriveIntegration() {
  const qc = useQueryClient();
  const [rootFolder, setRootFolder] = useState<string>("");

  const { data: status, isLoading } = useQuery({
    queryKey: ["onedrive-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("onedrive-status", { method: "GET" });
      if (error) throw error;
      const s = data as OneDriveStatus;
      setRootFolder(s.root_folder ?? "EcoPower UK");
      return s;
    },
  });

  const { data: uploads = [] } = useQuery({
    queryKey: ["onedrive-uploads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("onedrive_uploads")
        .select("id, entity_type, filename, path, status, error, web_url, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const saveRoot = useMutation({
    mutationFn: async (name: string) => {
      const { data: existing } = await supabase.from("app_settings").select("id").limit(1).maybeSingle();
      if (existing?.id) {
        const { error } = await supabase.from("app_settings").update({ onedrive_root_folder: name }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("app_settings").insert({ onedrive_root_folder: name });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Root folder saved");
      qc.invalidateQueries({ queryKey: ["onedrive-status"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const testUpload = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("onedrive-test-upload", { method: "POST" });
      if (error) throw error;
      return data as { ok: boolean; path?: string; web_url?: string; error?: string };
    },
    onSuccess: (d) => {
      if (d.ok) {
        toast.success(`Test file uploaded to ${d.path}`);
        qc.invalidateQueries({ queryKey: ["onedrive-uploads"] });
      } else {
        toast.error(d.error ?? "Test upload failed");
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Test upload failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-primary" /> Microsoft OneDrive
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
          </div>
        ) : status?.connected ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="default">Connected</Badge>
              <span className="text-sm font-medium">{status.drive_name ?? "OneDrive"}</span>
              {status.owner && <span className="text-xs text-muted-foreground">· {status.owner}</span>}
              {status.quota?.total && (
                <span className="text-xs text-muted-foreground">
                  · {formatBytes(status.quota.used)} of {formatBytes(status.quota.total)} used
                </span>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="onedrive-root" className="text-xs">Root folder name</Label>
              <div className="flex gap-2">
                <Input
                  id="onedrive-root"
                  value={rootFolder}
                  onChange={(e) => setRootFolder(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveRoot.mutate(rootFolder.trim() || "EcoPower UK")}
                  disabled={saveRoot.isPending || !rootFolder.trim()}
                >
                  {saveRoot.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" onClick={() => testUpload.mutate()} disabled={testUpload.isPending}>
                  {testUpload.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  Test upload
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Files land in <code>/{rootFolder || "EcoPower UK"}/Projects/&lt;Project&gt;/&lt;Work Package&gt;/&lt;Category&gt;/</code>
              </p>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Recent uploads</div>
              {uploads.length === 0 ? (
                <div className="text-xs text-muted-foreground">No uploads yet.</div>
              ) : (
                <div className="border rounded-md divide-y max-h-80 overflow-auto">
                  {uploads.map((u: any) => (
                    <div key={u.id} className="flex items-center gap-2 p-2 text-xs">
                      <Badge variant={u.status === "ok" ? "secondary" : "destructive"} className="shrink-0">
                        {u.entity_type}
                      </Badge>
                      <div className="flex-1 truncate">
                        <div className="truncate font-mono">{u.path}</div>
                        {u.status !== "ok" && u.error && (
                          <div className="text-destructive truncate">{u.error}</div>
                        )}
                      </div>
                      <span className="text-muted-foreground shrink-0">
                        {format(new Date(u.created_at), "d MMM HH:mm")}
                      </span>
                      {u.web_url && (
                        <a href={u.web_url} target="_blank" rel="noreferrer" className="text-primary shrink-0">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600" />
            <span>
              OneDrive connector is not linked. Ask an admin to link the Microsoft OneDrive connection
              in workspace connector settings.
              {status?.error && <> Details: {status.error}</>}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}