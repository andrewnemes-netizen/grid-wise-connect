import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function PersonCell({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { data: people = [] } = useQuery({
    queryKey: ["board-people"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name,email").limit(50);
      return data ?? [];
    },
  });
  const current = (people as any[]).find((p) => p.id === value);
  const label = current ? (current.full_name || current.email || "?") : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="w-full h-full flex items-center justify-center hover:bg-muted/40">
          {label ? (
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
              {initials(label)}
            </span>
          ) : (
            <span className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/40" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 w-56">
        <button onClick={() => onChange(null)} className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted">
          Unassigned
        </button>
        {(people as any[]).map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted"
          >
            <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
              {initials(p.full_name || p.email || "?")}
            </span>
            <span className="truncate">{p.full_name || p.email}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}