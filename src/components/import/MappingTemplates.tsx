import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, BookmarkPlus } from "lucide-react";

type Template = {
  id: string;
  name: string;
  mapping_json: Record<string, string | null>;
  org_id: string | null;
};

export function MappingTemplates({
  mapping,
  onApply,
}: {
  mapping: Record<string, string | null>;
  onApply: (mapping: Record<string, string | null>) => void;
}) {
  const { user, orgId } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["import-mapping-templates", orgId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_column_mappings")
        .select("id, name, mapping_json, org_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const apply = (id: string) => {
    setSelected(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      onApply((t.mapping_json ?? {}) as Record<string, string | null>);
      toast.success(`Applied template "${t.name}"`);
    }
  };

  const save = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("import_column_mappings").insert({
        name: name.trim(),
        mapping_json: mapping as never,
        org_id: orgId,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success("Template saved");
      setSaveOpen(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["import-mapping-templates"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save template";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-xs text-muted-foreground">Mapping template:</div>
      <Select value={selected} onValueChange={apply}>
        <SelectTrigger className="h-8 w-56">
          <SelectValue placeholder={templates.length ? "Load saved mapping…" : "No saved mappings yet"} />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <BookmarkPlus className="h-3.5 w-3.5 mr-1.5" /> Save as template
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save mapping template</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Template name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Connected Kerb — standard columns"
            />
            <p className="text-[11px] text-muted-foreground">
              Saved for your organisation. Re-usable on any future import with the same source columns.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              <Save className="h-4 w-4 mr-2" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}