/** Start of day (00:00) and end of day (23:59:59.999) for a date, in unix seconds. */
export function dayBoundsSec(date: Date): { start: number; end: number } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) };
}

/** Convert "HH:MM" into a daily cron expression. */
export function cronFromHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  return `${isNaN(m) ? 0 : m} ${isNaN(h) ? 8 : h} * * *`;
}
