import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, FileText, Send, Mail, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { SendSurveyDialog } from "@/components/portfolio/SendSurveyDialog";
import { collectRowsForPdf } from "@/lib/survey-schema";
import { generateSurveyPdf, type SurveyPhotoGroup } from "@/lib/survey-pdf";

interface Props { siteId: string; }

interface SurveyRow {
  id: string;
  token: string;
  sent_to_email: string;
  sent_to_name: string | null;
  status: string;
  created_at: string;
  submitted_at: string | null;
  expires_at: string;
  response_id: string | null;
}

interface ResponseRow {
  id: string;
  submitter_name: string | null;
  submitter_email: string | null;
  submitted_at: string;
  pdf_url: string | null;
  submission: any;
}

export function SiteSurveysPanel({ siteId }: Props) {
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [responses, setResponses] = useState<Record<string, ResponseRow>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [publicBase, setPublicBase] = useState<string>("");
  const [openingPdf, setOpeningPdf] = useState<string | null>(null);

  const openPdf = async (response: ResponseRow) => {
    setOpeningPdf(response.id);
    try {
      const submission = response.submission ?? {};
      const photoGroups = Array.isArray(submission._photo_groups)
        ? (submission._photo_groups as SurveyPhotoGroup[])
        : [];
      const blob = await generateSurveyPdf({
        siteName: submission.site_name_address ?? "Site Survey",
        submitterName: response.submitter_name ?? undefined,
        submitterEmail: response.submitter_email ?? undefined,
        submittedAt: response.submitted_at ? new Date(response.submitted_at) : new Date(),
        sections: collectRowsForPdf(submission),
        photoGroups,
        relevantDno: submission.relevant_dno,
        surveyDate: submission.site_survey_date,
      });
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
    } catch (e) {
      console.error(e);
      toast.error("Could not open PDF");
    } finally {
      setOpeningPdf(null);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("public_app_base_url")
        .limit(1)
        .maybeSingle();
      setPublicBase((data?.public_app_base_url ?? "").replace(/\/$/, ""));
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("site_surveys")
      .select("id, token, sent_to_email, sent_to_name, status, created_at, submitted_at, expires_at, response_id")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false });
    const rows = (data as SurveyRow[]) ?? [];
    setSurveys(rows);
    const responseIds = rows.map((r) => r.response_id).filter(Boolean) as string[];
    if (responseIds.length > 0) {
      const { data: resData } = await supabase
        .from("site_survey_responses")
        .select("id, submitter_name, submitter_email, submitted_at, pdf_url, submission")
        .in("id", responseIds);
      const map: Record<string, ResponseRow> = {};
      for (const r of ((resData as ResponseRow[]) ?? [])) map[r.id] = r;
      setResponses(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [siteId]);

  const statusBadge = (s: SurveyRow) => {
    const cls =
      s.status === "submitted" ? "bg-emerald-100 text-emerald-800" :
      s.status === "pending" ? "bg-amber-100 text-amber-800" :
      "bg-muted text-muted-foreground";
    return <Badge variant="outline" className={cls}>{s.status}</Badge>;
  };

  return (
    <>
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Site Surveys</h3>
              <Badge variant="secondary" className="text-xs">{surveys.length}</Badge>
            </div>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Send className="h-3 w-3 mr-1" /> Send Survey
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : surveys.length === 0 ? (
            <p className="text-xs text-muted-foreground">No surveys sent yet.</p>
          ) : (
            <div className="space-y-2">
              {surveys.map((s) => {
                const response = s.response_id ? responses[s.response_id] : undefined;
                const base = publicBase || window.location.origin;
                const surveyUrl = `${base}/survey/${s.token}`;
                return (
                  <div key={s.id} className="border rounded p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{s.sent_to_email}</span>
                        {statusBadge(s)}
                      </div>
                      <span className="text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {s.status === "submitted" && response ? (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-muted-foreground">
                          Submitted by {response.submitter_name ?? response.submitter_email ?? "—"}
                          {response.submission?.overall_status ? ` · ${response.submission.overall_status}` : ""}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          disabled={openingPdf === response.id}
                          onClick={() => openPdf(response)}
                        >
                          {openingPdf === response.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <FileText className="h-3 w-3 mr-1" />
                          )}
                          PDF
                        </Button>
                      </div>
                    ) : s.status === "pending" ? (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(surveyUrl);
                            toast.success("Link copied");
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" /> Copy link
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <SendSurveyDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) load(); }}
        siteIds={[siteId]}
      />
    </>
  );
}