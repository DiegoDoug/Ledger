/**
 * Date helpers built on date-only ISO strings (`YYYY-MM-DD`).
 *
 * Everything here is timezone-free on purpose: a transaction dated 2026-03-01
 * is that calendar day regardless of where the browser is. Dates are only
 * converted to `Date` objects through `parseIso`, which builds a *local* noon
 * date so DST shifts can never roll a day backwards.
 */

import type { IsoDate, MonthKey } from './types'

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export function parseIso(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}

export function toIso(date: Date): IsoDate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isValidIso(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1) return false
  return d <= daysInMonth(y, m - 1)
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

export function monthKey(date: IsoDate): MonthKey {
  return date.slice(0, 7)
}

export function monthKeyFromDate(date: Date): MonthKey {
  return toIso(date).slice(0, 7)
}

export function parseMonthKey(key: MonthKey): { year: number; monthIndex: number } {
  const [y, m] = key.split('-').map(Number)
  return { year: y, monthIndex: (m ?? 1) - 1 }
}

export function monthStart(key: MonthKey): IsoDate {
  return `${key}-01`
}

export function monthEnd(key: MonthKey): IsoDate {
  const { year, monthIndex } = parseMonthKey(key)
  return `${key}-${String(daysInMonth(year, monthIndex)).padStart(2, '0')}`
}

export function addMonthsToKey(key: MonthKey, delta: number): MonthKey {
  const { year, monthIndex } = parseMonthKey(key)
  const d = new Date(year, monthIndex + delta, 1)
  return monthKeyFromDate(d)
}

/** Inclusive list of month keys from `from` to `to`. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = []
  let cursor = from
  // Guard against a reversed range producing an unbounded loop.
  for (let i = 0; i < 600 && cursor <= to; i += 1) {
    out.push(cursor)
    cursor = addMonthsToKey(cursor, 1)
  }
  return out
}

/** Add days without mutating, clamped through the local-noon convention. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseIso(date)
  d.setDate(d.getDate() + days)
  return toIso(d)
}

/**
 * Add months while clamping the day-of-month, so 31 Jan + 1 month = 28/29 Feb
 * rather than rolling into March.
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = parseIso(date)
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1, 12)
  const max = daysInMonth(target.getFullYear(), target.getMonth())
  target.setDate(Math.min(day, max))
  return toIso(target)
}

export function addYears(date: IsoDate, years: number): IsoDate {
  return addMonths(date, years * 12)
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = parseIso(to).getTime() - parseIso(from).getTime()
  return Math.round(ms / 86_400_000)
}

export function formatDate(date: IsoDate, locale = 'en-US'): string {
  return parseIso(date).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateShort(date: IsoDate, locale = 'en-US'): string {
  return parseIso(date).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

export function formatMonthLabel(key: MonthKey, opts: { short?: boolean } = {}): string {
  const { year, monthIndex } = parseMonthKey(key)
  const name = MONTH_NAMES[monthIndex] ?? ''
  return opts.short ? `${name.slice(0, 3)} ${String(year).slice(2)}` : `${name} ${year}`
}

/** "Today", "Tomorrow", "in 4 days", "3 days ago". */
export function relativeDayLabel(date: IsoDate, today: IsoDate): string {
  const diff = daysBetween(today, date)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 0) return `in ${diff} days`
  return `${Math.abs(diff)} days ago`
}

export function todayIso(): IsoDate {
  return toIso(new Date())
}
