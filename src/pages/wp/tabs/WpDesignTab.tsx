import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, PencilRuler, CheckCircle2, XCircle, Calculator, ChevronDown, ExternalLink } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

const STATUSES = ["draft", "submitted", "under_review", "approved", "rejected", "withdrawn"];

function statusClass(s?: string) {
  switch (s) {
    case "approved": return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "submitted": case "under_review": return "bg-sky-500/15 text-sky-600 border-sky-500/30";
    case "rejected": case "withdrawn": return "bg-rose-500/15 text-rose-600 border-rose-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function WpDesignTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["wp-design-submissions", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("design_submissions")
        .select("*")
        .eq("work_package_id", wpId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wp-design-submissions", wpId] });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      if (status === "approved") { patch.approved_at = new Date().toISOString(); patch.is_current = true; }
      if (status === "submitted") patch.submitted_at = new Date().toISOString();
      const { error } = await supabase.from("design_submissions").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Design updated"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  if (!wpId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Design</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Design submissions, DNO reviews and the current approved design per site.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="shrink-0">Phase 5</Badge>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New submission
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading designs…</Card>
      ) : submissions.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <PencilRuler className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-medium">No design submissions yet</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Log a design submission to track the review and approval trail against this WP.
          </p>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New submission
          </Button>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {(submissions as any[]).map((d) => (
            <AccordionItem key={d.id} value={d.id} className="border rounded-lg bg-card">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4 gap-3">
                  <div className="text-left min-w-0">
                    <div className="font-medium truncate">
                      {d.title || "(untitled)"} <span className="text-xs text-muted-foreground">· rev {d.revision ?? 1}</span>
                      {d.is_current && (
                        <Badge variant="outline" className="ml-2 text-[10px] bg-primary/10 border-primary/30 text-primary">Current</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {d.submitted_at ? `Submitted ${new Date(d.submitted_at).toLocaleDateString()}` : `Created ${new Date(d.created_at).toLocaleDateString()}`}
                      {d.approved_at ? ` · Approved ${new Date(d.approved_at).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.design_type && (
                      <Badge variant="outline" className="text-[10px] uppercase">{d.design_type}</Badge>
                    )}
                    <Badge variant="outline" className={statusClass(d.status)}>{d.status}</Badge>
                    <DesignEstimateMenu wpId={wpId!} siteId={d.site_id} />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={(e) => { e.stopPropagation(); navigate(`/wp/${wpId}/engineering/design/${d.id}`); }}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                    </Button>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={d.status} onValueChange={(v) => updateStatus.mutate({ id: d.id, status: v })}>
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {d.notes && <Card className="p-3 text-sm text-muted-foreground whitespace-pre-wrap">{d.notes}</Card>}
                <DesignSites submissionId={d.id} />
                <DesignReviews submissionId={d.id} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <NewDesignDialog wpId={wpId} open={newOpen} onOpenChange={setNewOpen} onCreated={invalidate} />
    </div>
  );
}

function DesignSites({ submissionId }: { submissionId: string }) {
  return _DesignSitesImpl({ submissionId });
}

export function DesignEstimateMenu({ wpId, siteId }: { wpId: string; siteId: string | null | undefined }) {
  const navigate = useNavigate();
  const go = (mode: "detailed" | "synthetic" | "history") => {
    if (!siteId) return;
    const p = new URLSearchParams({ siteId, mode, source: "design" });
    navigate(`/wp/${wpId}/commercial/estimating?${p.toString()}`);
  };
  const trigger = (
    <Button
      size="sm"
      variant="outline"
      className="h-7"
      disabled={!siteId}
      onClick={(e) => e.stopPropagation()}
    >
      <Calculator className="h-3.5 w-3.5 mr-1" /> Estimate
      <ChevronDown className="h-3 w-3 ml-1 opacity-70" />
    </Button>
  );
  if (!siteId) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild><span>{trigger}</span></TooltipTrigger>
          <TooltipContent>Link a site to open an estimate</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Cost estimate</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go("detailed")}>Detailed Estimate</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("synthetic")}>Synthetic (Rate-Card)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go("history")}>Estimate History</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function _DesignSitesImpl({ submissionId }: { submissionId: string }) {
  const { data: rows = [] } = useQuery({
    queryKey: ["design-sites", submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_design_submissions")
        .select("site_id, is_current, sites(site_name,postcode)")
        .eq("design_submission_id", submissionId);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (rows.length === 0) return <Card className="p-3 text-sm text-muted-foreground">No sites linked.</Card>;
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader><TableRow><TableHead>Site</TableHead><TableHead>Postcode</TableHead><TableHead>Current</TableHead></TableRow></TableHeader>
        <TableBody>
          {(rows as any[]).map((r, i) => (
            <TableRow key={i}>
              <TableCell>{r.sites?.site_name ?? "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.sites?.postcode ?? "—"}</TableCell>
              <TableCell>{r.is_current ? <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function DesignReviews({ submissionId }: { submissionId: string }) {
  const { data: rows = [] } = useQuery({
    queryKey: ["design-reviews", submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("design_reviews")
        .select("*")
        .eq("design_submission_id", submissionId)
        .order("decided_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Reviews ({rows.length})</div>
      {(rows as any[]).map((r) => (
        <Card key={r.id} className="p-3 text-sm space-y-1">
          <div className="flex items-center gap-2">
            {r.decision === "approved"
              ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              : <XCircle className="h-4 w-4 text-rose-600" />}
            <span className="font-medium capitalize">{r.decision ?? "—"}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {r.decided_at ? new Date(r.decided_at).toLocaleDateString() : ""}
            </span>
          </div>
          {r.comments && <div className="text-muted-foreground whitespace-pre-wrap">{r.comments}</div>}
        </Card>
      ))}
    </div>
  );
}

function NewDesignDialog({ wpId, open, onOpenChange, onCreated }: { wpId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [revision, setRevision] = useState("1");
  const [notes, setNotes] = useState("");
  const [designType, setDesignType] = useState<"ev" | "icp">("ev");
  const [siteId, setSiteId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const reset = () => { setTitle(""); setRevision("1"); setNotes(""); setDesignType("ev"); setSiteId(undefined); };

  const { data: wpSites = [] } = useQuery({
    queryKey: ["wp-sites-for-design", wpId],
    enabled: !!wpId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_sites")
        .select("site_id, sites:sites(id, site_name, postcode)")
        .eq("work_package_id", wpId)
        .order("sequence", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("design_submissions").insert({
        work_package_id: wpId,
        title: title.trim(),
        revision: Number(revision) || 1,
        notes: notes.trim() || null,
        status: "draft",
        submitted_by_user_id: user.user?.id ?? null,
        design_type: designType,
        site_id: siteId ?? null,
      });
      if (error) throw error;
      toast.success("Design submission created");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New design submission</DialogTitle>
          <DialogDescription>Log a design revision against this work package.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Design type</Label>
              <Select value={designType} onValueChange={(v) => setDesignType(v as "ev" | "icp")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ev">EV</SelectItem>
                  <SelectItem value="icp">ICP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Site (optional)</Label>
              <Select value={siteId ?? "none"} onValueChange={(v) => setSiteId(v === "none" ? undefined : v)}>
                <SelectTrigger><SelectValue placeholder="Whole WP" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Whole work package</SelectItem>
                  {(wpSites as any[]).map((r) => (
                    <SelectItem key={r.site_id} value={r.site_id}>
                      {r.sites?.site_name ?? "Site"}{r.sites?.postcode ? ` · ${r.sites.postcode}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Detailed design v1" />
          </div>
          <div>
            <Label>Revision</Label>
            <Input type="number" min={1} value={revision} onChange={(e) => setRevision(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Approving an EV or ICP design on a linked site automatically passes the matching pre-construction gate.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}