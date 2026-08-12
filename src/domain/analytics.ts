/**
 * Reporting periods and time-series aggregation.
 *
 * Transfers never appear in any figure here — `totals` and `categoryTotals`
 * exclude them at the source, and `monthlySummaries` skips them explicitly so a
 * €500 move between accounts cannot show up as a spending spike.
 */

import {
  addMonthsToKey,
  formatMonthLabel,
  isValidIso,
  monthEnd,
  monthKey,
  monthRange,
  monthStart,
} from './dates'
import { categoryTotals, totals } from './calculations'
import type { Category, IsoDate, MonthKey, Transaction } from './types'

export type PeriodId =
  | 'this-month'
  | 'last-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'this-year'
  | 'all-time'
  | 'custom'

export interface Period {
  id: PeriodId
  label: string
  from: IsoDate
  to: IsoDate
  months: MonthKey[]
}

export const PERIOD_OPTIONS: Array<{ id: PeriodId; label: string }> = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'last-3-months', label: 'Last 3 months' },
  { id: 'last-6-months', label: 'Last 6 months' },
  { id: 'this-year', label: 'This year' },
  { id: 'all-time', label: 'All time' },
  { id: 'custom', label: 'Custom range' },
]

export interface PeriodOptions {
  /** Earliest transaction date, used to bound "all time". */
  earliest?: IsoDate
  /** Inclusive bounds for the `custom` period. */
  from?: IsoDate
  to?: IsoDate
}

export function resolvePeriod(
  id: PeriodId,
  today: IsoDate,
  options: PeriodOptions = {},
): Period {
  const { earliest, from: customFrom, to: customTo } = options
  const current = monthKey(today)
  const label = PERIOD_OPTIONS.find((p) => p.id === id)?.label ?? 'This month'

  const build = (fromMonth: MonthKey, toMonth: MonthKey): Period => ({
    id,
    label,
    from: monthStart(fromMonth),
    to: monthEnd(toMonth),
    months: monthRange(fromMonth, toMonth),
  })

  switch (id) {
    case 'last-month': {
      const m = addMonthsToKey(current, -1)
      return build(m, m)
    }
    case 'last-3-months':
      return build(addMonthsToKey(current, -2), current)
    case 'last-6-months':
      return build(addMonthsToKey(current, -5), current)
    case 'this-year':
      return build(`${current.slice(0, 4)}-01`, current)
    case 'all-time': {
      const start = earliest ? monthKey(earliest) : current
      return build(start <= current ? start : current, current)
    }
    case 'custom': {
      // Fall back to the current month if either bound is missing or malformed,
      // so a half-entered range never produces an empty or reversed report.
      if (!customFrom || !customTo || !isValidIso(customFrom) || !isValidIso(customTo)) {
        return { ...build(current, current), id, label }
      }
      const [from, to] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom]
      return {
        id,
        label,
        from,
        to,
        months: monthRange(monthKey(from), monthKey(to)),
      }
    }
    case 'this-month':
    default:
      return build(current, current)
  }
}

/** The equivalent-length window immediately before `period`, for comparisons. */
export function previousPeriod(period: Period): { from: IsoDate; to: IsoDate; months: MonthKey[] } {
  const length = Math.max(period.months.length, 1)
  const firstMonth = period.months[0] ?? ''
  const from = addMonthsToKey(firstMonth, -length)
  const to = addMonthsToKey(firstMonth, -1)
  return { from: monthStart(from), to: monthEnd(to), months: monthRange(from, to) }
}

export interface MonthlySummary {
  month: MonthKey
  label: string
  income: number
  expenses: number
  net: number
  count: number
}

/**
 * Aggregate by month across an explicit month list, so months with no activity
 * still appear as zeroes and charts keep a continuous x-axis.
 */
export function monthlySummaries(
  transactions: Transaction[],
  months: MonthKey[],
): MonthlySummary[] {
  const buckets = new Map<MonthKey, { income: number; expenses: number; count: number }>()
  for (const m of months) buckets.set(m, { income: 0, expenses: 0, count: 0 })

  for (const t of transactions) {
    const bucket = buckets.get(monthKey(t.date))
    if (!bucket) continue
    // A transfer moves money without earning or spending it.
    if (t.type === 'transfer') continue
    if (t.type === 'income') bucket.income += t.amount
    else bucket.expenses += t.amount
    bucket.count += 1
  }

  return months.map((month) => {
    const b = buckets.get(month) ?? { income: 0, expenses: 0, count: 0 }
    return {
      month,
      label: formatMonthLabel(month, { short: true }),
      income: b.income,
      expenses: b.expenses,
      net: b.income - b.expenses,
      count: b.count,
    }
  })
}

export interface PeriodReport {
  period: Period
  transactions: Transaction[]
  income: number
  expenses: number
  net: number
  /** Money moved between own accounts — reported for transparency, never counted. */
  transfers: number
  /** Mean monthly spend across the period's months. */
  averageMonthlySpend: number
  monthly: MonthlySummary[]
  byCategory: ReturnType<typeof categoryTotals>
  incomeByCategory: ReturnType<typeof categoryTotals>
  transactionCount: number
  /** Largest single expense in the period, if any. */
  largestExpense: Transaction | null
}

export function buildReport(
  allTransactions: Transaction[],
  categories: Category[],
  period: Period,
): PeriodReport {
  const scoped = allTransactions.filter((t) => t.date >= period.from && t.date <= period.to)
  const t = totals(scoped)
  const monthly = monthlySummaries(scoped, period.months)

  let largestExpense: Transaction | null = null
  for (const tx of scoped) {
    if (tx.type !== 'expense') continue
    if (!largestExpense || tx.amount > largestExpense.amount) largestExpense = tx
  }

  return {
    period,
    transactions: scoped,
    income: t.income,
    expenses: t.expenses,
    net: t.net,
    transfers: t.transfers,
    averageMonthlySpend:
      period.months.length > 0 ? Math.round(t.expenses / period.months.length) : 0,
    monthly,
    byCategory: categoryTotals(scoped, categories, 'expense'),
    incomeByCategory: categoryTotals(scoped, categories, 'income'),
    transactionCount: scoped.length,
    largestExpense,
  }
}

/** Earliest transaction date, used to bound the "all time" period. */
export function earliestDate(transactions: Transaction[]): IsoDate | undefined {
  let earliest: IsoDate | undefined
  for (const t of transactions) {
    if (!earliest || t.date < earliest) earliest = t.date
  }
  return earliest
}

/**
 * Simple spending trend: mean of the most recent half of the window versus the
 * mean of the earlier half. Positive means spending is increasing.
 */
export function spendingTrend(monthly: MonthlySummary[]): number | null {
  if (monthly.length < 2) return null
  const mid = Math.floor(monthly.length / 2)
  const earlier = monthly.slice(0, mid)
  const later = monthly.slice(mid)
  const mean = (rows: MonthlySummary[]) =>
    rows.length ? rows.reduce((s, r) => s + r.expenses, 0) / rows.length : 0
  const before = mean(earlier)
  const after = mean(later)
  if (before === 0) return null
  return ((after - before) / before) * 100
}

/**
 * Per-category movement between two windows, for the "which categories are
 * increasing?" question. Sorted by the largest absolute change first.
 */
export interface CategoryDelta {
  categoryId: string
  name: string
  color: string
  current: number
  previous: number
  change: number
  /** Percentage change, or null when there is no prior spending to compare. */
  percent: number | null
}

export function categoryDeltas(
  current: Transaction[],
  previous: Transaction[],
  categories: Category[],
): CategoryDelta[] {
  const currentTotals = categoryTotals(current, categories, 'expense')
  const previousTotals = new Map(
    categoryTotals(previous, categories, 'expense').map((c) => [c.categoryId, c.amount]),
  )

  const rows: CategoryDelta[] = currentTotals.map((c) => {
    const prior = previousTotals.get(c.categoryId) ?? 0
    return {
      categoryId: c.categoryId,
      name: c.name,
      color: c.color,
      current: c.amount,
      previous: prior,
      change: c.amount - prior,
      percent: prior === 0 ? null : ((c.amount - prior) / prior) * 100,
    }
  })

  // Categories that vanished this period are still a real change.
  for (const [categoryId, amount] of previousTotals) {
    if (currentTotals.some((c) => c.categoryId === categoryId)) continue
    const category = categories.find((c) => c.id === categoryId)
    rows.push({
      categoryId,
      name: category?.name ?? 'Uncategorized',
      color: category?.color ?? 'viz-neutral',
      current: 0,
      previous: amount,
      change: -amount,
      percent: -100,
    })
  }

  return rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
}
