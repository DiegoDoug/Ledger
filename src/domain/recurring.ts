/**
 * Recurring transaction scheduling.
 *
 * A recurring transaction is a *rule*, not a row. The rule generates concrete
 * transactions when their date arrives (see `materialiseRecurring`), so history
 * stays editable while the schedule keeps producing the future.
 */

import { addDays, addMonths, addYears, daysBetween, toIso } from './dates'
import type { Frequency, IsoDate, RecurringTransaction, Transaction } from './types'

export function advance(date: IsoDate, frequency: Frequency, steps = 1): IsoDate {
  switch (frequency) {
    case 'weekly':
      return addDays(date, 7 * steps)
    case 'yearly':
      return addYears(date, steps)
    case 'monthly':
    default:
      return addMonths(date, steps)
  }
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

/**
 * The first occurrence strictly after `after` (or on `startDate` itself when
 * the schedule has not started yet).
 */
export function nextOccurrence(
  rule: Pick<RecurringTransaction, 'startDate' | 'frequency' | 'lastPostedDate'>,
  after: IsoDate,
): IsoDate {
  const anchor = rule.lastPostedDate && rule.lastPostedDate > rule.startDate
    ? advance(rule.lastPostedDate, rule.frequency)
    : rule.startDate

  let cursor = anchor
  // Bounded walk — 2000 steps covers ~38 years of weekly occurrences.
  for (let i = 0; i < 2000 && cursor <= after; i += 1) {
    cursor = advance(cursor, rule.frequency)
  }
  return cursor
}

/** All occurrence dates in [from, to], inclusive. */
export function occurrencesBetween(
  rule: Pick<RecurringTransaction, 'startDate' | 'frequency'>,
  from: IsoDate,
  to: IsoDate,
): IsoDate[] {
  const out: IsoDate[] = []
  let cursor = rule.startDate
  for (let i = 0; i < 2000 && cursor <= to; i += 1) {
    if (cursor >= from) out.push(cursor)
    cursor = advance(cursor, rule.frequency)
  }
  return out
}

/** Normalised monthly cost of a rule, for "committed spend" style figures. */
export function monthlyEquivalent(rule: Pick<RecurringTransaction, 'amount' | 'frequency'>): number {
  switch (rule.frequency) {
    case 'weekly':
      // 52 weeks / 12 months.
      return Math.round((rule.amount * 52) / 12)
    case 'yearly':
      return Math.round(rule.amount / 12)
    case 'monthly':
    default:
      return rule.amount
  }
}

/**
 * Committed monthly income or spending from active rules. Transfer schedules are
 * excluded — a standing move into savings is neither earned nor spent.
 */
export function monthlyCommitment(
  rules: RecurringTransaction[],
  type: 'income' | 'expense',
): number {
  return rules
    .filter((r) => r.active && r.type === type)
    .reduce((sum, r) => sum + monthlyEquivalent(r), 0)
}

export interface UpcomingOccurrence {
  rule: RecurringTransaction
  date: IsoDate
  daysAway: number
}

/** Active rules due within the next `days`, soonest first. */
export function upcomingOccurrences(
  rules: RecurringTransaction[],
  today: IsoDate,
  days = 30,
): UpcomingOccurrence[] {
  const horizon = addDays(today, days)
  const out: UpcomingOccurrence[] = []

  for (const rule of rules) {
    if (!rule.active) continue
    // `nextOccurrence` is strictly-after; step back one day so today counts.
    const date = nextOccurrence(rule, addDays(today, -1))
    if (date > horizon) continue
    out.push({ rule, date, daysAway: daysBetween(today, date) })
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.rule.name.localeCompare(b.rule.name))
}

/**
 * Generate the transactions a rule owes between its last posting and today.
 *
 * Returns the new rows plus the updated rules; the caller persists both in one
 * commit so a rule can never post the same occurrence twice.
 */
export function materialiseRecurring(
  rules: RecurringTransaction[],
  today: IsoDate,
  makeId: () => string,
  now: string = new Date().toISOString(),
): { transactions: Transaction[]; rules: RecurringTransaction[] } {
  const created: Transaction[] = []
  const updated = rules.map((rule) => {
    if (!rule.active) return rule
    let cursor = rule.lastPostedDate
      ? advance(rule.lastPostedDate, rule.frequency)
      : rule.startDate
    let lastPosted = rule.lastPostedDate
    let guard = 0

    while (cursor <= today && guard < 500) {
      const posted: Transaction = {
        id: makeId(),
        description: rule.name,
        amount: rule.amount,
        type: rule.type,
        categoryId: rule.type === 'transfer' ? null : rule.categoryId,
        accountId: rule.accountId,
        date: cursor,
        notes: rule.notes,
        recurringId: rule.id,
        createdAt: now,
        updatedAt: now,
      }
      if (rule.type === 'transfer' && rule.toAccountId) posted.toAccountId = rule.toAccountId
      created.push(posted)
      lastPosted = cursor
      cursor = advance(cursor, rule.frequency)
      guard += 1
    }

    return lastPosted === rule.lastPostedDate ? rule : { ...rule, lastPostedDate: lastPosted }
  })

  return { transactions: created, rules: updated }
}

export function todayIso(): IsoDate {
  return toIso(new Date())
}
