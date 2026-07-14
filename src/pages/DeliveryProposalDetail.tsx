import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, FileText, PackageCheck } from "lucide-react";

type Mode = "new" | "existing";

export default function DeliveryProposalDetail() {
  const { id } = useParams();
  const proposalId = id!;
  const nav = useNavigate();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>("new");
  const [programmeId, setProgrammeId] = useState<string>("");
  const [wpId, setWpId] = useState<string>("");
  const [templateKey, setTemplateKey] = useState<string>("ev_hub_wp_v1");
  const effectiveTemplateKey = templateKey === "none" ? null : templateKey;
  const [newWpName, setNewWpName] = useState("");
  const [newWpCode, setNewWpCode] = useState("");

  const { data: proposal } = useQuery({
    queryKey: ["proposal", proposalId],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposals")
        .select("*, accounts(id,name), studies(id,study_name,site_id,sites(id,name,address))")
        .eq("id", proposalId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: programmes = [] } = useQuery({
    queryKey: ["programmes-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programmes")
        .select("id,name,account_id").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: wps = [] } = useQuery({
    queryKey: ["wps-picker", programmeId],
    enabled: mode === "existing" && !!programmeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("work_packages")
        .select("id,name,code,status")
        .eq("programme_id", programmeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["wp-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programme_templates")
        .select("key,name,description")
        .eq("is_published", true);
      if (error) throw error;
      return (data ?? []).filter((t: any) => t.key.startsWith("ev_hub_wp") || t.key.startsWith("connected_kerb_wp") || t.key.endsWith("_wp_v1"));
    },
  });

  const previewArgs = useMemo(() => ({
    _proposal_id: proposalId,
    _wp_id: mode === "existing" && wpId ? wpId : null,
    _template_key: effectiveTemplateKey,
  }), [proposalId, mode, wpId, effectiveTemplateKey]);

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ["accept-preview", previewArgs],
    enabled: !!proposal && (mode === "new" || !!wpId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_accept_proposal", previewArgs as any);
      if (error) throw error;
      return data as any;
    },
  });

  const accept = useMutation({
    mutationFn: async () => {
      const payload: any = {
        _proposal_id: proposalId,
        _template_key: effectiveTemplateKey,
      };
      if (mode === "existing") {
        if (!wpId) throw new Error("Choose a work package");
        payload._wp_id = wpId;
      } else {
        if (!programmeId) throw new Error("Choose a programme");
        payload._programme_id = programmeId;
        payload._new_wp_name = newWpName || null;
        payload._new_wp_code = newWpCode || null;
      }
      const { data, error } = await supabase.rpc("accept_proposal_into_wp", payload);
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res: any) => {
      toast.success("Proposal accepted");
      qc.invalidateQueries({ queryKey: ["proposal", proposalId] });
      qc.invalidateQueries({ queryKey: ["delivery-proposals"] });
      if (res?.work_package_id) nav(`/delivery/wp/${res.work_package_id}`);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to accept proposal"),
  });

  const isAccepted = proposal?.status === "accepted";
  const canPreview = mode === "new" ? !!programmeId : !!wpId;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <Link to="/delivery/proposals" className="text-sm text-muted-foreground flex items-center gap-1 mb-2 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Proposals
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              {proposal?.title ?? proposal?.studies?.study_name ?? "Proposal"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {proposal?.accounts?.name}
              {proposal?.studies?.study_name ? ` · ${proposal.studies.study_name}` : ""}
              {proposal?.studies?.sites?.name ? ` · ${proposal.studies.sites.name}` : ""}
            </p>
          </div>
          <Badge variant="secondary">{proposal?.status}</Badge>
        </div>
      </div>

      {isAccepted ? (
        <Card className="p-6">
          <div className="flex items-center gap-3 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <div>
              <div className="font-medium">Already accepted</div>
              <div className="text-sm text-muted-foreground">
                Accepted {proposal?.accepted_at ? new Date(proposal.accepted_at).toLocaleString() : ""}.
                {proposal?.snapshot_json?.work_package_id && (
                  <> <Link className="underline" to={`/delivery/wp/${proposal.snapshot_json.work_package_id}`}>Open work package</Link>.</>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-6 space-y-5">
            <div>
              <Label className="mb-2 block">Where should this proposal be delivered?</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="new" id="mode-new" />
                  <span>Create a new Work Package</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="existing" id="mode-existing" />
                  <span>Add to an existing Work Package</span>
                </label>
              </RadioGroup>
            </div>

            <div>
              <Label>Programme</Label>
              <Select value={programmeId} onValueChange={setProgrammeId}>
                <SelectTrigger><SelectValue placeholder="Choose a programme" /></SelectTrigger>
                <SelectContent>
                  {programmes.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === "existing" ? (
              <div>
                <Label>Work package</Label>
                <Select value={wpId} onValueChange={setWpId} disabled={!programmeId}>
                  <SelectTrigger><SelectValue placeholder={programmeId ? "Choose a work package" : "Pick a programme first"} /></SelectTrigger>
                  <SelectContent>
                    {wps.map((w: any) => (
                      <SelectItem key={w.id} value={w.id}>{w.name} {w.code ? `· ${w.code}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>New WP name</Label>
                  <Input value={newWpName} onChange={(e) => setNewWpName(e.target.value)} placeholder="West Yorkshire WP-04" />
                </div>
                <div>
                  <Label>New WP code</Label>
                  <Input value={newWpCode} onChange={(e) => setNewWpCode(e.target.value)} placeholder="WY-04" />
                </div>
              </div>
            )}

            <div>
              <Label>Delivery template</Label>
              <Select value={templateKey} onValueChange={setTemplateKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template (skip milestones/tasks)</SelectItem>
                  {templates.map((t: any) => (
                    <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-4 w-4" />
              <h2 className="font-medium">Confirmation preview</h2>
            </div>
            {!canPreview ? (
              <p className="text-sm text-muted-foreground">Choose a programme {mode === "existing" ? "and work package" : ""} to preview what will happen.</p>
            ) : previewLoading ? (
              <p className="text-sm text-muted-foreground">Calculating…</p>
            ) : preview ? (
              <div className="space-y-3 text-sm">
                <Row label="Site attached">
                  {preview.site?.name ?? "—"}{preview.work_package?.already_contains_site ? " (already in WP)" : ""}
                </Row>
                <Row label="Work package">
                  {mode === "new"
                    ? `New: ${newWpName || "(auto-named)"} ${newWpCode ? `· ${newWpCode}` : ""}`
                    : `${preview.work_package?.name ?? ""} (${preview.work_package?.existing_site_count ?? 0} sites already)`}
                </Row>
                <Row label="Template">{preview.template?.name ?? "None"}</Row>
                <Separator />
                <Row label="WP milestones to create">{preview.template?.wp_milestones_to_create ?? 0}</Row>
                <Row label="WP tasks to create">{preview.template?.wp_tasks_to_create ?? 0}</Row>
                <Row label="Site milestones to create">{preview.template?.site_milestones_to_create ?? 0}</Row>
                <Row label="Site tasks to create">{preview.template?.site_tasks_to_create ?? 0}</Row>
                <Separator />
                <Row label="Estimate to snapshot">
                  {preview.estimate_snapshot_total
                    ? `${proposal?.currency ?? "GBP"} ${Number(preview.estimate_snapshot_total).toLocaleString()}`
                    : "—"}
                </Row>
                <p className="text-xs text-muted-foreground">
                  The Gridwise estimate and BOQ are frozen onto the proposal at award. The site becomes part of the work package with its own delivery programme.
                </p>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => nav("/delivery/proposals")}>Cancel</Button>
              <Button
                disabled={!canPreview || accept.isPending || (mode === "new" && !programmeId) || (mode === "existing" && !wpId)}
                onClick={() => accept.mutate()}
              >
                {accept.isPending ? "Accepting…" : "Confirm and accept"}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{children}</span>
    </div>
  );
}