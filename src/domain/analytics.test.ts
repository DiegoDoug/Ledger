import { describe, expect, it } from 'vitest'
import {
  buildReport,
  categoryDeltas,
  earliestDate,
  monthlySummaries,
  previousPeriod,
  resolvePeriod,
  spendingTrend,
} from './analytics'
import { monthRange } from './dates'
import type { Category, Transaction } from './types'

const categories: Category[] = [
  { id: 'c-food', name: 'Groceries', type: 'expense', color: 'viz-1' },
  { id: 'c-pay', name: 'Salary', type: 'income', color: 'viz-2' },
]

function tx(date: string, amount: number, type: Transaction['type'] = 'expense'): Transaction {
  return {
    id: `${date}-${amount}-${type}`,
    description: type === 'income' ? 'Salary' : 'Groceries',
    amount,
    type,
    categoryId: type === 'income' ? 'c-pay' : 'c-food',
    accountId: 'a1',
    date,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  }
}

describe('monthlySummaries', () => {
  const transactions = [
    tx('2026-01-05', 200_00),
    tx('2026-01-20', 150_00),
    tx('2026-01-01', 3_000_00, 'income'),
    tx('2026-03-11', 400_00),
  ]

  it('aggregates income, expenses and net per month', () => {
    const [jan] = monthlySummaries(transactions, ['2026-01'])
    expect(jan).toMatchObject({ income: 3_000_00, expenses: 350_00, net: 2_650_00, count: 3 })
  })

  it('keeps months with no activity as explicit zeroes', () => {
    const rows = monthlySummaries(transactions, monthRange('2026-01', '2026-03'))
    expect(rows.map((r) => r.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(rows[1]).toMatchObject({ income: 0, expenses: 0, net: 0, count: 0 })
  })

  it('ignores transactions outside the requested months', () => {
    const rows = monthlySummaries(transactions, ['2026-03'])
    expect(rows[0].expenses).toBe(400_00)
    expect(rows[0].count).toBe(1)
  })

  it('labels each month for the axis', () => {
    expect(monthlySummaries([], ['2026-01'])[0].label).toBe('Jan 26')
  })
})

describe('resolvePeriod', () => {
  const today = '2026-03-17'

  it('resolves this month to its first and last day', () => {
    const period = resolvePeriod('this-month', today)
    expect(period.from).toBe('2026-03-01')
    expect(period.to).toBe('2026-03-31')
    expect(period.months).toEqual(['2026-03'])
  })

  it('resolves last month independently of the current day', () => {
    const period = resolvePeriod('last-month', today)
    expect(period.from).toBe('2026-02-01')
    expect(period.to).toBe('2026-02-28')
  })

  it('includes the current month in multi-month windows', () => {
    expect(resolvePeriod('last-3-months', today).months).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(resolvePeriod('last-6-months', today).months).toHaveLength(6)
  })

  it('resolves this year from January', () => {
    const period = resolvePeriod('this-year', today)
    expect(period.from).toBe('2026-01-01')
    expect(period.months).toHaveLength(3)
  })

  it('starts all-time at the earliest transaction', () => {
    const period = resolvePeriod('all-time', today, { earliest: '2025-11-14' })
    expect(period.from).toBe('2025-11-01')
    expect(period.months[0]).toBe('2025-11')
  })

  it('honours an explicit custom range to the exact day', () => {
    const period = resolvePeriod('custom', today, { from: '2026-01-17', to: '2026-02-09' })
    expect(period.from).toBe('2026-01-17')
    expect(period.to).toBe('2026-02-09')
    expect(period.months).toEqual(['2026-01', '2026-02'])
  })

  it('swaps a reversed custom range rather than reporting nothing', () => {
    const period = resolvePeriod('custom', today, { from: '2026-02-09', to: '2026-01-17' })
    expect(period.from).toBe('2026-01-17')
    expect(period.to).toBe('2026-02-09')
  })

  it('falls back to the current month when a custom bound is missing or invalid', () => {
    expect(resolvePeriod('custom', today, { from: '2026-01-01' }).months).toEqual(['2026-03'])
    expect(
      resolvePeriod('custom', today, { from: 'not-a-date', to: '2026-02-01' }).months,
    ).toEqual(['2026-03'])
  })

  it('falls back to the current month when all-time has no data', () => {
    expect(resolvePeriod('all-time', today).months).toEqual(['2026-03'])
  })

  it('ends February on the 29th in a leap year', () => {
    expect(resolvePeriod('this-month', '2028-02-10').to).toBe('2028-02-29')
  })
})

describe('previousPeriod', () => {
  it('is the same length window immediately before', () => {
    const period = resolvePeriod('last-3-months', '2026-03-17')
    const previous = previousPeriod(period)
    expect(previous.months).toEqual(['2025-10', '2025-11', '2025-12'])
    expect(previous.from).toBe('2025-10-01')
    expect(previous.to).toBe('2025-12-31')
  })
})

describe('buildReport', () => {
  const transactions = [
    tx('2026-01-10', 500_00),
    tx('2026-02-10', 700_00),
    tx('2026-03-10', 900_00),
    tx('2026-03-01', 4_000_00, 'income'),
    tx('2025-12-31', 10_000_00), // outside the window
  ]

  it('scopes to the period and totals it', () => {
    const period = resolvePeriod('last-3-months', '2026-03-17')
    const report = buildReport(transactions, categories, period)
    expect(report.transactionCount).toBe(4)
    expect(report.expenses).toBe(2_100_00)
    expect(report.income).toBe(4_000_00)
    expect(report.net).toBe(1_900_00)
  })

  it('averages spend across the months in the period, not just active ones', () => {
    const period = resolvePeriod('last-3-months', '2026-03-17')
    expect(buildReport(transactions, categories, period).averageMonthlySpend).toBe(700_00)
  })

  it('finds the largest single expense', () => {
    const period = resolvePeriod('last-3-months', '2026-03-17')
    expect(buildReport(transactions, categories, period).largestExpense?.amount).toBe(900_00)
  })

  it('handles an empty period without dividing by zero', () => {
    const period = resolvePeriod('this-month', '2026-08-01')
    const report = buildReport([], categories, period)
    expect(report).toMatchObject({ income: 0, expenses: 0, net: 0, averageMonthlySpend: 0 })
    expect(report.largestExpense).toBeNull()
    expect(report.byCategory).toEqual([])
  })
})

describe('transfers in aggregation', () => {
  const move: Transaction = {
    id: 'mv1',
    description: 'To savings',
    amount: 500_00,
    type: 'transfer',
    categoryId: null,
    accountId: 'a1',
    toAccountId: 'a2',
    date: '2026-03-05',
    createdAt: '2026-03-05T00:00:00.000Z',
    updatedAt: '2026-03-05T00:00:00.000Z',
  }

  it('are excluded from monthly income, expenses and the row count', () => {
    const [march] = monthlySummaries([tx('2026-03-10', 200_00), move], ['2026-03'])
    expect(march.expenses).toBe(200_00)
    expect(march.income).toBe(0)
    expect(march.net).toBe(-200_00)
    expect(march.count).toBe(1)
  })

  it('are reported separately on a period report without affecting its net', () => {
    const period = resolvePeriod('this-month', '2026-03-17')
    const report = buildReport([tx('2026-03-10', 200_00), move], categories, period)
    expect(report.net).toBe(-200_00)
    expect(report.transfers).toBe(500_00)
    // The transfer is still in the period's rows so it can be listed to the user.
    expect(report.transactionCount).toBe(2)
    expect(report.byCategory).toHaveLength(1)
  })

  it('do not register as a spending trend', () => {
    const rows = monthlySummaries(
      [
        { ...move, date: '2026-02-01' },
        { ...move, id: 'mv2', date: '2026-03-01' },
      ],
      monthRange('2026-02', '2026-03'),
    )
    expect(rows.every((r) => r.expenses === 0)).toBe(true)
    expect(spendingTrend(rows)).toBeNull()
  })
})

describe('categoryDeltas', () => {
  it('ranks categories by the size of their change', () => {
    const current = [tx('2026-03-01', 300_00), tx('2026-03-02', 100_00, 'income')]
    const previous = [tx('2026-02-01', 100_00)]
    const [top] = categoryDeltas(current, previous, categories)
    expect(top.name).toBe('Groceries')
    expect(top.change).toBe(200_00)
    expect(top.percent).toBe(200)
  })

  it('reports a category that disappeared as a full decrease', () => {
    const rows = categoryDeltas([], [tx('2026-02-01', 80_00)], categories)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ current: 0, previous: 80_00, change: -80_00, percent: -100 })
  })

  it('returns a null percentage when there is no baseline to compare', () => {
    const rows = categoryDeltas([tx('2026-03-01', 50_00)], [], categories)
    expect(rows[0].percent).toBeNull()
    expect(rows[0].change).toBe(50_00)
  })
})

describe('spendingTrend', () => {
  it('is positive when the later half spends more', () => {
    const rows = monthlySummaries(
      [tx('2026-01-01', 100_00), tx('2026-02-01', 100_00), tx('2026-03-01', 200_00), tx('2026-04-01', 200_00)],
      monthRange('2026-01', '2026-04'),
    )
    expect(spendingTrend(rows)).toBe(100)
  })

  it('is negative when spending falls', () => {
    const rows = monthlySummaries(
      [tx('2026-01-01', 200_00), tx('2026-02-01', 100_00)],
      monthRange('2026-01', '2026-02'),
    )
    expect(spendingTrend(rows)).toBe(-50)
  })

  it('is null when there is no baseline to compare against', () => {
    expect(spendingTrend([])).toBeNull()
    expect(spendingTrend(monthlySummaries([], ['2026-01']))).toBeNull()
    expect(spendingTrend(monthlySummaries([], monthRange('2026-01', '2026-02')))).toBeNull()
  })
})

describe('earliestDate', () => {
  it('finds the oldest transaction date', () => {
    expect(earliestDate([tx('2026-03-01', 1), tx('2025-07-19', 1)])).toBe('2025-07-19')
  })

  it('is undefined for an empty ledger', () => {
    expect(earliestDate([])).toBeUndefined()
  })
})
