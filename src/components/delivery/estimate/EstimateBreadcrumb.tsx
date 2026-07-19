import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight } from "lucide-react";

/**
 * Programme › Work Package › Site › {mode}
 * Resolved from: work_packages → projects → programmes → clients (+ sites).
 */
export function EstimateBreadcrumb({
  wpId,
  siteId,
  mode,
}: {
  wpId: string;
  siteId?: string | null;
  mode?: "detailed" | "synthetic" | "history";
}) {
  const { data } = useQuery({
    queryKey: ["estimate-breadcrumb", wpId, siteId ?? null],
    queryFn: async () => {
      const { data: wp } = await supabase
        .from("work_packages")
        .select("id, name, code, project_id, projects:projects(id, name, programme_id, client_id, programmes:programmes(id, name), clients:clients(id, name))")
        .eq("id", wpId)
        .maybeSingle();
      let site: any = null;
      if (siteId) {
        const { data: s } = await supabase.from("sites").select("id, site_name").eq("id", siteId).maybeSingle();
        site = s;
      }
      return { wp, site };
    },
  });

  const wp: any = data?.wp;
  const project: any = wp?.projects;
  const programme: any = project?.programmes;
  const client: any = project?.clients;
  const site: any = data?.site;

  const modeLabel =
    mode === "detailed" ? "Detailed Estimate" :
    mode === "synthetic" ? "Synthetic Estimate" :
    mode === "history" ? "Estimate History" : "Estimate";

  const Crumb = ({ to, children }: { to?: string; children: React.ReactNode }) =>
    to ? (
      <Link to={to} className="hover:text-foreground hover:underline underline-offset-2">{children}</Link>
    ) : (
      <span>{children}</span>
    );

  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {client?.name && (<><Crumb>{client.name}</Crumb><ChevronRight className="h-3 w-3" /></>)}
      {programme?.id && (
        <>
          <Crumb to={`/programme/${programme.id}`}>{programme.name ?? "Programme"}</Crumb>
          <ChevronRight className="h-3 w-3" />
        </>
      )}
      {wp?.id && (
        <>
          <Crumb to={`/wp/${wp.id}/overview`}>{wp.code ?? wp.name ?? "Work Package"}</Crumb>
          <ChevronRight className="h-3 w-3" />
        </>
      )}
      {site?.id && (
        <>
          <Crumb to={`/site/${site.id}`}>{site.site_name ?? "Site"}</Crumb>
          <ChevronRight className="h-3 w-3" />
        </>
      )}
      <span className="text-foreground font-medium">{modeLabel}</span>
    </nav>
  );
}