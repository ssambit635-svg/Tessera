import type { DayCode } from "./types";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const DAY_ORDER: DayCode[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export const DAY_LONG: Record<DayCode, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** ISO date (local, no timezone drift) — used as keys, never parsed by Date. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function monthMatrix(date: Date): Date[][] {
  const first = startOfMonth(date);
  const gridStart = startOfWeek(first);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w += 1) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d += 1) row.push(addDays(gridStart, w * 7 + d));
    weeks.push(row);
  }
  return weeks;
}

export function dayCodeOf(date: Date): DayCode {
  return (["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][date.getDay()] as DayCode);
}

/** Sunday-first index used by the week strip (0 = Sunday). */
export function weekdayIndex(date: Date): number {
  return date.getDay();
}

export function formatDayLong(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatDayShort(date: Date): string {
  return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()}`;
}

export function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatStampShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

export function isoWeekday(date: Date): number {
  // 1 = Monday ... 7 = Sunday
  return date.getDay() === 0 ? 7 : date.getDay();
}

export function currencyFreeTime(start: string, end: string): string {
  return `${start}–${end}`;
}

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : many ?? `${one}s`}`;
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/^(\w)/, (c) => c.toUpperCase());
}

export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function periodLabel(id: number): string {
  return `P${String(id).padStart(2, "0")}`;
}

/** The published dataset labels the campus "(fictional)". Keep that provenance
 * available in a tooltip, but never let it leak into the headline. */
export function instituteName(name: string): string {
  return name.replace(/\s*\(fictional\)\s*/i, "").trim();
}

/** Division that can never produce NaN or Infinity — charts and bars depend on this. */
export function ratio(part: number, whole: number, fallback = 0): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0) return fallback;
  return part / whole;
}
