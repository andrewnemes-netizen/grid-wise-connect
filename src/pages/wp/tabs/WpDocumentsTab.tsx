import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FolderOpen, Download, FileText, Image as ImageIcon, FileArchive } from "lucide-react";
import { toast } from "sonner";

function iconFor(mime?: string | null) {
  if (!mime) return FileText;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.includes("zip") || mime.includes("compressed")) return FileArchive;
  return FileText;
}

function fmtBytes(b?: number | null) {
  if (!b) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}

export default function WpDocumentsTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const [q, setQ] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");

  const siteIds = useQuery({
    queryKey: ["wp-site-ids", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_sites").select("site_id").eq("work_package_id", wpId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.site_id as string);
    },
  });

  const files = useQuery({
    queryKey: ["wp-documents", wpId, siteIds.data],
    enabled: !!wpId && !!siteIds.data,
    queryFn: async () => {
      const ids = siteIds.data ?? [];
      const orParts = [
        `and(entity_type.eq.work_package,entity_id.eq.${wpId})`,
        ids.length ? `and(entity_type.eq.site,entity_id.in.(${ids.join(",")}))` : null,
      ].filter(Boolean).join(",");
      const { data, error } = await supabase
        .from("project_files")
        .select("*")
        .or(orParts)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const rows = (files.data ?? []) as any[];
    return rows.filter((r) => {
      if (entityFilter !== "all" && r.entity_type !== entityFilter) return false;
      if (q && !(`${r.filename ?? ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [files.data, q, entityFilter]);

  const download = async (row: any) => {
    if (!row.storage_path) return;
    const { data, error } = await supabase.storage.from("project-files").createSignedUrl(row.storage_path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  const counts = useMemo(() => {
    const rows = (files.data ?? []) as any[];
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.entity_type ?? "unknown"] = (c[r.entity_type ?? "unknown"] ?? 0) + 1;
    return c;
  }, [files.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            All files linked to this Work Package and its sites — grouped by owning entity.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Phase 2</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search filename…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        {["all", "work_package", "site", "purchase_order", "design_submission"].map((k) => (
          <Button key={k} size="sm" variant={entityFilter === k ? "default" : "outline"} onClick={() => setEntityFilter(k)}>
            {k.replace("_", " ")} ({counts[k] ?? 0})
          </Button>
        ))}
      </div>

      {files.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading documents…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <FolderOpen className="h-7 w-7 mx-auto text-muted-foreground" />
          <div className="text-sm text-muted-foreground">No documents match the current filter.</div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>File</TableHead><TableHead>Type</TableHead><TableHead>Linked to</TableHead>
              <TableHead>Size</TableHead><TableHead>Uploaded</TableHead><TableHead className="w-16"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((r: any) => {
                const Icon = iconFor(r.mime);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[280px]">{r.filename ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.mime ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{r.entity_type ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtBytes(r.size_bytes)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => download(r)} title="Download">
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}