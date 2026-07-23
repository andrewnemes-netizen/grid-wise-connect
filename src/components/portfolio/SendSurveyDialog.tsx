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
import { Loader2, Send, X, Copy, Link as LinkIcon, Mail } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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

interface GeneratedLink {
  site_id: string;
  site_name?: string;
  email: string;
  survey_url: string;
  email_sent: boolean;
  error?: string;
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
  const [deliveryMode, setDeliveryMode] = useState<"email" | "link_only">("email");
  const [generated, setGenerated] = useState<GeneratedLink[]>([]);

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
    if (deliveryMode === "link_only") {
      // Link-only doesn't need real deliverable addresses. Any site selection is enough.
      return true;
    }
    if (useSiteContact && sitesWithContact.length === sites.length && parsedExtras.length === 0) return true;
    if (parsedExtras.length > 0) return true;
    return useSiteContact && sitesWithContact.length > 0 && sitesMissingContact.length === 0;
  }, [useSiteContact, sitesWithContact, sitesMissingContact, sites, parsedExtras, siteIds, deliveryMode]);

  const handleSend = async () => {
    setSending(true);
    setGenerated([]);
    try {
      const results: any[] = [];

      // Link-only mode: one placeholder recipient per site so each site gets a unique token.
      if (deliveryMode === "link_only") {
        for (const s of sites) {
          const recipients = [{
            email: s.surveyor_email || `link-only+${s.id.slice(0, 8)}@ecopoweruk.local`,
            name: surveyorName || "Site surveyor",
          }];
          const { data, error } = await supabase.functions.invoke("send-site-survey", {
            body: {
              site_ids: [s.id],
              recipients,
              delivery_mode: "link_only",
              save_as_default: false,

            },
          });
          if (error) throw error;
          results.push(data);
        }
      } else {
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

              delivery_mode: "email",
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

            delivery_mode: "email",
          },
        });
        if (error) throw error;
        results.push(data);
      }
      }

      // Flatten link results
      const links: GeneratedLink[] = results.flatMap((r) => (r?.results ?? []).filter((x: any) => x.ok));
      const emailSent = links.filter((l) => l.email_sent).length;
      const linksOnly = links.filter((l) => !l.email_sent).length;
      const failedTotal = results.reduce((n, r) => n + (r?.failed ?? 0), 0);

      if (emailSent > 0) toast.success(`Sent ${emailSent} survey invitation${emailSent === 1 ? "" : "s"}`);
      if (linksOnly > 0 && deliveryMode === "email") {
        toast.warning(`${linksOnly} link(s) generated but email delivery failed — copy the links below`);
      } else if (linksOnly > 0) {
        toast.success(`Generated ${linksOnly} link${linksOnly === 1 ? "" : "s"}`);
      }
      if (failedTotal > 0) toast.error(`${failedTotal} failed`);

      if (links.length > 0) {
        setGenerated(links);
      } else {
        onOpenChange(false);
        setExtraEmails("");
        setMessage("");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const copyAll = () => {
    const text = generated.map((l) => `${l.site_name ?? l.site_id}: ${l.survey_url}`).join("\n");
    navigator.clipboard.writeText(text);
    toast.success("All links copied");
  };

  const close = () => {
    setGenerated([]);
    setExtraEmails("");
    setMessage("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); else onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Site Survey</DialogTitle>
          <DialogDescription>
            Surveyors get a public link — no login required. Each link is unique and expires in 30 days.
          </DialogDescription>
        </DialogHeader>

        {generated.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Survey links ready ({generated.length})</p>
              <Button variant="outline" size="sm" onClick={copyAll}>
                <Copy className="h-3 w-3 mr-1" /> Copy all
              </Button>
            </div>
            <div className="max-h-72 overflow-auto space-y-2 rounded border p-2">
              {generated.map((l) => (
                <div key={l.survey_url} className="text-xs space-y-1 border-b last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{l.site_name ?? l.site_id}</span>
                    {l.email_sent ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                        <Mail className="h-3 w-3 mr-1" /> Emailed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                        <LinkIcon className="h-3 w-3 mr-1" /> Link only
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input readOnly value={l.survey_url} className="h-7 text-[11px] font-mono" />
                    <Button
                      variant="ghost" size="sm" className="h-7 px-2"
                      onClick={() => { navigator.clipboard.writeText(l.survey_url); toast.success("Link copied"); }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  {l.error && <p className="text-[10px] text-destructive">{l.error}</p>}
                </div>
              ))}
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Delivery</Label>
              <RadioGroup
                value={deliveryMode}
                onValueChange={(v) => setDeliveryMode(v as "email" | "link_only")}
                className="mt-1 grid grid-cols-2 gap-2"
              >
                <label className={`flex items-start gap-2 rounded border p-2 text-sm cursor-pointer ${deliveryMode === "email" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="email" id="dm-email" className="mt-0.5" />
                  <span>
                    <span className="font-medium flex items-center gap-1"><Mail className="h-3 w-3" /> Send by email</span>
                    <span className="block text-xs text-muted-foreground">Emails the invitation to each recipient.</span>
                  </span>
                </label>
                <label className={`flex items-start gap-2 rounded border p-2 text-sm cursor-pointer ${deliveryMode === "link_only" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="link_only" id="dm-link" className="mt-0.5" />
                  <span>
                    <span className="font-medium flex items-center gap-1"><LinkIcon className="h-3 w-3" /> Generate link</span>
                    <span className="block text-xs text-muted-foreground">Just create a link — share it via WhatsApp/SMS.</span>
                  </span>
                </label>
              </RadioGroup>
            </div>

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

            {deliveryMode === "email" && sitesWithContact.length > 0 && (
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

            {deliveryMode === "email" && (
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
            )}

            {deliveryMode === "email" && parsedExtras.length > 0 && sitesMissingContact.length > 0 && (
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

            {deliveryMode === "email" && (
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
            )}
          </div>
        )}

        <DialogFooter>
          {generated.length > 0 ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={sending}>
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
              <Button onClick={() => handleSend()} disabled={!canSend || sending}>
                {sending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : (
                  deliveryMode === "link_only" ? <LinkIcon className="h-3 w-3 mr-1" /> : <Send className="h-3 w-3 mr-1" />
                )}
                {deliveryMode === "link_only" ? "Generate Links" : "Send Invitations"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}