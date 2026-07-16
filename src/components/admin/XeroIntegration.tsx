import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, RefreshCw, Unplug, Users2, PoundSterling, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";

export function XeroIntegration() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    const flag = params.get("xero");
    if (flag === "connected") {
      toast.success(`Xero connected: ${params.get("tenant") ?? "organisation"}`);
      params.delete("xero"); params.delete("tenant");
      setParams(params, { replace: true });
      qc.invalidateQueries({ queryKey: ["xero-status"] });
    } else if (flag === "error") {
      toast.error(`Xero connect failed: ${params.get("reason") ?? "unknown"}`);
      params.delete("xero"); params.delete("reason");
      setParams(params, { replace: true });
    }
  }, [params, setParams, qc]);

  const { data: status, isLoading } = useQuery({
    queryKey: ["xero-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("xero-status", { method: "GET" });
      if (error) throw error;
      return data as { connected: boolean; tenant_name?: string; expires_at?: string };
    },
  });

  const connect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("xero-oauth-start", { method: "POST" });
      if (error) throw error;
      return data as { authorize_url: string };
    },
    onSuccess: ({ authorize_url }) => {
      window.open(authorize_url, "_blank", "noopener,noreferrer");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to start Xero auth"),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("xero-disconnect", { method: "POST" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Xero disconnected");
      qc.invalidateQueries({ queryKey: ["xero-status"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const syncContacts = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("xero-sync-contacts", { method: "POST" });
      if (error) throw error;
      return data as { synced: number };
    },
    onSuccess: (d) => toast.success(`Synced ${d.synced} Xero contacts`),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const syncPayments = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("xero-sync-payments", { method: "POST" });
      if (error) throw error;
      return data as { updated: number };
    },
    onSuccess: (d) => toast.success(`Refreshed ${d.updated ?? 0} invoices from Xero`),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" /> Xero Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
          </div>
        ) : status?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="default">Connected</Badge>
              <span className="text-sm font-medium">{status.tenant_name}</span>
              {status.expires_at && (
                <span className="text-xs text-muted-foreground">
                  token refreshes automatically · expires {format(new Date(status.expires_at), "HH:mm")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => syncContacts.mutate()} disabled={syncContacts.isPending}>
                {syncContacts.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Users2 className="h-4 w-4 mr-1" />}
                Sync contacts
              </Button>
              <Button size="sm" variant="outline" onClick={() => syncPayments.mutate()} disabled={syncPayments.isPending}>
                {syncPayments.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PoundSterling className="h-4 w-4 mr-1" />}
                Refresh invoice statuses
              </Button>
              <Button size="sm" variant="destructive" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                {disconnect.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Unplug className="h-4 w-4 mr-1" />}
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600" />
              <span>Not connected. Click below to authorise your Xero organisation. Invoices and POs will then push automatically when they are sent.</span>
            </div>
            <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
              {connect.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
              Connect to Xero
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}