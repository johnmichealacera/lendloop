const DAY_MS = 24 * 60 * 60 * 1000;

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / DAY_MS;
}

export function addDays(day: string, days: number): string {
  return new Date((dayNumber(day) + days) * DAY_MS).toISOString().slice(0, 10);
}

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

export function formatRange(start: string, end: string): string {
  const a = fmt.format(new Date(`${start}T00:00:00Z`));
  return start === end ? a : `${a} – ${fmt.format(new Date(`${end}T00:00:00Z`))}`;
}
