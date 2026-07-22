import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin } from "lucide-react";

export type PickedSite = { id: string; site_name: string; postcode: string | null; local_ref: string | null };

export function EstimateSitePickerDialog({
  workPackageId,
  open,
  onOpenChange,
  onPick,
  title = "Select a site",
  confirmLabel = "Use this site",
}: {
  workPackageId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (site: PickedSite) => void;
  title?: string;
  confirmLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<PickedSite | null>(null);

  useEffect(() => { if (!open) { setQ(""); setPicked(null); } }, [open]);

  const sites = useQuery({
    queryKey: ["wp-sites-for-estimate-picker", workPackageId],
    enabled: !!workPackageId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_sites")
        .select("site_id, local_ref, sequence, sites:sites(id, site_name, postcode)")
        .eq("work_package_id", workPackageId)
        .order("sequence", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const estimates = useQuery({
    queryKey: ["estimates-per-site", workPackageId],
    enabled: !!workPackageId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates" as any)
        .select("id, site_id, status, is_current")
        .eq("work_package_id", workPackageId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const countBySite = useMemo(() => {
    const m = new Map<string, { count: number; awarded: boolean }>();
    for (const e of estimates.data ?? []) {
      if (!e.site_id) continue;
      const cur = m.get(e.site_id) ?? { count: 0, awarded: false };
      cur.count += 1;
      if (String(e.status).toUpperCase() === "AWARDED") cur.awarded = true;
      m.set(e.site_id, cur);
    }
    return m;
  }, [estimates.data]);

  const rows = useMemo(() => {
    const list = (sites.data ?? []).map((r: any) => ({
      id: r.sites?.id ?? r.site_id,
      site_name: r.sites?.site_name ?? "Site",
      postcode: r.sites?.postcode ?? null,
      local_ref: r.local_ref ?? null,
      sequence: r.sequence,
    })).filter((r: any) => r.id);
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((r: any) =>
      [r.site_name, r.postcode, r.local_ref].filter(Boolean).join(" ").toLowerCase().includes(term)
    );
  }, [sites.data, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ref or postcode…" className="pl-8" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded border divide-y">
          {sites.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading sites…</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              {sites.data?.length ? "No sites match your search." : "No sites in this Work Package's register yet."}
            </div>
          ) : rows.map((r: any) => {
            const meta = countBySite.get(r.id);
            const active = picked?.id === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setPicked({ id: r.id, site_name: r.site_name, postcode: r.postcode, local_ref: r.local_ref })}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/40 ${active ? "bg-primary/10" : ""}`}
              >
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.site_name}</span>
                    {r.local_ref && <span className="text-[11px] text-muted-foreground">{r.local_ref}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.postcode ?? "—"}</div>
                </div>
                {meta && (
                  <Badge
                    variant="outline"
                    className={
                      "text-[10px] " +
                      (meta.awarded
                        ? "bg-emerald-600/15 text-emerald-700 border-emerald-600/30"
                        : "bg-amber-500/15 text-amber-700 border-amber-500/30")
                    }
                  >
                    {meta.count} estimate{meta.count === 1 ? "" : "s"}{meta.awarded ? " · awarded" : ""}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!picked}
            onClick={() => { if (picked) { onPick(picked); onOpenChange(false); } }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}