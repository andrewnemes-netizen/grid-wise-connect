// Safe formula evaluator: {col_key} + - * / ( ) numbers, min, max, round, if
export function evalFormula(expr: string, row: Record<string, any>): number | string {
  if (!expr) return "";
  try {
    // Replace {key} tokens
    const substituted = expr.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => {
      const v = row[k];
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? String(n) : "0";
    });
    // Whitelist: digits, whitespace, operators, parens, dot, commas, letters (for min/max/round)
    if (!/^[\d\s+\-*/().,a-zA-Z]+$/.test(substituted)) return "#ERR";
    // eslint-disable-next-line no-new-func
    const fn = new Function("min", "max", "round", `return (${substituted});`);
    const out = fn(Math.min, Math.max, Math.round);
    return typeof out === "number" && Number.isFinite(out) ? out : "#ERR";
  } catch {
    return "#ERR";
  }
}