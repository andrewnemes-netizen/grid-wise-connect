import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Brain, TrendingUp, MapPin, Ruler, PoundSterling, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Amendment {
  id: string;
  site_id: string | null;
  created_at: string;
  dno_region: string | null;
  voltage_level: string | null;
  proposed_kw: number | null;
  ai_distance_m: number | null;
  eng_distance_m: number | null;
  distance_delta_m: number | null;
  cost_delta_pct: number | null;
  poc_shift_m: number | null;
  approved_for_training: boolean;
  amendment_notes: string | null;
}

export function RouteLearningDashboard() {
  const { data: amendments = [], isLoading, refetch } = useQuery({
    queryKey: ["route-amendments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_amendments" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as Amendment[];
    },
  });

  const toggleApproval = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("route_amendments" as any)
      .update({ approved_for_training: !current } as any)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update approval");
      return;
    }
    toast.success(!current ? "Approved for training" : "Removed from training set");
    refetch();
  };

  // Stats
  const total = amendments.length;
  const approved = amendments.filter((a) => a.approved_for_training).length;
  const avgDistDelta = total > 0
    ? Math.round(amendments.reduce((s, a) => s + Math.abs(a.distance_delta_m ?? 0), 0) / total)
    : 0;
  const avgPocShift = total > 0
    ? Math.round(amendments.reduce((s, a) => s + (a.poc_shift_m ?? 0), 0) / total)
    : 0;
  const avgCostDelta = total > 0
    ? Math.round(amendments.reduce((s, a) => s + Math.abs(a.cost_delta_pct ?? 0), 0) / total * 10) / 10
    : 0;

  // Group by DNO
  const byDno: Record<string, { count: number; avgDist: number }> = {};
  amendments.forEach((a) => {
    const key = a.dno_region || "Unknown";
    if (!byDno[key]) byDno[key] = { count: 0, avgDist: 0 };
    byDno[key].count++;
    byDno[key].avgDist += Math.abs(a.distance_delta_m ?? 0);
  });
  Object.values(byDno).forEach((v) => {
    v.avgDist = v.count > 0 ? Math.round(v.avgDist / v.count) : 0;
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Brain className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-[10px] text-muted-foreground">Total Amendments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-2xl font-bold">{approved}</p>
            <p className="text-[10px] text-muted-foreground">Approved for Training</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Ruler className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <p className="text-2xl font-bold">{avgDistDelta}m</p>
            <p className="text-[10px] text-muted-foreground">Avg Distance Delta</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MapPin className="h-5 w-5 mx-auto text-orange-600 mb-1" />
            <p className="text-2xl font-bold">{avgPocShift}m</p>
            <p className="text-[10px] text-muted-foreground">Avg POC Shift</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <PoundSterling className="h-5 w-5 mx-auto text-purple-600 mb-1" />
            <p className="text-2xl font-bold">{avgCostDelta}%</p>
            <p className="text-[10px] text-muted-foreground">Avg Cost Delta</p>
          </CardContent>
        </Card>
      </div>

      {/* DNO Breakdown */}
      {Object.keys(byDno).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Amendment Patterns by DNO
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(byDno).map(([dno, stats]) => (
                <div key={dno} className="rounded-md border p-3">
                  <p className="text-xs font-semibold">{dno}</p>
                  <p className="text-lg font-bold">{stats.count}</p>
                  <p className="text-[10px] text-muted-foreground">Avg ±{stats.avgDist}m distance correction</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Amendment List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent Amendments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">DNO</TableHead>
                <TableHead className="text-xs">Voltage</TableHead>
                <TableHead className="text-xs">kW</TableHead>
                <TableHead className="text-xs">Dist Δ</TableHead>
                <TableHead className="text-xs">POC Shift</TableHead>
                <TableHead className="text-xs">Cost Δ</TableHead>
                <TableHead className="text-xs">Training</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                </TableRow>
              ) : amendments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No amendments recorded yet. Engineer corrections will appear here automatically.
                  </TableCell>
                </TableRow>
              ) : (
                amendments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-[11px]">{format(new Date(a.created_at), "dd MMM HH:mm")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{a.dno_region || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-[11px]">{a.voltage_level || "—"}</TableCell>
                    <TableCell className="text-[11px]">{a.proposed_kw ?? "—"}</TableCell>
                    <TableCell className="text-[11px] font-mono">
                      {a.distance_delta_m != null ? (
                        <span className={a.distance_delta_m > 0 ? "text-red-600" : "text-emerald-600"}>
                          {a.distance_delta_m > 0 ? "+" : ""}{a.distance_delta_m}m
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-[11px] font-mono">{a.poc_shift_m != null ? `${a.poc_shift_m}m` : "—"}</TableCell>
                    <TableCell className="text-[11px] font-mono">
                      {a.cost_delta_pct != null ? (
                        <span className={a.cost_delta_pct > 0 ? "text-red-600" : "text-emerald-600"}>
                          {a.cost_delta_pct > 0 ? "+" : ""}{a.cost_delta_pct}%
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={a.approved_for_training}
                        onCheckedChange={() => toggleApproval(a.id, a.approved_for_training)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
