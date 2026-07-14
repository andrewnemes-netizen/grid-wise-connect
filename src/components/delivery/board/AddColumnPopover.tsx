import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { ColumnType, DEFAULT_STATUS_OPTIONS } from "@/lib/board/types";

const TYPES: { value: ColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency (£)" },
  { value: "date", label: "Date" },
  { value: "status", label: "Status (coloured)" },
  { value: "dropdown", label: "Dropdown" },
  { value: "person", label: "Person" },
  { value: "checkbox", label: "Checkbox" },
  { value: "formula", label: "Formula" },
];

export function AddColumnPopover({ onAdd }: { onAdd: (col: { key: string; label: string; type: ColumnType; options_json: any }) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<ColumnType>("text");
  const [expression, setExpression] = useState("");

  const submit = () => {
    const key = "c_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") + "_" + Math.random().toString(36).slice(2, 5);
    const options: any = {};
    if (type === "status") options.options = DEFAULT_STATUS_OPTIONS;
    if (type === "dropdown") options.options = [{ value: "opt1", label: "Option 1", color: "hsl(var(--muted))" }];
    if (type === "formula") options.expression = expression;
    if (type === "currency") options.currency = "£";
    onAdd({ key, label, type, options_json: options });
    setOpen(false); setLabel(""); setType("text"); setExpression("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8"><Plus className="h-3 w-3 mr-1" /> Column</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <div>
          <Label className="text-xs">Column name</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Vendor" className="h-8" />
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as ColumnType)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {type === "formula" && (
          <div>
            <Label className="text-xs">Formula (use {"{key}"})</Label>
            <Input value={expression} onChange={(e) => setExpression(e.target.value)} placeholder="{estimated_hours} * 85" className="h-8 font-mono text-xs" />
          </div>
        )}
        <Button disabled={!label.trim()} onClick={submit} size="sm" className="w-full">Add column</Button>
      </PopoverContent>
    </Popover>
  );
}