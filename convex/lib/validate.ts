import { fail } from "./auth";
import { LIMITS } from "./limits";

export { LIMITS };

export function cleanText(value: string, field: string, max: number, { required = true } = {}): string {
  const text = value.trim();
  if (required && !text) fail("INVALID", `${field} is required.`);
  if (text.length > max) fail("INVALID", `${field} must be at most ${max} characters.`);
  return text;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function todayUtc(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function parseDay(day: string, field: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("INVALID", `${field} must be a date like 2026-11-30.`);
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== day) {
    fail("INVALID", `${field} is not a real date.`);
  }
  return ms;
}

/** Validates a borrow date range against today's date (UTC). Call only from mutations. */
export function validateLoanDates(startDate: string, endDate: string, now = Date.now()) {
  const start = parseDay(startDate, "Start date");
  const end = parseDay(endDate, "End date");
  const today = parseDay(todayUtc(now), "Today");
  if (start < today) fail("INVALID", "Start date can't be in the past.");
  if (end < start) fail("INVALID", "End date must be on or after the start date.");
  if ((end - start) / DAY_MS + 1 > LIMITS.maxLoanDays) {
    fail("INVALID", `A loan can last at most ${LIMITS.maxLoanDays} days.`);
  }
  if ((start - today) / DAY_MS > LIMITS.maxAdvanceDays) {
    fail("INVALID", `Requests can start at most ${LIMITS.maxAdvanceDays} days ahead.`);
  }
}

export function rangesOverlap(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}
