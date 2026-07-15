import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import WpOverviewTab from "./tabs/WpOverviewTab";
import WpSiteRegisterTab from "./tabs/WpSiteRegisterTab";
import WpMapTab from "./tabs/WpMapTab";
import WpEstimatingTab from "./tabs/WpEstimatingTab";
import WpPurchaseOrdersTab from "./tabs/WpPurchaseOrdersTab";
import WpVariationsTab from "./tabs/WpVariationsTab";
import WpGridStudiesTab from "./tabs/WpGridStudiesTab";
import WpDnoOffersTab from "./tabs/WpDnoOffersTab";
import WpDesignTab from "./tabs/WpDesignTab";
import WpProgrammeTab from "./tabs/WpProgrammeTab";
import WpTasksTab from "./tabs/WpTasksTab";
import WpPartnersTab from "./tabs/WpPartnersTab";
import WpPreConTab from "./tabs/WpPreConTab";

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

export const WpOverview = WpOverviewTab;
export const WpSiteRegister = WpSiteRegisterTab;
export const WpMap = WpMapTab;
export const WpPreCon = WpPreConTab;
export const WpEstimating = WpEstimatingTab;
export const WpPurchaseOrders = WpPurchaseOrdersTab;
export const WpVariations = WpVariationsTab;
export const WpGridStudies = WpGridStudiesTab;
export const WpDnoOffers = WpDnoOffersTab;
export const WpDesign = WpDesignTab;
export const WpProgramme = WpProgrammeTab;
export const WpTasks = WpTasksTab;
export const WpPartners = WpPartnersTab;
export const WpDocuments = () => (
  <TabShell title="Documents" phase="Phase 2" description="Polymorphic project_files bound to this WP, its sites, POs and designs." />
);
export const WpPhotos = () => (
  <TabShell title="Photos" phase="Phase 10" description="Site photo gallery with EXIF and progress-timeline grouping." />
);
export const WpAudit = () => (
  <TabShell title="Audit" phase="Phase 2" description="audit_log stream filtered to this WP — stage transitions, offers, POs, designs, energisations." />
);