import { evalFormula } from "@/lib/board/formula";

export function FormulaCell({ expression, row, prefix = "" }: { expression: string; row: any; prefix?: string }) {
  const flatRow = { ...(row.metadata_json?.custom ?? {}), ...row };
  const v = evalFormula(expression, flatRow);
  return (
    <div className="w-full h-full flex items-center justify-end px-2 text-sm tabular-nums text-muted-foreground">
      {typeof v === "number" ? `${prefix}${v.toLocaleString()}` : String(v)}
    </div>
  );
}