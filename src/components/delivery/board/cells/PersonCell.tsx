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
      const { data } = await supabase.from("profiles").select("user_id,full_name").limit(50);
      return data ?? [];
    },
  });
  const current = (people as any[]).find((p) => p.user_id === value);
  const label = current ? (current.full_name || "?") : null;

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
            key={p.user_id}
            onClick={() => onChange(p.user_id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted"
          >
            <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
              {initials(p.full_name || "?")}
            </span>
            <span className="truncate">{p.full_name || p.user_id}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}