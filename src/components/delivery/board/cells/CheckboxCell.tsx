import { Checkbox } from "@/components/ui/checkbox";

export function CheckboxCell({ value, onChange }: { value: any; onChange: (v: boolean) => void }) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <Checkbox checked={!!value} onCheckedChange={(v) => onChange(!!v)} />
    </div>
  );
}