import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Beaker } from "lucide-react";

type FlagScope = "user" | "org" | "global";

const FLAGS: { key: string; title: string; description: string; scopes: FlagScope[] }[] = [
  {
    key: "gridwise_os_shell",
    title: "Gridwise OS Work Package shell",
    description:
      "Enables the new /wp/:id shell with the 6-group / 16-leaf navigation. When off, the legacy Work Package page is used.",
    scopes: ["user", "org", "global"],
  },
];

export function FeatureFlagsPanel() {
  const { user, orgId, isPlatformAdmin } = useAuth();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Beaker className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Feature Flags</h3>
      </div>
      <p className="text-xs text-muted-foreground max-w-2xl">
        Precedence: user overrides org, org overrides global. Turn on Gridwise OS to preview the new Work Package
        workspace without changing anything for other users.
      </p>
      {FLAGS.map((f) => (
        <Card key={f.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <code className="text-[11px] px-1.5 py-0.5 rounded bg-muted">{f.key}</code>
              <span>{f.title}</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground pt-1">{f.description}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {user && f.scopes.includes("user") && (
              <FlagRow flagKey={f.key} scope="user" scopeId={user.id} label="Only me" />
            )}
            {orgId && f.scopes.includes("org") && (
              <FlagRow flagKey={f.key} scope="org" scopeId={orgId} label="My organisation" />
            )}
            {isPlatformAdmin && f.scopes.includes("global") && (
              <FlagRow flagKey={f.key} scope="global" scopeId={null} label="Everyone (platform-wide)" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FlagRow({
  flagKey,
  scope,
  scopeId,
  label,
}: {
  flagKey: string;
  scope: FlagScope;
  scopeId: string | null;
  label: string;
}) {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ["feature-flag", flagKey, scope, scopeId],
    queryFn: async () => {
      let q = supabase.from("feature_flags").select("id, enabled").eq("flag_key", flagKey).eq("scope", scope);
      if (scope === "user") q = q.eq("user_id", scopeId!);
      else if (scope === "org") q = q.eq("org_id", scopeId!);
      else q = q.is("user_id", null).is("org_id", null);
      const { data, error } = await q.maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data ?? null;
    },
  });

  const enabled = !!data?.enabled;
  const [busy, setBusy] = useState(false);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (data?.id) {
        const { error } = await supabase.from("feature_flags").update({ enabled: next }).eq("id", data.id);
        if (error) throw error;
      } else {
        const payload: Record<string, unknown> = { flag_key: flagKey, scope, enabled: next };
        if (scope === "user") payload.user_id = scopeId;
        if (scope === "org") payload.org_id = scopeId;
        const { error } = await supabase.from("feature_flags").insert(payload as never);
        if (error) throw error;
      }
      toast.success(`${label}: ${next ? "enabled" : "disabled"}`);
      await refetch();
      qc.invalidateQueries({ queryKey: ["feature-flag", flagKey] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update flag";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">{label}</span>
        <Badge variant="outline" className="text-[10px] uppercase">{scope}</Badge>
      </div>
      <Switch checked={enabled} disabled={busy} onCheckedChange={toggle} />
    </div>
  );
}