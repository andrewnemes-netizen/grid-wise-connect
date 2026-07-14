import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Base = {
  value: string | number | null | undefined;
  onSave: (v: any) => void | Promise<void>;
  pending?: boolean;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  prefix?: string;
  formatDisplay?: (v: any) => string;
};

type Props = Base & {
  type?: "text" | "number" | "date";
  options?: { value: string; label: string }[];
};

export function InlineEdit({
  value, onSave, pending, placeholder, className, displayClassName, inputClassName,
  prefix, formatDisplay, type = "text", options,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(value ?? "");
  useEffect(() => { if (!editing) setDraft(value ?? ""); }, [value, editing]);

  const commit = async () => {
    const next = type === "number" ? (draft === "" ? null : Number(draft)) : (draft === "" ? null : draft);
    await onSave(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={cn("inline-flex items-center gap-1", className)}>
        {options ? (
          <Select value={String(draft ?? "")} onValueChange={(v) => setDraft(v)}>
            <SelectTrigger className={cn("h-8 min-w-32", inputClassName)}><SelectValue /></SelectTrigger>
            <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input
            autoFocus
            type={type}
            value={draft ?? ""}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className={cn("h-8", inputClassName)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          />
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={pending} onClick={commit}><Check className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditing(false); }}><X className="h-3.5 w-3.5" /></Button>
      </div>
    );
  }

  const shown = value == null || value === ""
    ? (placeholder ?? "—")
    : formatDisplay ? formatDisplay(value) : `${prefix ?? ""}${value}`;

  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
      className={cn("group inline-flex items-center gap-1 text-left hover:text-foreground", className, displayClassName)}
    >
      <span className={cn(value == null || value === "" ? "text-muted-foreground italic" : "")}>{shown}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}