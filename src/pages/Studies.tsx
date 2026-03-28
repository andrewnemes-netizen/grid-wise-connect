import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Trash2, ArrowRight, Eye, Users, Package } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { generateAssessmentPdf } from "@/lib/generateAssessmentPdf";
import { useUnitRates } from "@/hooks/useUnitRates";

type Study = {
  id: string;
  study_name: string;
  mode: string;
  status: string;
  dno: string | null;
  voltage_level: string | null;
  proposed_kw: number | null;
  created_at: string;
  updated_at: string;
};

type SharedStudy = {
  id: string;
  study_id: string;
  role: string;
  created_at: string;
  study: Study;
};

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 border-yellow-200",
  complete: "bg-green-100 text-green-800 border-green-200",
  archived: "bg-muted text-muted-foreground",
};

function StudyCard({ s, onDelete, navigate, showSharedBadge, selectable, selected, onToggleSelect }: { s: Study; onDelete?: (id: string) => void; navigate: (path: string) => void; showSharedBadge?: string; selectable?: boolean; selected?: boolean; onToggleSelect?: (id: string) => void }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {selectable && (
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggleSelect?.(s.id)}
                className="mt-1"
              />
            )}
            <div className="space-y-1">
            <CardTitle className="text-lg">{s.study_name}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={statusColors[s.status] || ""}>{s.status}</Badge>
              <Badge variant="secondary">{s.mode === "connect" ? "Connect" : "Design"}</Badge>
              {s.dno && <Badge variant="outline">{s.dno}</Badge>}
              {s.voltage_level && <Badge variant="outline">{s.voltage_level}</Badge>}
              {showSharedBadge && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Users className="h-3 w-3" />{showSharedBadge}
                </Badge>
              )}
            </div>
          </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/study/${s.id}`)} title="View study details">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate(`/?study=${s.id}`)} title="Open on map">
              <ArrowRight className="h-4 w-4" />
            </Button>
            {onDelete && (
              <Button variant="ghost" size="icon" onClick={() => onDelete(s.id)} title="Delete study">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-6 text-sm text-muted-foreground">
          {s.proposed_kw != null && <span>Load: {s.proposed_kw} kW</span>}
          <span>Updated: {new Date(s.updated_at).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Studies() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<string>("connect");
  const [proposedKw, setProposedKw] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchExport = async () => {
    if (!studies || selectedIds.size === 0) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      const selected = studies.filter(s => selectedIds.has(s.id));
      for (const s of selected) {
        const doc = generateAssessmentPdf({
          siteName: s.study_name,
          proposedKw: s.proposed_kw || 0,
          score: "GREEN",
          reasons: [],
          nextSteps: [],
          skipSave: true,
        });
        const pdfBlob = doc.output("blob");
        zip.file(`${s.study_name.replace(/\s+/g, "-")}.pdf`, pdfBlob);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gridwise-reports-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${selected.length} reports`);
      setSelectedIds(new Set());
    } catch (e: any) {
      toast.error("Export failed: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  const { data: studies, isLoading } = useQuery({
    queryKey: ["studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id, study_name, mode, status, dno, voltage_level, proposed_kw, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Study[];
    },
    enabled: !!user,
  });

  // Fetch studies shared with me
  const { data: sharedStudies } = useQuery({
    queryKey: ["shared-studies"],
    queryFn: async () => {
      const { data: shares, error } = await supabase
        .from("study_shares")
        .select("id, study_id, role, created_at")
        .eq("shared_with", user!.id);
      if (error) throw error;
      if (!shares?.length) return [];

      // Fetch the actual study data for shared studies
      const studyIds = shares.map((s) => s.study_id);
      const { data: studyData, error: studyError } = await supabase
        .from("studies")
        .select("id, study_name, mode, status, dno, voltage_level, proposed_kw, created_at, updated_at")
        .in("id", studyIds)
        .order("updated_at", { ascending: false });
      if (studyError) throw studyError;

      return shares.map((share) => ({
        ...share,
        study: studyData?.find((s) => s.id === share.study_id) as Study,
      })).filter((s) => s.study) as SharedStudy[];
    },
    enabled: !!user,
  });

  const createStudy = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("studies").insert({
        study_name: name,
        mode,
        proposed_kw: proposedKw ? Number(proposedKw) : null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studies"] });
      setOpen(false);
      setName("");
      setMode("connect");
      setProposedKw("");
      toast.success("Study created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteStudy = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("studies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studies"] });
      toast.success("Study deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasShared = (sharedStudies?.length ?? 0) > 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Studies</h1>
          <p className="text-sm text-muted-foreground">Manage connection and design studies</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="outline" onClick={handleBatchExport} disabled={exporting}>
              <Package className="h-4 w-4 mr-2" />{exporting ? "Exporting…" : `Export ${selectedIds.size} as ZIP`}
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Study</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Study</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Study Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Retail Park Phase 1" />
              </div>
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="connect">Connect (Feasibility)</SelectItem>
                    <SelectItem value="design">Design (Engineering)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Proposed Load (kW)</Label>
                <Input type="number" value={proposedKw} onChange={(e) => setProposedKw(e.target.value)} placeholder="e.g. 150" />
              </div>
              <Button className="w-full" disabled={!name.trim()} onClick={() => createStudy.mutate()}>
                Create Study
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {hasShared ? (
        <Tabs defaultValue="my-studies">
          <TabsList>
            <TabsTrigger value="my-studies">My Studies</TabsTrigger>
            <TabsTrigger value="shared" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              Shared with me
              {sharedStudies && sharedStudies.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{sharedStudies.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="my-studies" className="mt-4">
            <StudyList studies={studies} isLoading={isLoading} onDelete={(id) => deleteStudy.mutate(id)} navigate={navigate} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
          </TabsContent>
          <TabsContent value="shared" className="mt-4">
            {!sharedStudies?.length ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No studies have been shared with you yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {sharedStudies.map((ss) => (
                  <StudyCard key={ss.id} s={ss.study} navigate={navigate} showSharedBadge={ss.role} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <StudyList studies={studies} isLoading={isLoading} onDelete={(id) => deleteStudy.mutate(id)} navigate={navigate} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
      )}
    </div>
  );
}

function StudyList({ studies, isLoading, onDelete, navigate, selectedIds, onToggleSelect }: { studies: Study[] | undefined; isLoading: boolean; onDelete: (id: string) => void; navigate: (path: string) => void; selectedIds?: Set<string>; onToggleSelect?: (id: string) => void }) {
  if (isLoading) return <p className="text-muted-foreground text-sm">Loading studies…</p>;
  if (!studies?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No studies yet. Create your first study to get started.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-4">
      {studies.map((s) => (
        <StudyCard key={s.id} s={s} onDelete={onDelete} navigate={navigate} selectable={!!onToggleSelect} selected={selectedIds?.has(s.id)} onToggleSelect={onToggleSelect} />
      ))}
    </div>
  );
}
