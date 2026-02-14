import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, MapPin } from "lucide-react";

const scoreConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string }> = {
  GREEN: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  AMBER: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  RED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
};

const SiteDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isInternal = hasRole("admin") || hasRole("engineer");

  const { data: site, isLoading } = useQuery({
    queryKey: ["site", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["site-notes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_notes")
        .select("*")
        .eq("site_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) return <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>;
  if (!site) return <div className="flex h-full items-center justify-center text-muted-foreground">Site not found</div>;

  const sc = scoreConfig[site.score || "AMBER"] || scoreConfig.AMBER;
  const reasons = (site.score_reasons as string[]) || [];
  const nextSteps = (site.next_steps as string[]) || [];

  return (
    <div className="p-6 space-y-6 h-full overflow-auto max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portfolio")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-foreground">{site.site_name}</h2>
          <p className="text-sm text-muted-foreground">{site.postcode || "No postcode"} · {site.site_type || "—"}</p>
        </div>
        {site.score && (
          <div className={`ml-auto rounded-lg border px-3 py-1.5 flex items-center gap-2 ${sc.bg}`}>
            <sc.icon className={`h-4 w-4 ${sc.color}`} />
            <span className={`font-bold ${sc.color}`}>{site.score}</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="secondary" className="capitalize">{site.status}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Proposed kW</span><span>{site.proposed_kw || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Client Org</span><span>{site.client_org || "—"}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Reasons</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {reasons.length === 0 ? (
                <li className="text-xs text-muted-foreground">No reasons recorded</li>
              ) : reasons.map((r, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Next Steps</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1">
            {nextSteps.length === 0 ? (
              <li className="text-xs text-muted-foreground">No next steps recorded</li>
            ) : nextSteps.map((s, i) => (
              <li key={i} className="text-xs flex items-start gap-1.5">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isInternal && notes.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {notes.map((n: any) => (
              <div key={n.id} className="text-xs border-l-2 border-primary/30 pl-3 py-1">
                <p>{n.note}</p>
                <p className="text-muted-foreground mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SiteDetail;
