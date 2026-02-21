import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, FileText, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

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

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 border-yellow-200",
  complete: "bg-green-100 text-green-800 border-green-200",
  archived: "bg-muted text-muted-foreground",
};

export default function Studies() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<string>("connect");
  const [proposedKw, setProposedKw] = useState("");

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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Studies</h1>
          <p className="text-sm text-muted-foreground">Manage connection and design studies</p>
        </div>
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

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading studies…</p>
      ) : !studies?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No studies yet. Create your first study to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {studies.map((s) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{s.study_name}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusColors[s.status] || ""}>{s.status}</Badge>
                      <Badge variant="secondary">{s.mode === "connect" ? "Connect" : "Design"}</Badge>
                      {s.dno && <Badge variant="outline">{s.dno}</Badge>}
                      {s.voltage_level && <Badge variant="outline">{s.voltage_level}</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/?study=${s.id}`)} title="Open on map">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteStudy.mutate(s.id)} title="Delete study">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
          ))}
        </div>
      )}
    </div>
  );
}
