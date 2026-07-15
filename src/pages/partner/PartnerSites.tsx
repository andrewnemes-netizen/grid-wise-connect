import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerWorkPackages } from "./usePartnerData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Circle, Zap } from "lucide-react";

interface CommissioningRow {
  id: string;
  work_package_id: string;
  site_id: string | null;
  status: string;
  energised_at: string | null;
  commissioned_at: string | null;
  mpan: string | null;
  meter_serial: string | null;
  connection_capacity_kva: number | null;
  voltage_level: string | null;
}

export default function PartnerSites() {
  const { workPackages, workPackageIds, loading: wpLoading } = usePartnerWorkPackages();
  const [params, setParams] = useSearchParams();
  const wpFilter = params.get("wp") ?? "all";
  const [rows, setRows] = useState<CommissioningRow[]>([]);
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
      const ids = wpFilter === "all" ? workPackageIds : [wpFilter];
      const { data } = await supabase
        .from("commissioning_records")
        .select(
          "id, work_package_id, site_id, status, energised_at, commissioned_at, mpan, meter_serial, connection_capacity_kva, voltage_level",
        )
        .in("work_package_id", ids)
        .order("updated_at", { ascending: false });
      setRows((data ?? []) as CommissioningRow[]);
      setLoading(false);
    })();
  }, [workPackageIds.join(","), wpLoading, wpFilter]);

  const byWp = useMemo(() => {
    const map = new Map<string, string>();
    workPackages.forEach((w) => map.set(w.id, w.name ?? w.code ?? w.id));
    return map;
  }, [workPackages]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Sites & commissioning</h1>
          <p className="text-sm text-muted-foreground">
            Live status of every site allocated to your organisation.
          </p>
        </div>
        <div className="w-56">
          <Select
            value={wpFilter}
            onValueChange={(v) => {
              const next = new URLSearchParams(params);
              if (v === "all") next.delete("wp");
              else next.set("wp", v);
              setParams(next, { replace: true });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All work packages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All work packages</SelectItem>
              {workPackages.map((wp) => (
                <SelectItem key={wp.id} value={wp.id}>
                  {wp.code ?? wp.name ?? wp.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No commissioning records yet for your allocated sites.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium">
                    {byWp.get(r.work_package_id) ?? r.work_package_id}
                  </CardTitle>
                  <StatusBadge status={r.status} />
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <Row label="MPAN" value={r.mpan ?? "—"} />
                <Row label="Meter" value={r.meter_serial ?? "—"} />
                <Row
                  label="Capacity"
                  value={r.connection_capacity_kva ? `${r.connection_capacity_kva} kVA` : "—"}
                />
                <Row label="Voltage" value={r.voltage_level ?? "—"} />
                <Row
                  label="Energised"
                  value={r.energised_at ? new Date(r.energised_at).toLocaleDateString() : "—"}
                />
                <Row
                  label="Commissioned"
                  value={r.commissioned_at ? new Date(r.commissioned_at).toLocaleDateString() : "—"}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "outline" | "secondary" | "destructive"; icon: React.ReactNode }> = {
    pending: { label: "Pending", variant: "outline", icon: <Circle className="h-3 w-3 mr-1" /> },
    in_progress: { label: "In progress", variant: "secondary", icon: <Circle className="h-3 w-3 mr-1" /> },
    energised: { label: "Energised", variant: "default", icon: <Zap className="h-3 w-3 mr-1" /> },
    commissioned: { label: "Commissioned", variant: "default", icon: <CheckCircle2 className="h-3 w-3 mr-1" /> },
    failed: { label: "Failed", variant: "destructive", icon: <Circle className="h-3 w-3 mr-1" /> },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" as const, icon: null };
  return (
    <Badge variant={cfg.variant} className="flex items-center">
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}