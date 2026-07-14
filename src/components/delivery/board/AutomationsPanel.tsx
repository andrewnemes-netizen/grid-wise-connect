import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Zap, Trash2 } from "lucide-react";
import { BoardAutomation, BoardColumn, DEFAULT_STATUS_OPTIONS } from "@/lib/board/types";

export function AutomationsPanel({
  automations,
  columns,
  onCreate,
  onUpdate,
  onDelete,
}: {
  automations: BoardAutomation[];
  columns: BoardColumn[];
  onCreate: (a: Partial<BoardAutomation>) => void;
  onUpdate: (a: Partial<BoardAutomation> & { id: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [trigStatus, setTrigStatus] = useState("done");
  const [actionType, setActionType] = useState<"set_date_today" | "set_status">("set_date_today");
  const [actionCol, setActionCol] = useState("due_date");
  const [actionStatus, setActionStatus] = useState("done");

  const dateCols = columns.filter((c) => c.type === "date" || c.options_json?.builtinKey === "due_date" || c.options_json?.builtinKey === "start_date");

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-8"><Zap className="h-3 w-3 mr-1" /> Automations</Button>
      </SheetTrigger>
      <SheetContent className="w-96">
        <SheetHeader><SheetTitle>Automations</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          {automations.length === 0 && (
            <p className="text-xs text-muted-foreground">No rules yet. Add one below.</p>
          )}
          {automations.map((a) => (
            <div key={a.id} className="border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{a.name}</span>
                <div className="flex items-center gap-2">
                  <Switch checked={a.enabled} onCheckedChange={(v) => onUpdate({ id: a.id, enabled: v })} />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDelete(a.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                When {a.trigger_json.type === "status_changes_to" ? `status → ${a.trigger_json.status}` : "% reaches 100"}, {a.action_json.type === "set_date_today" ? `set ${a.action_json.column} to today` : `set status → ${a.action_json.status}`}
              </div>
            </div>
          ))}
          <div className="border-t pt-4 space-y-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">New rule</div>
            <Input placeholder="Rule name" value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
            <div className="text-xs">When status changes to</div>
            <Select value={trigStatus} onValueChange={setTrigStatus}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEFAULT_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="text-xs">Then</div>
            <Select value={actionType} onValueChange={(v) => setActionType(v as any)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="set_date_today">Set date column to today</SelectItem>
                <SelectItem value="set_status">Set status to</SelectItem>
              </SelectContent>
            </Select>
            {actionType === "set_date_today" ? (
              <Select value={actionCol} onValueChange={setActionCol}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {dateCols.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Select value={actionStatus} onValueChange={setActionStatus}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              className="w-full"
              disabled={!name.trim()}
              onClick={() => {
                onCreate({
                  name,
                  enabled: true,
                  trigger_json: { type: "status_changes_to", status: trigStatus } as any,
                  action_json: actionType === "set_date_today"
                    ? { type: "set_date_today", column: actionCol } as any
                    : { type: "set_status", status: actionStatus } as any,
                });
                setName("");
              }}
            >
              Add rule
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}