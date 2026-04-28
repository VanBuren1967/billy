/**
 * Pure date helpers for the athlete program viewer. UTC-anchored to avoid
 * DST / locale surprises.
 */

/**
 * Compute the current program week (1-indexed) given the program's start_date,
 * today's date, and total_weeks. Returns 1 when:
 * - startDate is null (program hasn't been formally scheduled yet)
 * - today is before startDate (program hasn't started)
 *
 * Caps at totalWeeks once the program is past its scheduled end.
 *
 * Both inputs are 'YYYY-MM-DD' strings. Internal math is UTC-day-based.
 */
export function computeCurrentWeek(
  startDate: string | null,
  today: string,
  totalWeeks: number,
): number {
  if (!startDate) return 1;
  const start = Date.UTC(
    Number(startDate.slice(0, 4)),
    Number(startDate.slice(5, 7)) - 1,
    Number(startDate.slice(8, 10)),
  );
  const t = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  if (t < start) return 1;
  const daysSinceStart = Math.floor((t - start) / (24 * 60 * 60 * 1000));
  const week = Math.floor(daysSinceStart / 7) + 1;
  return Math.min(week, totalWeeks);
}

/**
 * Compute today's day-of-week as a 1-indexed value where Monday = 1, Sunday = 7.
 * Input is a 'YYYY-MM-DD' string; treated as UTC.
 */
export function computeTodayDay(today: string): number {
  const t = new Date(`${today}T00:00:00Z`);
  const dow = t.getUTCDay();
  return dow === 0 ? 7 : dow;
}
