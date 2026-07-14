import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings, Users, FileText, Shield, SlidersHorizontal, Layers, Zap, Globe, Radar, Flame, Building2, Brain, Lightbulb, HardDrive, Receipt, Library } from "lucide-react";
import { format } from "date-fns";

import { UnitRatesSettings } from "@/components/admin/UnitRatesSettings";
import { LayerManagement } from "@/components/admin/LayerManagement";
import { UserRolesManagement } from "@/components/admin/UserRolesManagement";
import { EvHubRulesEditor } from "@/components/admin/EvHubRulesEditor";
import { DnoApiSources } from "@/components/admin/DnoApiSources";
import { NpgDatasetRegistry } from "@/components/admin/NpgDatasetRegistry";
import { GasDatasetRegistry } from "@/components/admin/GasDatasetRegistry";
import { OrgManagement } from "@/components/admin/OrgManagement";
import { RouteLearningDashboard } from "@/components/admin/RouteLearningDashboard";
import { LocalAuthorityDatasets } from "@/components/admin/LocalAuthorityDatasets";
import { SsenDriveIngest } from "@/components/admin/SsenDriveIngest";
import { EstimatingImport } from "@/components/admin/EstimatingImport";
import { RateLibrary } from "@/components/admin/RateLibrary";

const Admin = () => {
  const { hasRole } = useAuth();

  if (!hasRole("admin")) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <Shield className="h-8 w-8 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
          <p className="text-muted-foreground">Admin role required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 h-full overflow-auto">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Admin</h2>
      </div>

      <Tabs defaultValue="layers">
        <TabsList>
          <TabsTrigger value="layers"><Layers className="h-3.5 w-3.5 mr-1.5" />Layers</TabsTrigger>
          <TabsTrigger value="rates"><SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Unit Rates</TabsTrigger>
          <TabsTrigger value="evhub"><Zap className="h-3.5 w-3.5 mr-1.5" />EV Hub Rules</TabsTrigger>
          <TabsTrigger value="dno"><Radar className="h-3.5 w-3.5 mr-1.5" />DNO Registry</TabsTrigger>
          <TabsTrigger value="gas"><Flame className="h-3.5 w-3.5 mr-1.5" />Gas Registry</TabsTrigger>
          <TabsTrigger value="api"><Globe className="h-3.5 w-3.5 mr-1.5" />External APIs</TabsTrigger>
          <TabsTrigger value="la"><Lightbulb className="h-3.5 w-3.5 mr-1.5" />LA Data</TabsTrigger>
          <TabsTrigger value="ssen-drive"><HardDrive className="h-3.5 w-3.5 mr-1.5" />SSEN Drive</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1.5" />Users & Roles</TabsTrigger>
          <TabsTrigger value="orgs"><Building2 className="h-3.5 w-3.5 mr-1.5" />Organisations</TabsTrigger>
          <TabsTrigger value="audit"><FileText className="h-3.5 w-3.5 mr-1.5" />Audit Log</TabsTrigger>
          <TabsTrigger value="learning"><Brain className="h-3.5 w-3.5 mr-1.5" />Route Learning</TabsTrigger>
          <TabsTrigger value="estimating"><Receipt className="h-3.5 w-3.5 mr-1.5" />Estimating Import</TabsTrigger>
          <TabsTrigger value="ratelib"><Library className="h-3.5 w-3.5 mr-1.5" />Rate Library</TabsTrigger>
        </TabsList>

        <TabsContent value="layers" className="mt-4">
          <LayerManagement />
        </TabsContent>
        <TabsContent value="rates" className="mt-4">
          <UnitRatesSettings />
        </TabsContent>
        <TabsContent value="evhub" className="mt-4">
          <EvHubRulesEditor />
        </TabsContent>
        <TabsContent value="dno" className="mt-4">
          <NpgDatasetRegistry />
        </TabsContent>
        <TabsContent value="gas" className="mt-4">
          <GasDatasetRegistry />
        </TabsContent>
        <TabsContent value="api" className="mt-4">
          <DnoApiSources />
        </TabsContent>
        <TabsContent value="la" className="mt-4">
          <LocalAuthorityDatasets />
        </TabsContent>
        <TabsContent value="ssen-drive" className="mt-4">
          <SsenDriveIngest />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UserRolesManagement />
        </TabsContent>
        <TabsContent value="orgs" className="mt-4">
          <OrgManagement />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditLogTab />
        </TabsContent>
        <TabsContent value="learning" className="mt-4">
          <RouteLearningDashboard />
        </TabsContent>
        <TabsContent value="estimating" className="mt-4">
          <EstimatingImport />
        </TabsContent>
        <TabsContent value="ratelib" className="mt-4">
          <RateLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// UserRolesTab moved to src/components/admin/UserRolesManagement.tsx

function AuditLogTab() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Site</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No audit entries yet</TableCell></TableRow>
            ) : (
              logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(log.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                  <TableCell><Badge variant="secondary">{log.action}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.user_id?.slice(0, 8) || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.site_id?.slice(0, 8) || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default Admin;
