import { describe, expect, it } from 'vitest'
import {
  advance,
  materialiseRecurring,
  monthlyCommitment,
  monthlyEquivalent,
  nextOccurrence,
  occurrencesBetween,
  upcomingOccurrences,
} from './recurring'
import type { RecurringTransaction } from './types'

function rule(partial: Partial<RecurringTransaction> = {}): RecurringTransaction {
  return {
    id: 'r1',
    name: 'Rent',
    amount: 2_150_00,
    type: 'expense',
    categoryId: 'c-housing',
    accountId: 'a-check',
    frequency: 'monthly',
    startDate: '2026-01-01',
    active: true,
    ...partial,
  }
}

describe('transfer schedules', () => {
  const sweep = rule({
    id: 'r-sweep',
    name: 'Savings sweep',
    type: 'transfer',
    categoryId: null,
    accountId: 'a-check',
    toAccountId: 'a-save',
    amount: 900_00,
    startDate: '2026-01-02',
  })

  it('posts transfers carrying both accounts and no category', () => {
    let n = 0
    const { transactions } = materialiseRecurring([sweep], '2026-03-15', () => `p${(n += 1)}`)
    expect(transactions).toHaveLength(3)
    for (const posted of transactions) {
      expect(posted.type).toBe('transfer')
      expect(posted.categoryId).toBeNull()
      expect(posted.accountId).toBe('a-check')
      expect(posted.toAccountId).toBe('a-save')
    }
  })

  it('stamps createdAt and updatedAt on every posted occurrence', () => {
    let n = 0
    const { transactions } = materialiseRecurring(
      [sweep],
      '2026-01-15',
      () => `p${(n += 1)}`,
      '2026-01-15T08:00:00.000Z',
    )
    expect(transactions[0].createdAt).toBe('2026-01-15T08:00:00.000Z')
    expect(transactions[0].updatedAt).toBe('2026-01-15T08:00:00.000Z')
  })

  it('is excluded from committed monthly income and spending', () => {
    const rules = [
      sweep,
      rule({ id: 'r-rent', amount: 2_150_00, type: 'expense' }),
      rule({ id: 'r-pay', amount: 6_000_00, type: 'income' }),
    ]
    expect(monthlyCommitment(rules, 'expense')).toBe(2_150_00)
    expect(monthlyCommitment(rules, 'income')).toBe(6_000_00)
  })

  it('drops a category left on a transfer rule by an older document', () => {
    let n = 0
    const { transactions } = materialiseRecurring(
      [{ ...sweep, categoryId: 'c-housing' }],
      '2026-01-15',
      () => `p${(n += 1)}`,
    )
    expect(transactions[0].categoryId).toBeNull()
  })
})

describe('advance', () => {
  it('steps weekly, monthly and yearly', () => {
    expect(advance('2026-03-04', 'weekly')).toBe('2026-03-11')
    expect(advance('2026-03-04', 'monthly')).toBe('2026-04-04')
    expect(advance('2026-03-04', 'yearly')).toBe('2027-03-04')
  })

  it('clamps the day of month instead of rolling into the next month', () => {
    expect(advance('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(advance('2028-01-31', 'monthly')).toBe('2028-02-29')
    expect(advance('2026-03-31', 'monthly')).toBe('2026-04-30')
  })

  it('handles a leap day anniversary', () => {
    expect(advance('2028-02-29', 'yearly')).toBe('2029-02-28')
  })
})

describe('nextOccurrence', () => {
  it('returns the start date when the schedule has not begun', () => {
    expect(nextOccurrence(rule({ startDate: '2026-06-01' }), '2026-03-01')).toBe('2026-06-01')
  })

  it('returns the first occurrence strictly after the given date', () => {
    expect(nextOccurrence(rule(), '2026-03-15')).toBe('2026-04-01')
    expect(nextOccurrence(rule(), '2026-03-31')).toBe('2026-04-01')
  })

  it('treats a date that is exactly an occurrence as already past', () => {
    expect(nextOccurrence(rule(), '2026-04-01')).toBe('2026-05-01')
  })

  it('continues from the last posted occurrence when there is one', () => {
    expect(nextOccurrence(rule({ lastPostedDate: '2026-05-01' }), '2026-03-01')).toBe('2026-06-01')
  })

  it('works for weekly schedules', () => {
    expect(nextOccurrence(rule({ frequency: 'weekly', startDate: '2026-03-02' }), '2026-03-10')).toBe(
      '2026-03-16',
    )
  })
})

describe('occurrencesBetween', () => {
  it('lists every occurrence inside an inclusive window', () => {
    expect(occurrencesBetween(rule(), '2026-02-01', '2026-05-01')).toEqual([
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
    ])
  })

  it('is empty when the window closes before the schedule starts', () => {
    expect(occurrencesBetween(rule({ startDate: '2026-09-01' }), '2026-01-01', '2026-06-01')).toEqual([])
  })
})

describe('monthly equivalents', () => {
  it('normalises weekly and yearly amounts to a monthly figure', () => {
    expect(monthlyEquivalent({ amount: 38_00, frequency: 'weekly' })).toBe(Math.round((38_00 * 52) / 12))
    expect(monthlyEquivalent({ amount: 139_00, frequency: 'yearly' })).toBe(Math.round(139_00 / 12))
    expect(monthlyEquivalent({ amount: 2_150_00, frequency: 'monthly' })).toBe(2_150_00)
  })

  it('sums only active rules of the requested direction', () => {
    const rules = [
      rule({ id: 'a', amount: 100_00 }),
      rule({ id: 'b', amount: 50_00, active: false }),
      rule({ id: 'c', amount: 1_000_00, type: 'income' }),
    ]
    expect(monthlyCommitment(rules, 'expense')).toBe(100_00)
    expect(monthlyCommitment(rules, 'income')).toBe(1_000_00)
    expect(monthlyCommitment([], 'expense')).toBe(0)
  })
})

describe('upcomingOccurrences', () => {
  it('includes something due today and orders by date', () => {
    const rules = [
      rule({ id: 'later', name: 'Gym', startDate: '2026-03-20' }),
      rule({ id: 'today', name: 'Rent', startDate: '2026-03-10' }),
    ]
    const upcoming = upcomingOccurrences(rules, '2026-03-10', 30)
    expect(upcoming.map((o) => o.rule.id)).toEqual(['today', 'later'])
    expect(upcoming[0].daysAway).toBe(0)
    expect(upcoming[1].daysAway).toBe(10)
  })

  it('excludes paused rules and anything past the horizon', () => {
    const rules = [
      rule({ id: 'paused', active: false, startDate: '2026-03-11' }),
      rule({ id: 'far', startDate: '2026-06-01' }),
    ]
    expect(upcomingOccurrences(rules, '2026-03-10', 30)).toEqual([])
  })
})

describe('materialiseRecurring', () => {
  const makeId = () => {
    let n = 0
    return () => `gen-${(n += 1)}`
  }

  it('posts every occurrence up to and including today', () => {
    const result = materialiseRecurring([rule()], '2026-03-15', makeId(), '2026-03-15T00:00:00.000Z')
    expect(result.transactions.map((t) => t.date)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ])
    expect(result.rules[0].lastPostedDate).toBe('2026-03-01')
  })

  it('copies the rule onto each generated transaction', () => {
    const [posted] = materialiseRecurring(
      [rule({ notes: 'Standing order' })],
      '2026-01-05',
      makeId(),
    ).transactions
    expect(posted).toMatchObject({
      description: 'Rent',
      amount: 2_150_00,
      type: 'expense',
      categoryId: 'c-housing',
      accountId: 'a-check',
      recurringId: 'r1',
      notes: 'Standing order',
    })
  })

  it('is idempotent — running twice posts nothing the second time', () => {
    const first = materialiseRecurring([rule()], '2026-03-15', makeId())
    const second = materialiseRecurring(first.rules, '2026-03-15', makeId())
    expect(second.transactions).toEqual([])
    expect(second.rules[0]).toBe(first.rules[0])
  })

  it('posts only the gap when run again later', () => {
    const first = materialiseRecurring([rule()], '2026-03-15', makeId())
    const second = materialiseRecurring(first.rules, '2026-05-02', makeId())
    expect(second.transactions.map((t) => t.date)).toEqual(['2026-04-01', '2026-05-01'])
  })

  it('never posts for a paused rule', () => {
    expect(materialiseRecurring([rule({ active: false })], '2026-12-31', makeId()).transactions).toEqual([])
  })

  it('does not post a schedule that starts in the future', () => {
    expect(
      materialiseRecurring([rule({ startDate: '2027-01-01' })], '2026-03-15', makeId()).transactions,
    ).toEqual([])
  })

  it('posts weekly schedules at seven-day intervals', () => {
    const result = materialiseRecurring(
      [rule({ frequency: 'weekly', startDate: '2026-03-02' })],
      '2026-03-23',
      makeId(),
    )
    expect(result.transactions.map((t) => t.date)).toEqual([
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
      '2026-03-23',
    ])
  })
})
