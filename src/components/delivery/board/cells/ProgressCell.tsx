import { useEffect, useState } from "react";

export function ProgressCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(value ?? 0);
  useEffect(() => setV(value ?? 0), [value]);
  const pct = Math.max(0, Math.min(100, Number(v) || 0));
  return (
    <div className="w-full h-full flex items-center gap-2 px-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: pct >= 100 ? "hsl(var(--status-done))" : "hsl(var(--status-progress))",
          }}
        />
      </div>
      <input
        value={pct}
        onChange={(e) => setV(Number(e.target.value) || 0)}
        onBlur={() => v !== value && onChange(Math.max(0, Math.min(100, Number(v) || 0)))}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-10 text-xs text-right bg-transparent outline-none tabular-nums"
        inputMode="numeric"
      />
      <span className="text-[10px] text-muted-foreground">%</span>
    </div>
  );
}