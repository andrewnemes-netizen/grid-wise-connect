import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Send, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  siteIds: string[];
}

interface SiteRow {
  id: string;
  site_name: string;
  postcode: string | null;
  surveyor_email: string | null;
}

export function SendSurveyDialog({ open, onOpenChange, siteIds }: Props) {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [useSiteContact, setUseSiteContact] = useState(true);
  const [extraEmails, setExtraEmails] = useState("");
  const [surveyorName, setSurveyorName] = useState("");
  const [message, setMessage] = useState("");
  const [saveDefault, setSaveDefault] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || siteIds.length === 0) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sites")
        .select("id, site_name, postcode, surveyor_email")
        .in("id", siteIds);
      setSites((data as SiteRow[]) ?? []);
      setLoading(false);
    })();
  }, [open, siteIds]);

  const sitesWithContact = useMemo(() => sites.filter((s) => s.surveyor_email), [sites]);
  const sitesMissingContact = useMemo(() => sites.filter((s) => !s.surveyor_email), [sites]);

  const parsedExtras = useMemo(
    () =>
      extraEmails
        .split(/[\s,;]+/)
        .map((e) => e.trim())
        .filter(Boolean),
    [extraEmails],
  );

  const canSend = useMemo(() => {
    if (siteIds.length === 0) return false;
    if (useSiteContact && sitesWithContact.length === sites.length && parsedExtras.length === 0) return true;
    if (parsedExtras.length > 0) return true;
    return useSiteContact && sitesWithContact.length > 0 && sitesMissingContact.length === 0;
  }, [useSiteContact, sitesWithContact, sitesMissingContact, sites, parsedExtras, siteIds]);

  const handleSend = async () => {
    setSending(true);
    try {
      const results: any[] = [];

      // Per-site sends if using saved contacts (each site gets its own recipient)
      if (useSiteContact) {
        for (const s of sitesWithContact) {
          const recipients = [{ email: s.surveyor_email!, name: surveyorName || undefined }];
          const { data, error } = await supabase.functions.invoke("send-site-survey", {
            body: {
              site_ids: [s.id],
              recipients,
              message: message || undefined,
              save_as_default: false,
              survey_base_url: window.location.origin,
            },
          });
          if (error) throw error;
          results.push(data);
        }
      }

      // Bulk extras across all sites
      if (parsedExtras.length > 0) {
        const recipients = parsedExtras.map((email) => ({ email, name: surveyorName || undefined }));
        const { data, error } = await supabase.functions.invoke("send-site-survey", {
          body: {
            site_ids: siteIds,
            recipients,
            message: message || undefined,
            save_as_default: saveDefault,
            survey_base_url: window.location.origin,
          },
        });
        if (error) throw error;
        results.push(data);
      }

      const sentTotal = results.reduce((n, r) => n + (r?.sent ?? 0), 0);
      const failedTotal = results.reduce((n, r) => n + (r?.failed ?? 0), 0);
      if (sentTotal > 0) toast.success(`Sent ${sentTotal} survey invitation${sentTotal === 1 ? "" : "s"}`);
      if (failedTotal > 0) toast.error(`${failedTotal} failed`);
      onOpenChange(false);
      setExtraEmails("");
      setMessage("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Site Survey</DialogTitle>
          <DialogDescription>
            Surveyors get a public link — no login required. Each link is unique and expires in 30 days.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Sites ({sites.length})</Label>
              <div className="mt-1 max-h-24 overflow-auto rounded border p-2 flex flex-wrap gap-1">
                {sites.map((s) => (
                  <Badge key={s.id} variant="secondary" className="text-xs">
                    {s.site_name}
                  </Badge>
                ))}
              </div>
            </div>

            {sitesWithContact.length > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={useSiteContact}
                  onCheckedChange={(v) => setUseSiteContact(Boolean(v))}
                  className="mt-0.5"
                />
                <span>
                  Send to saved site surveyor contacts ({sitesWithContact.length} of {sites.length})
                  {sitesMissingContact.length > 0 && (
                    <span className="text-muted-foreground text-xs block">
                      {sitesMissingContact.length} site(s) have no saved contact — add extras below to include them.
                    </span>
                  )}
                </span>
              </label>
            )}

            <div>
              <Label htmlFor="extras">Additional emails</Label>
              <Textarea
                id="extras"
                placeholder="alex@example.com, jane@example.com"
                value={extraEmails}
                onChange={(e) => setExtraEmails(e.target.value)}
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1">
                These recipients get a link for <b>every</b> selected site.
                {parsedExtras.length > 0 && ` (${parsedExtras.length} email${parsedExtras.length === 1 ? "" : "s"})`}
              </p>
            </div>

            {parsedExtras.length > 0 && sitesMissingContact.length > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={saveDefault}
                  onCheckedChange={(v) => setSaveDefault(Boolean(v))}
                  className="mt-0.5"
                />
                <span className="text-xs text-muted-foreground">
                  Save first extra email as the default surveyor for sites that don't have one yet
                </span>
              </label>
            )}

            <div>
              <Label htmlFor="surveyor-name">Surveyor name (optional)</Label>
              <Input
                id="surveyor-name"
                value={surveyorName}
                onChange={(e) => setSurveyorName(e.target.value)}
                placeholder="For the email greeting"
              />
            </div>

            <div>
              <Label htmlFor="message">Message (optional)</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Please complete this by Friday…"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            <X className="h-3 w-3 mr-1" /> Cancel
          </Button>
          <Button onClick={handleSend} disabled={!canSend || sending}>
            {sending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            Send Invitations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}