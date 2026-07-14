import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";

export function ApplyTemplateDialog({ projectId, hasContent }: { projectId: string; hasContent: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ["programme-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programme_templates")
        .select("id,key,name,description,template_json")
        .eq("is_published", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const apply = useMutation({
    mutationFn: async (key: string) => {
      const { data, error } = await supabase.rpc("apply_programme_template", {
        _project_id: projectId,
        _template_key: key,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(`Applied ${res?.template ?? "template"}: ${res?.milestones ?? 0} milestones, ${res?.tasks ?? 0} tasks`);
      setOpen(false); setSelected(null);
      qc.invalidateQueries({ queryKey: ["delivery-milestones", projectId] });
      qc.invalidateQueries({ queryKey: ["delivery-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["delivery-project", projectId] });
      qc.invalidateQueries({ queryKey: ["delivery-activity", projectId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Wand2 className="h-4 w-4 mr-1" /> Apply template</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply programme template</DialogTitle>
          <DialogDescription>
            {hasContent
              ? "Existing milestones and tasks are kept — template items are added alongside."
              : "Creates milestones and tasks with dates offset from the project start date. All items are fully editable afterwards and independent of the master template."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 max-h-[420px] overflow-auto">
          {templates.map((t: any) => {
            const msCount = (t.template_json?.milestones ?? []).length;
            const taskCount = (t.template_json?.milestones ?? []).reduce(
              (n: number, m: any) => n + ((m.tasks ?? []).length), 0);
            const isSel = selected === t.key;
            return (
              <Card
                key={t.id}
                onClick={() => setSelected(t.key)}
                className={`p-3 cursor-pointer transition-colors ${isSel ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}
              >
                <div className="font-medium text-sm">{t.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{msCount} milestones · {taskCount} tasks</div>
              </Card>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!selected || apply.isPending} onClick={() => selected && apply.mutate(selected)}>
            {apply.isPending ? "Applying…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}