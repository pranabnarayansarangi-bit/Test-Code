/**
 * Convert a natural-language due hint ("today", "by tomorrow 10am", "EOD") into a
 * unix-seconds timestamp. Intentionally simple and conservative: if we cannot parse a
 * concrete time, we return a sensible default (end of the referenced day) or null.
 *
 * Note: computed in the server's local time. Set the host timezone (or TZ env) to the
 * owner's timezone for best results; `timezone` is accepted for future precision.
 */
export function parseDueHint(hint: string | null, _timezone: string): number | null {
  if (!hint) return null;
  const h = hint.toLowerCase().trim();
  const now = new Date();

  const base = new Date(now);
  let matched = false;

  if (h.includes('day after tomorrow')) {
    base.setDate(base.getDate() + 2);
    matched = true;
  } else if (h.includes('tomorrow')) {
    base.setDate(base.getDate() + 1);
    matched = true;
  } else if (h.includes('today') || h.includes('eod') || h.includes('end of day')) {
    matched = true;
  } else if (h.includes('tonight')) {
    base.setHours(21, 0, 0, 0);
    return Math.floor(base.getTime() / 1000);
  }

  // Try to extract an explicit clock time like "10am", "3 pm", "14:30".
  const timeMatch = h.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3];
    if (hour <= 23 && (meridiem || h.includes(':') || hour >= 0)) {
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      // Only trust a bare number as a time when a meridiem or colon is present,
      // to avoid misreading quantities ("5 nos") as times.
      if (meridiem || timeMatch[2]) {
        base.setHours(hour, minute, 0, 0);
        return Math.floor(base.getTime() / 1000);
      }
    }
  }

  if (matched) {
    // Default to end of the referenced day (18:00 local — typical work EOD).
    base.setHours(18, 0, 0, 0);
    return Math.floor(base.getTime() / 1000);
  }

  return null;
}
