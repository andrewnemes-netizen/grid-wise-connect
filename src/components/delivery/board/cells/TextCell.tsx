import { useEffect, useState } from "react";

export function TextCell({ value, onChange, mono }: { value: any; onChange: (v: string) => void; mono?: boolean }) {
  const [v, setV] = useState<string>(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (value ?? "") && onChange(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setV(value ?? "");
      }}
      className={`w-full h-full px-2 bg-transparent text-sm outline-none focus:bg-background focus:ring-1 focus:ring-ring rounded ${mono ? "font-mono text-xs" : ""}`}
    />
  );
}