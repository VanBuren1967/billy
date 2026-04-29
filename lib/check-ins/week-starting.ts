/**
 * Pure helper: given any date, return the Monday of that week as 'YYYY-MM-DD'.
 * Monday-anchored (matches Plan 3b's computeTodayDay where Monday=1).
 * UTC-anchored to avoid DST/locale surprises.
 */
export function computeWeekStarting(today: string): string {
  const t = new Date(`${today}T00:00:00Z`);
  const dow = t.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = dow === 0 ? 6 : dow - 1; // days back to Monday
  t.setUTCDate(t.getUTCDate() - offset);
  return t.toISOString().slice(0, 10);
}
