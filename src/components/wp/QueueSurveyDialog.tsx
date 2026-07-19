import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ClipboardList, Mail, Link as LinkIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { sendSurveyToSites } from "@/lib/sendSurveyToSites";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteIds: string[];
  workPackageId: string;
  onDone: () => void;
}

interface SiteRow {
  id: string;
  site_name: string | null;
  postcode: string | null;
  surveyor_email: string | null;
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function QueueSurveyDialog({ open, onOpenChange, siteIds, workPackageId, onDone }: Props) {
  const siteCount = siteIds.length;
  const defaultDue = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }, []);

  const [ownerUserId, setOwnerUserId] = useState<string>("");
  const [dueDate, setDueDate] = useState(defaultDue);
  const [note, setNote] = useState("");
  const [sendToContact, setSendToContact] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<"email" | "link_only">("email");
  const [useSiteContact, setUseSiteContact] = useState(true);
  const [extraEmails, setExtraEmails] = useState("");
  const [surveyorName, setSurveyorName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setOwnerUserId("");
      setDueDate(defaultDue);
      setNote("");
      setSendToContact(false);
      setDeliveryMode("email");
      setUseSiteContact(true);
      setExtraEmails("");
      setSurveyorName("");
      setMessage("");
    }
  }, [open, defaultDue]);

  const { data: internalUsers = [] } = useQuery({
    queryKey: ["queue-survey-internal-users"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, company")
        .eq("is_approved", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []).filter((r: any) => r.user_id);
    },
  });

  const { data: sites = [], isLoading: sitesLoading } = useQuery({
    queryKey: ["queue-survey-sites", siteIds.join(",")],
    enabled: open && siteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, site_name, postcode, surveyor_email")
        .in("id", siteIds);
      if (error) throw error;
      return (data as SiteRow[]) ?? [];
    },
  });

  const sitesMissingContact = useMemo(() => sites.filter((s) => !s.surveyor_email), [sites]);
  const sitesWithContact = useMemo(() => sites.filter((s) => !!s.surveyor_email), [sites]);

  const parsedExtras = useMemo(
    () => extraEmails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean),
    [extraEmails],
  );
  const extrasValid = parsedExtras.every(isEmail);

  const canSubmit = useMemo(() => {
    if (!ownerUserId) return false;
    if (!dueDate) return false;
    if (!sendToContact) return true;
    if (deliveryMode === "link_only") return true;
    if (useSiteContact && sitesWithContact.length === sites.length) return true;
    if (parsedExtras.length > 0 && extrasValid) return true;
    return false;
  }, [ownerUserId, dueDate, sendToContact, deliveryMode, useSiteContact, sitesWithContact.length, sites.length, parsedExtras, extrasValid]);

  const handleSubmit = async () => {
    if (!canSubmit || !workPackageId) return;
    setSubmitting(true);
    try {
      const owner = (internalUsers as any[]).find((u) => u.user_id === ownerUserId);

      // 1) Create wp_tasks rows with owner + due date
      const rows = siteIds.map((sid) => ({
        work_package_id: workPackageId,
        site_id: sid,
        task_kind: "survey_alloc" as const,
        title: "Allocate site survey",
        status: "not_started" as const,
        due_date: dueDate,
        owner_user_id: ownerUserId,
        description: note.trim() || null,
      }));
      const { error: taskErr } = await (supabase as any).from("wp_tasks").insert(rows);
      if (taskErr) throw taskErr;

      let emailedCount = 0;
      let linksCount = 0;
      let failedCount = 0;

      // 2) Optionally send survey link to contacts
      if (sendToContact) {
        const summary = await sendSurveyToSites({
          sites,
          deliveryMode,
          useSiteContact,
          extraEmails: parsedExtras,
          surveyorName,
          message,
          saveAsDefaultForExtras: false,
        });
        emailedCount = summary.emailedCount;
        linksCount = summary.linksOnlyCount;
        failedCount = summary.failedCount;
      }

      const ownerLabel = owner?.full_name ?? "team member";
      let msg = `Survey allocated to ${ownerLabel} for ${siteCount} site${siteCount === 1 ? "" : "s"}`;
      if (emailedCount > 0) msg += ` · ${emailedCount} email${emailedCount === 1 ? "" : "s"} sent`;
      if (linksCount > 0) msg += ` · ${linksCount} link${linksCount === 1 ? "" : "s"} generated`;
      toast.success(msg);
      if (failedCount > 0) toast.warning(`${failedCount} recipient(s) failed to send`);

      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to queue survey");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Queue site survey
          </DialogTitle>
          <DialogDescription>
            Create an internal "Allocate site survey" task for{" "}
            <Badge variant="secondary" className="text-[10px]">{siteCount} site{siteCount === 1 ? "" : "s"}</Badge>{" "}
            and optionally email the survey link to the site contact.
          </DialogDescription>
        </DialogHeader>

        {/* Section A — Internal task */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="text-xs font-medium uppercase text-muted-foreground">Internal task</div>

          <div className="space-y-1.5">
            <Label>Assign to team member</Label>
            <Select value={ownerUserId} onValueChange={setOwnerUserId}>
              <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
              <SelectContent>
                {(internalUsers as any[]).map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name}{u.company ? ` · ${u.company}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              The owner is notified in-app via their assigned task.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Brief for the surveyor / task notes…"
              rows={2}
              maxLength={1000}
            />
          </div>
        </div>

        {/* Section B — Send to contact */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">Also send survey to contact</div>
              <p className="text-[11px] text-muted-foreground">Emails a public survey link — no login required.</p>
            </div>
            <Switch checked={sendToContact} onCheckedChange={setSendToContact} />
          </div>

          {sendToContact && (
            <div className="space-y-3 pt-1">
              <RadioGroup
                value={deliveryMode}
                onValueChange={(v) => setDeliveryMode(v as "email" | "link_only")}
                className="grid grid-cols-2 gap-2"
              >
                <label className={`flex items-start gap-2 rounded border p-2 text-xs cursor-pointer ${deliveryMode === "email" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="email" className="mt-0.5" />
                  <span>
                    <span className="font-medium flex items-center gap-1"><Mail className="h-3 w-3" /> Send by email</span>
                  </span>
                </label>
                <label className={`flex items-start gap-2 rounded border p-2 text-xs cursor-pointer ${deliveryMode === "link_only" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="link_only" className="mt-0.5" />
                  <span>
                    <span className="font-medium flex items-center gap-1"><LinkIcon className="h-3 w-3" /> Generate link only</span>
                  </span>
                </label>
              </RadioGroup>

              {deliveryMode === "email" && (
                <>
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={useSiteContact}
                      onChange={(e) => setUseSiteContact(e.target.checked)}
                    />
                    <span>
                      Send to each site's saved <span className="font-medium">surveyor contact</span>
                      {sitesLoading ? " (loading…)" : ` (${sitesWithContact.length}/${sites.length} sites have one)`}
                    </span>
                  </label>

                  {useSiteContact && sitesMissingContact.length > 0 && (
                    <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        {sitesMissingContact.length} site{sitesMissingContact.length === 1 ? "" : "s"} have no surveyor contact.
                        Add extra emails below or switch to link-only.
                      </span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs">Extra recipients (optional)</Label>
                    <Input
                      value={extraEmails}
                      onChange={(e) => setExtraEmails(e.target.value)}
                      placeholder="alice@example.com, bob@example.com"
                    />
                    {parsedExtras.length > 0 && !extrasValid && (
                      <p className="text-[11px] text-destructive">One or more emails are invalid.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Message (optional)</Label>
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder="Optional message included in the email…"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Surveyor name (optional)</Label>
                <Input
                  value={surveyorName}
                  onChange={(e) => setSurveyorName(e.target.value)}
                  placeholder="Named surveyor for the invitation"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Working…" : sendToContact ? "Assign & send" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}