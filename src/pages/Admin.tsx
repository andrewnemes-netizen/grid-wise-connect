import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings, Users, FileText, Shield, Database, SlidersHorizontal, Layers } from "lucide-react";
import { format } from "date-fns";
import { DataUploader } from "@/components/admin/DataUploader";
import { UnitRatesSettings } from "@/components/admin/UnitRatesSettings";
import { LayerManagement } from "@/components/admin/LayerManagement";

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
          <TabsTrigger value="data"><Database className="h-3.5 w-3.5 mr-1.5" />Site Data</TabsTrigger>
          <TabsTrigger value="rates"><SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Unit Rates</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1.5" />Users & Roles</TabsTrigger>
          <TabsTrigger value="audit"><FileText className="h-3.5 w-3.5 mr-1.5" />Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="layers" className="mt-4">
          <LayerManagement />
        </TabsContent>
        <TabsContent value="data" className="mt-4">
          <DataUploader />
        </TabsContent>
        <TabsContent value="rates" className="mt-4">
          <UnitRatesSettings />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UserRolesTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

function UserRolesTab() {
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Group roles by user
  const userMap = new Map<string, { profile: any; roles: string[] }>();
  for (const p of profiles) {
    userMap.set(p.user_id, { profile: p, roles: [] });
  }
  for (const r of roles) {
    const entry = userMap.get(r.user_id);
    if (entry) entry.roles.push(r.role);
    else userMap.set(r.user_id, { profile: null, roles: [r.role] });
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Roles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : userMap.size === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
            ) : (
              Array.from(userMap.entries()).map(([uid, { profile, roles }]) => (
                <TableRow key={uid}>
                  <TableCell>{profile?.full_name || uid.slice(0, 8)}</TableCell>
                  <TableCell className="text-muted-foreground">{profile?.company || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {roles.map((r) => (
                        <Badge key={r} variant="outline" className="capitalize text-xs">{r}</Badge>
                      ))}
                      {roles.length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

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
