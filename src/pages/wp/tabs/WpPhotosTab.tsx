import { useMemo, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, MapPin, Calendar } from "lucide-react";
import { useSitesMap } from "./_useSitesMap";

function monthKey(d?: string | null) {
  if (!d) return "Unknown";
  const dt = new Date(d);
  return dt.toLocaleString(undefined, { year: "numeric", month: "long" });
}

function useSignedUrls(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    if (!paths.length) { setUrls({}); return; }
    (async () => {
      const { data, error } = await supabase.storage.from("project-files").createSignedUrls(paths, 60 * 30);
      if (error || !data) return;
      if (cancelled) return;
      const map: Record<string, string> = {};
      data.forEach((d: any) => { if (d.path && d.signedUrl) map[d.path] = d.signedUrl; });
      setUrls(map);
    })();
    return () => { cancelled = true; };
  }, [paths.join("|")]);
  return urls;
}

export default function WpPhotosTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const [selected, setSelected] = useState<any | null>(null);

  const photos = useQuery({
    queryKey: ["wp-photos", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_photos")
        .select("*")
        .eq("work_package_id", wpId!)
        .order("taken_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sitesMap = useSitesMap(((photos.data ?? []) as any[]).map((p) => p.site_id));

  const [filesMap, setFilesMap] = useState<Record<string, { storage_path: string; mime: string | null }>>({});
  useEffect(() => {
    const ids = Array.from(
      new Set(((photos.data ?? []) as any[]).map((p) => p.project_file_id).filter(Boolean))
    ) as string[];
    if (ids.length === 0) { setFilesMap({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("project_files").select("id, storage_path, mime").in("id", ids);
      if (cancelled || !data) return;
      const m: Record<string, any> = {};
      for (const f of data as any[]) m[f.id] = { storage_path: f.storage_path, mime: f.mime };
      setFilesMap(m);
    })();
    return () => { cancelled = true; };
  }, [photos.data]);

  const enriched = useMemo(
    () => ((photos.data ?? []) as any[]).map((p) => ({
      ...p,
      sites: p.site_id ? sitesMap[p.site_id] ?? null : null,
      project_files: p.project_file_id ? filesMap[p.project_file_id] ?? null : null,
    })),
    [photos.data, sitesMap, filesMap]
  );

  const paths = useMemo(
    () => enriched.map((p) => p.project_files?.storage_path).filter(Boolean) as string[],
    [enriched]
  );
  const urls = useSignedUrls(paths);

  const groups = useMemo(() => {
    const rows = enriched;
    const map = new Map<string, any[]>();
    for (const p of rows) {
      const site = p.sites?.site_name ?? "Unknown site";
      const month = monthKey(p.taken_at ?? p.created_at);
      const key = `${site} · ${month}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries());
  }, [enriched]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Photos</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Site photo evidence grouped by site and month, with EXIF metadata on click.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Phase 10</Badge>
      </div>

      {photos.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading photos…</Card>
      ) : groups.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <Camera className="h-7 w-7 mx-auto text-muted-foreground" />
          <div className="text-sm text-muted-foreground">No photos recorded for this WP yet.</div>
        </Card>
      ) : (
        groups.map(([key, items]) => (
          <div key={key} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">{key} · {items.length}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {items.map((p) => {
                const url = p.project_files?.storage_path
                  ? urls[p.project_files.storage_path]
                  : p.photo_url ?? null;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="group aspect-square rounded-md overflow-hidden border bg-muted relative"
                  >
                    {url ? (
                      <img src={url} alt={p.caption ?? ""} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    {p.caption && (
                      <div className="absolute bottom-0 inset-x-0 bg-background/80 text-[10px] px-1.5 py-0.5 truncate">
                        {p.caption}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{selected?.caption ?? "Photo"}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3">
              {selected.project_files?.storage_path && urls[selected.project_files.storage_path] && (
                <img src={urls[selected.project_files.storage_path]} alt="" className="w-full rounded-md" />
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Site</div>
                  <div>{selected.sites?.site_name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Taken</div>
                  <div>{selected.taken_at ? new Date(selected.taken_at).toLocaleString() : "—"}</div>
                </div>
                {(selected.latitude || selected.longitude) && (
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Location</div>
                    <div className="font-mono text-xs">{selected.latitude?.toFixed(6)}, {selected.longitude?.toFixed(6)}</div>
                  </div>
                )}
                {selected.tags?.length ? (
                  <div className="col-span-2 flex flex-wrap gap-1">
                    {selected.tags.map((t: string) => <Badge key={t} variant="secondary">{t}</Badge>)}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}