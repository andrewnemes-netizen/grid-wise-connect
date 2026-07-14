import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusOption } from "@/lib/board/types";
import { Check } from "lucide-react";

export function StatusCell({
  value,
  options,
  onChange,
}: {
  value: string | null | undefined;
  options: StatusOption[];
  onChange: (v: string) => void;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-full flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-foreground/80 hover:bg-muted/50 transition"
        >
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ background: current?.color ?? "hsl(var(--muted-foreground))" }}
          />
          <span className="truncate">{current?.label ?? "—"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 w-48">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium hover:bg-muted"
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: o.color }} />
            <span className="flex-1 text-left">{o.label}</span>
            {o.value === value && <Check className="h-3 w-3" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}