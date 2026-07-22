/** Working-day helpers. Weekdays only (Mon-Fri). No bank holidays for v1. */

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) remaining -= 1;
  }
  return d;
}

/** Working days between today and target. Negative = overdue. */
export function workingDaysUntil(target: Date | string): number {
  const t = typeof target === "string" ? new Date(target + "T00:00:00") : new Date(target);
  t.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (t.getTime() === today.getTime()) return 0;

  const sign = t > today ? 1 : -1;
  const start = sign > 0 ? today : t;
  const end = sign > 0 ? t : today;
  let count = 0;
  const cur = new Date(start);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    if (!isWeekend(cur)) count += 1;
  }
  return sign * count;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}