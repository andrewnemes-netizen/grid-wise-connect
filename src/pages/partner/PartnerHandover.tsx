import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerWorkPackages } from "./usePartnerData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileCheck2 } from "lucide-react";
import { toast } from "sonner";

interface HandoverRow {
  id: string;
  work_package_id: string;
  site_id: string | null;
  status: string;
  pc_signed_at: string | null;
  client_signed_at: string | null;
  om_bundle_file_id: string | null;
  warranty_start_date: string | null;
  warranty_period_months: number | null;
  handover_notes: string | null;
}

interface FileRow {
  id: string;
  filename: string | null;
  storage_path: string | null;
  mime: string | null;
}

export default function PartnerHandover() {
  const { workPackages, workPackageIds, loading: wpLoading } = usePartnerWorkPackages();
  const [rows, setRows] = useState<HandoverRow[]>([]);
  const [files, setFiles] = useState<Record<string, FileRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (wpLoading) return;
    if (workPackageIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("handover_packs")
        .select(
          "id, work_package_id, site_id, status, pc_signed_at, client_signed_at, om_bundle_file_id, warranty_start_date, warranty_period_months, handover_notes",
        )
        .in("work_package_id", workPackageIds)
        .order("updated_at", { ascending: false });
      const packs = (data ?? []) as HandoverRow[];
      setRows(packs);
      const fileIds = packs.map((p) => p.om_bundle_file_id).filter(Boolean) as string[];
      if (fileIds.length > 0) {
        const { data: fdata } = await supabase
          .from("project_files")
          .select("id, filename, storage_path, mime")
          .in("id", fileIds);
        const map: Record<string, FileRow> = {};
        (fdata ?? []).forEach((f: any) => (map[f.id] = f));
        setFiles(map);
      } else {
        setFiles({});
      }
      setLoading(false);
    })();
  }, [workPackageIds.join(","), wpLoading]);

  const byWp = useMemo(() => {
    const map = new Map<string, string>();
    workPackages.forEach((w) => map.set(w.id, w.name ?? w.code ?? w.id));
    return map;
  }, [workPackages]);

  const handleDownload = async (fileId: string) => {
    const file = files[fileId];
    if (!file || !file.storage_path) {
      toast.error("File not available");
      return;
    }
    const { data, error } = await supabase.storage
      .from("project-files")
      .createSignedUrl(file.storage_path, 300);
    if (error || !data?.signedUrl) {
      toast.error("Could not generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Handover packs</h1>
        <p className="text-sm text-muted-foreground">
          Download practical completion & O&amp;M bundles for your allocated sites.
        </p>
      </div>

      {loading || wpLoading ? (
        <Skeleton className="h-32" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No handover packs yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((r) => {
            const file = r.om_bundle_file_id ? files[r.om_bundle_file_id] : undefined;
            return (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <FileCheck2 className="h-4 w-4 text-primary" />
                      {byWp.get(r.work_package_id) ?? r.work_package_id}
                    </CardTitle>
                    <Badge variant="outline">{r.status.replace(/_/g, " ")}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Info label="PC signed" value={r.pc_signed_at ? new Date(r.pc_signed_at).toLocaleDateString() : "—"} />
                    <Info label="Client signed" value={r.client_signed_at ? new Date(r.client_signed_at).toLocaleDateString() : "—"} />
                    <Info label="Warranty starts" value={r.warranty_start_date ? new Date(r.warranty_start_date).toLocaleDateString() : "—"} />
                    <Info label="Warranty months" value={r.warranty_period_months?.toString() ?? "—"} />
                  </div>
                  {r.handover_notes && (
                    <div className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
                      {r.handover_notes}
                    </div>
                  )}
                  <div className="pt-1">
                    {file ? (
                      <Button size="sm" onClick={() => handleDownload(file.id)} className="w-full">
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Download O&amp;M bundle
                      </Button>
                    ) : (
                      <div className="text-xs text-muted-foreground text-center py-1">
                        O&amp;M bundle not yet attached
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}