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
          className="w-full h-full flex items-center justify-center text-xs font-medium text-white uppercase tracking-wide hover:brightness-95 transition"
          style={{ background: current?.color ?? "hsl(var(--muted))" }}
        >
          {current?.label ?? "—"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 w-48">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-white font-medium hover:brightness-95"
            style={{ background: o.color }}
          >
            <span className="flex-1 text-left">{o.label}</span>
            {o.value === value && <Check className="h-3 w-3" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}