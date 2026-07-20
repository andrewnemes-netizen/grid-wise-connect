import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Calculator, FileText } from "lucide-react";
import SiteEstimatesPanel from "@/components/delivery/SiteEstimatesPanel";
import { DesignSites, DesignReviews, DesignEstimateMenu } from "./tabs/WpDesignTab";

function statusClass(s?: string) {
  switch (s) {
    case "approved": return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "submitted":
    case "under_review": return "bg-sky-500/15 text-sky-600 border-sky-500/30";
    case "rejected":
    case "withdrawn": return "bg-rose-500/15 text-rose-600 border-rose-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function WpDesignDetail() {
  const { id: wpId, submissionId } = useParams<{ id: string; submissionId: string }>();
  const navigate = useNavigate();

  const { data: design, isLoading } = useQuery({
    queryKey: ["design-submission", submissionId],
    enabled: !!submissionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("design_submissions")
        .select("*")
        .eq("id", submissionId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!wpId || !submissionId) return null;
  if (isLoading) return <Card className="p-6 text-sm text-muted-foreground">Loading design…</Card>;
  if (!design) return <Card className="p-6 text-sm text-muted-foreground">Design not found.</Card>;

  const d: any = design;
  const siteId: string | null = d.site_id ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/wp/${wpId}/engineering/design`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to designs
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{d.title || "(untitled)"}</h1>
            {d.design_type && (
              <Badge variant="outline" className="text-[10px] uppercase">{d.design_type}</Badge>
            )}
            <Badge variant="outline" className={statusClass(d.status)}>{d.status}</Badge>
            {d.is_current && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary">Current</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Revision {d.revision ?? 1}
            {d.submitted_at ? ` · Submitted ${new Date(d.submitted_at).toLocaleDateString()}` : ""}
            {d.approved_at ? ` · Approved ${new Date(d.approved_at).toLocaleDateString()}` : ""}
          </div>
        </div>
        <DesignEstimateMenu wpId={wpId} siteId={siteId} />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview"><FileText className="h-3.5 w-3.5 mr-1" /> Overview</TabsTrigger>
          <TabsTrigger value="estimate"><Calculator className="h-3.5 w-3.5 mr-1" /> Estimate</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 pt-3">
          {d.notes && <Card className="p-3 text-sm whitespace-pre-wrap">{d.notes}</Card>}
          <DesignSites submissionId={submissionId} />
          <DesignReviews submissionId={submissionId} />
        </TabsContent>

        <TabsContent value="estimate" className="pt-3">
          {!siteId ? (
            <Card className="p-6 text-sm text-muted-foreground space-y-2">
              <div className="font-medium text-foreground">No site linked to this design</div>
              <p>
                Site-level estimates need a linked site. Link a site to this design (from the design list),
                or open the{" "}
                <Link className="underline underline-offset-2" to={`/wp/${wpId}/commercial/estimating`}>
                  Work Package estimate
                </Link>{" "}
                to work across all sites.
              </p>
            </Card>
          ) : (
            <SiteEstimatesPanel wpId={wpId} focusSiteId={siteId} autoMode="detailed" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}