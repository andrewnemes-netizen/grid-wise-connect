import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function TabShell({
  title,
  phase,
  description,
  children,
}: {
  title: string;
  phase: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {phase}
        </Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming online</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {children ?? (
            <p>
              This tab is part of the Gridwise OS Work Package shell. The functional module wires in during the
              phase noted above. The shell, routing, permissions and layout baseline are live now.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const WpOverview = () => (
  <TabShell title="Overview" phase="Phase 2" description="KPI snapshot for this Work Package — sites by stage, commercial commitment, delivery health." />
);
export const WpSiteRegister = () => (
  <TabShell title="Site Register" phase="Phase 2" description="Every site in scope for this WP with stage, partner, POC status and last activity." />
);
export const WpMap = () => (
  <TabShell title="Map" phase="Phase 2" description="Geographic view of this WP filtered to its sites and DNO region." />
);
export const WpPreCon = () => (
  <TabShell title="Pre-Construction" phase="Phase 7" description="Permits, RAMS, traffic management and mobilisation readiness per site." />
);
export const WpEstimating = () => (
  <TabShell title="Estimating" phase="Phase 4" description="Client, partner and DNO cost lenses over shared estimate lines." />
);
export const WpPurchaseOrders = () => (
  <TabShell title="Purchase Orders" phase="Phase 5" description="Client and partner POs, line-level commitment and site allocations." />
);
export const WpVariations = () => (
  <TabShell title="Variations" phase="Phase 5" description="Change requests and PO amendments with approval trail." />
);
export const WpGridStudies = () => (
  <TabShell title="Grid Studies" phase="Phase 2" description="Immutable Gridwise Connect study snapshots for every site in this WP." />
);
export const WpDnoOffers = () => (
  <TabShell title="DNO Offers" phase="Phase 5" description="DNO quotations, offer status and per-site cost allocation." />
);
export const WpDesign = () => (
  <TabShell title="Design" phase="Phase 5" description="Design submissions, DNO reviews and per-site approved design pointer." />
);
export const WpProgramme = () => (
  <TabShell title="Programme" phase="Phase 2" description="Delivery programme, milestone gantt and mv_programme_dashboard KPIs." />
);
export const WpTasks = () => (
  <TabShell title="Tasks" phase="Phase 2" description="WP tasks and site tasks in a unified board, keyed to project_tasks." />
);
export const WpPartners = () => (
  <TabShell title="Partners" phase="Phase 3" description="Allocated partners, scope split and portal access status." />
);
export const WpDocuments = () => (
  <TabShell title="Documents" phase="Phase 2" description="Polymorphic project_files bound to this WP, its sites, POs and designs." />
);
export const WpPhotos = () => (
  <TabShell title="Photos" phase="Phase 10" description="Site photo gallery with EXIF and progress-timeline grouping." />
);
export const WpAudit = () => (
  <TabShell title="Audit" phase="Phase 2" description="audit_log stream filtered to this WP — stage transitions, offers, POs, designs, energisations." />
);