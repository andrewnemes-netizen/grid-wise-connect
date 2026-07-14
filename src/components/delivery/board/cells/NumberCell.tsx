import { useEffect, useState } from "react";

export function NumberCell({
  value,
  onChange,
  prefix = "",
  suffix = "",
}: {
  value: any;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
}) {
  const [v, setV] = useState<string>(value == null ? "" : String(value));
  useEffect(() => setV(value == null ? "" : String(value)), [value]);
  return (
    <div className="flex items-center h-full">
      {prefix && <span className="text-xs text-muted-foreground pl-2">{prefix}</span>}
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = v === "" ? null : Number(v);
          if (n !== value) onChange(n as any);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setV(value == null ? "" : String(value));
        }}
        className="w-full h-full px-2 bg-transparent text-sm outline-none focus:bg-background focus:ring-1 focus:ring-ring rounded text-right tabular-nums"
        inputMode="decimal"
      />
      {suffix && <span className="text-xs text-muted-foreground pr-2">{suffix}</span>}
    </div>
  );
}