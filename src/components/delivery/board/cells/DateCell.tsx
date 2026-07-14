export function DateCell({ value, onChange }: { value: any; onChange: (v: string | null) => void }) {
  return (
    <input
      type="date"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full h-full px-2 bg-transparent text-sm outline-none focus:bg-background focus:ring-1 focus:ring-ring rounded"
    />
  );
}