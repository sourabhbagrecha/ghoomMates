// Calendar-day maths on YYYY-MM-DD strings in India's time, with no imports so the crowd model can use it too.

const DAY_MS = 86_400_000;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === value;
}

const dayIndex = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

export const addDays = (date: string, days: number) => new Date((dayIndex(date) + days) * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `from` to `to`; negative when `to` is earlier */
export const daysBetween = (from: string, to: string) => Math.round(dayIndex(to) - dayIndex(from));

/** Every date from `from` to `to`, both included */
export function datesBetween(from: string, to: string) {
  const count = Math.max(0, daysBetween(from, to)) + 1;
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

/** 0 = Sunday */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Today's date in India */
export const todayInIndia = (now: Date = new Date()) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
