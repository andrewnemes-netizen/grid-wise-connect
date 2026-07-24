import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const SCOPES: { code: "C" | "I" | "E"; label: string }[] = [
  { code: "C", label: "Civils" },
  { code: "I", label: "ICP" },
  { code: "E", label: "Electrical" },
];

/**
 * Lets each scope (Civils / ICP / Electrical — matching the Award Code
 * marked on rate items) be assigned to a partner for this Work Package.
 * One partner can hold multiple scopes; each scope has exactly one
 * partner at a time.
 */
export function ScopeAwardsPanel({ workPackageId }: { workPackageId: string }) {
  const qc = useQueryClient();

  const { data: partners = [] } = useQuery({
    queryKey: ["scope-awards-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners" as any)
        .select("id, name, type, status")
        .order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: awards = [], isLoading } = useQuery({
    queryKey: ["scope-awards", workPackageId],
    enabled: !!workPackageId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scope_awards" as any)
        .select("id, award_code, partner_id")
        .eq("work_package_id", workPackageId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const awardByCode = new Map<string, any>();
  for (const a of awards as any[]) awardByCode.set(a.award_code, a);

  // Which partners currently hold at least one scope — shown as a quick
  // summary so it's obvious if one partner has been given multiple scopes.
  const partnerScopeCounts = new Map<string, string[]>();
  for (const a of awards as any[]) {
    if (!a.partner_id) continue;
    const arr = partnerScopeCounts.get(a.partner_id) ?? [];
    arr.push(a.award_code);
    partnerScopeCounts.set(a.partner_id, arr);
  }

  const assign = async (code: string, partnerId: string) => {
    const existing = awardByCode.get(code);
    const value = partnerId === "__none" ? null : partnerId;
    try {
      if (existing) {
        const { error } = await supabase
          .from("scope_awards" as any)
          .update({ partner_id: value, awarded_at: value ? new Date().toISOString() : null })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("scope_awards" as any).insert({
          work_package_id: workPackageId,
          award_code: code,
          partner_id: value,
          awarded_at: value ? new Date().toISOString() : null,
        });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["scope-awards", workPackageId] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update award");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scope Awards</CardTitle>
        <CardDescription>
          Award each scope of this job to a partner. Civils, ICP, and Electrical are awarded
          independently — one partner can hold more than one scope.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {SCOPES.map(({ code, label }) => {
          const award = awardByCode.get(code);
          const otherScopes = award?.partner_id
            ? (partnerScopeCounts.get(award.partner_id) ?? []).filter((c) => c !== code)
            : [];
          return (
            <div key={code} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <Badge variant="outline" className="w-8 justify-center shrink-0">{code}</Badge>
              <div className="w-24 text-sm font-medium shrink-0">{label}</div>
              <Select
                value={award?.partner_id ?? "__none"}
                onValueChange={(v) => assign(code, v)}
                disabled={isLoading}
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder="Not awarded" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not awarded</SelectItem>
                  {(partners as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {otherScopes.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  also holds {otherScopes.join(", ")}
                </span>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
