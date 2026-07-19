import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

export function TextCell({
  value,
  onChange,
  mono,
  onOpen,
  openLabel = "Open",
}: {
  value: any;
  onChange: (v: string) => void;
  mono?: boolean;
  onOpen?: () => void;
  openLabel?: string;
}) {
  const [v, setV] = useState<string>(value ?? "");
  const [editing, setEditing] = useState(false);
  useEffect(() => setV(value ?? ""), [value]);

  if (onOpen && !editing) {
    return (
      <div className="w-full h-full flex items-center justify-between px-2 group">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="flex-1 text-left text-sm font-medium hover:underline truncate"
          title={openLabel}
        >
          {value || "—"}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground"
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <input
      autoFocus={editing}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== (value ?? "")) onChange(v);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(value ?? "");
          setEditing(false);
        }
      }}
      className={`w-full h-full px-2 bg-transparent text-sm outline-none focus:bg-background focus:ring-1 focus:ring-ring rounded ${mono ? "font-mono text-xs" : ""}`}
    />
  );
}