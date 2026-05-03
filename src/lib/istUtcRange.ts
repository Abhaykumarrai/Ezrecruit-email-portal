/**
 * India Standard Time (Asia/Kolkata). SendGrid stores UTC; we interpret UI dates as IST wall-clock days.
 * India does not observe DST — fixed offset UTC+5:30.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(s: string): boolean {
  return YMD_RE.test(s);
}

/** Start of IST calendar day (00:00:00) as a UTC instant. */
export function istCalendarStartUtc(dateYmd: string): Date {
  const [y, mo, d] = dateYmd.split("-").map((x) => Number(x));
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw new Error(`Invalid IST calendar date: ${dateYmd}`);
  }
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS);
}

/** End of IST calendar day (23:59:59.999) as a UTC instant. */
export function istCalendarEndUtc(dateYmd: string): Date {
  const [y, mo, d] = dateYmd.split("-").map((x) => Number(x));
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw new Error(`Invalid IST calendar date: ${dateYmd}`);
  }
  return new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS);
}

/** UTC ISO bounds for SendGrid when filtering by inclusive IST calendar dates [fromYmd, toYmd]. */
export function istYmdRangeToUtcIsoBounds(fromYmd: string, toYmd: string): { startIso: string; endIso: string } {
  const start = istCalendarStartUtc(fromYmd);
  const end = istCalendarEndUtc(toYmd);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** YYYY-MM-DD in Asia/Kolkata for an instant (matches `<input type="date">` semantics in IST). */
export function isoUtcToIstYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return "";
  return `${y}-${m}-${day}`;
}

export function istTodayYmd(): string {
  return isoUtcToIstYmd(new Date().toISOString());
}
