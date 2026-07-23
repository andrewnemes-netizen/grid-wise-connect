import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings, Users, FileText, Shield, SlidersHorizontal, Layers, Zap, Globe, Radar, Flame, Building2, Brain, Lightbulb, HardDrive, Library, Beaker, Handshake, Link2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
import { EstimatingLibrary } from "@/components/admin/EstimatingLibrary";
import { FeatureFlagsPanel } from "@/components/admin/FeatureFlagsPanel";
import { PartnerManagement } from "@/components/admin/PartnerManagement";
import { XeroIntegration } from "@/components/admin/XeroIntegration";
import { OneDriveIntegration } from "@/components/admin/OneDriveIntegration";

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
          <TabsTrigger value="partners"><Handshake className="h-3.5 w-3.5 mr-1.5" />Partners</TabsTrigger>
          <TabsTrigger value="audit"><FileText className="h-3.5 w-3.5 mr-1.5" />Audit Log</TabsTrigger>
          <TabsTrigger value="learning"><Brain className="h-3.5 w-3.5 mr-1.5" />Route Learning</TabsTrigger>
          <TabsTrigger value="estimating"><Library className="h-3.5 w-3.5 mr-1.5" />Estimating</TabsTrigger>
          <TabsTrigger value="flags"><Beaker className="h-3.5 w-3.5 mr-1.5" />Feature Flags</TabsTrigger>
          <TabsTrigger value="xero"><Link2 className="h-3.5 w-3.5 mr-1.5" />Integrations</TabsTrigger>
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
        <TabsContent value="partners" className="mt-4">
          <PartnerManagement />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditLogTab />
        </TabsContent>
        <TabsContent value="learning" className="mt-4">
          <RouteLearningDashboard />
        </TabsContent>
        <TabsContent value="estimating" className="mt-4">
          <EstimatingLibrary />
        </TabsContent>
        <TabsContent value="flags" className="mt-4">
          <FeatureFlagsPanel />
        </TabsContent>
        <TabsContent value="xero" className="mt-4">
          <div className="space-y-4">
            <PublicUrlSettings />
            <XeroIntegration />
            <OneDriveIntegration />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

function PublicUrlSettings() {
  const [id, setId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("id, public_app_base_url")
        .limit(1)
        .maybeSingle();
      if (data) { setId(data.id); setUrl(data.public_app_base_url ?? ""); }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!id) return;
    let clean = url.trim().replace(/\/$/, "");
    if (clean && !/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
    if (clean && /(id-preview--|preview--)/i.test(clean)) {
      toast.error("Use the published domain, not a preview URL.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ public_app_base_url: clean || null })
      .eq("id", id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { setUrl(clean); toast.success("Public URL saved"); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">Public app base URL</h3>
          <p className="text-xs text-muted-foreground">
            Used to build external survey links sent to installers and surveyors. Must be the
            published Gridwise domain — preview URLs require a Lovable login and will not work
            for external users.
          </p>
        </div>
        {loading ? (
          <div className="flex items-center text-xs text-muted-foreground"><Loader2 className="h-3 w-3 mr-2 animate-spin" />Loading…</div>
        ) : (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label htmlFor="public-url" className="text-xs">Base URL</Label>
              <Input
                id="public-url"
                placeholder="https://grid-wise-connect.lovable.app"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
