import { describe, expect, it } from 'vitest'
import { activeFilterCount, filterTransactions, groupByDate, queryTransactions, sortTransactions } from './filters'
import type { Account, Category, Transaction } from './types'

const categories: Category[] = [
  { id: 'c-food', name: 'Groceries', type: 'expense', color: 'viz-1' },
  { id: 'c-fun', name: 'Entertainment', type: 'expense', color: 'viz-2' },
  { id: 'c-pay', name: 'Salary', type: 'income', color: 'viz-3' },
]

const accounts: Account[] = [
  { id: 'a-check', name: 'Everyday Checking', type: 'checking', startingBalance: 0 },
  { id: 'a-card', name: 'Sapphire Card', type: 'credit', startingBalance: 0 },
]

const context = { categories, accounts }

const transactions: Transaction[] = [
  {
    id: 't1',
    description: 'Whole Foods Market',
    amount: 84_35,
    type: 'expense',
    categoryId: 'c-food',
    accountId: 'a-card',
    date: '2026-03-04',
    notes: 'Weekly shop with Sam',
    createdAt: '2026-03-04T10:00:00.000Z',
    updatedAt: '2026-03-04T10:00:00.000Z',
  },
  {
    id: 't2',
    description: 'Cinema tickets',
    amount: 32_00,
    type: 'expense',
    categoryId: 'c-fun',
    accountId: 'a-check',
    date: '2026-02-18',
    createdAt: '2026-02-18T10:00:00.000Z',
    updatedAt: '2026-02-18T10:00:00.000Z',
  },
  {
    id: 't3',
    description: 'Salary — Northwind',
    amount: 6_240_00,
    type: 'income',
    categoryId: 'c-pay',
    accountId: 'a-check',
    date: '2026-03-01',
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  },
]

describe('search', () => {
  it('matches on the description', () => {
    expect(filterTransactions(transactions, { search: 'whole foods' }, context).map((t) => t.id)).toEqual([
      't1',
    ])
  })

  it('matches on the category name', () => {
    expect(filterTransactions(transactions, { search: 'entertainment' }, context).map((t) => t.id)).toEqual([
      't2',
    ])
  })

  it('matches on the account name', () => {
    expect(filterTransactions(transactions, { search: 'sapphire' }, context).map((t) => t.id)).toEqual(['t1'])
  })

  it('matches on notes', () => {
    expect(filterTransactions(transactions, { search: 'sam' }, context).map((t) => t.id)).toEqual(['t1'])
  })

  it('matches on the amount as typed', () => {
    expect(filterTransactions(transactions, { search: '84.35' }, context).map((t) => t.id)).toEqual(['t1'])
  })

  it('requires every token to match, so extra words narrow the result', () => {
    expect(filterTransactions(transactions, { search: 'whole groceries' }, context)).toHaveLength(1)
    expect(filterTransactions(transactions, { search: 'whole salary' }, context)).toHaveLength(0)
  })

  it('is case insensitive and ignores surrounding whitespace', () => {
    expect(filterTransactions(transactions, { search: '  CINEMA  ' }, context)).toHaveLength(1)
  })

  it('returns everything for an empty search', () => {
    expect(filterTransactions(transactions, { search: '   ' }, context)).toHaveLength(3)
  })
})

describe('filters', () => {
  it('filters by type', () => {
    expect(filterTransactions(transactions, { type: 'income' }, context).map((t) => t.id)).toEqual(['t3'])
    expect(filterTransactions(transactions, { type: 'expense' }, context)).toHaveLength(2)
    expect(filterTransactions(transactions, { type: 'all' }, context)).toHaveLength(3)
  })

  it('filters by category and by account', () => {
    expect(filterTransactions(transactions, { categoryIds: ['c-food'] }, context).map((t) => t.id)).toEqual([
      't1',
    ])
    expect(filterTransactions(transactions, { accountIds: ['a-check'] }, context)).toHaveLength(2)
  })

  it('filters by an inclusive date range', () => {
    expect(filterTransactions(transactions, { from: '2026-03-01', to: '2026-03-04' }, context)).toHaveLength(2)
    expect(filterTransactions(transactions, { from: '2026-03-02' }, context).map((t) => t.id)).toEqual(['t1'])
    expect(filterTransactions(transactions, { to: '2026-02-18' }, context).map((t) => t.id)).toEqual(['t2'])
  })

  it('filters by amount bounds', () => {
    expect(filterTransactions(transactions, { minAmount: 100_00 }, context).map((t) => t.id)).toEqual(['t3'])
    expect(filterTransactions(transactions, { maxAmount: 50_00 }, context).map((t) => t.id)).toEqual(['t2'])
  })

  it('combines filters conjunctively', () => {
    expect(
      filterTransactions(
        transactions,
        { type: 'expense', accountIds: ['a-check'], from: '2026-01-01' },
        context,
      ).map((t) => t.id),
    ).toEqual(['t2'])
  })

  it('counts the filters that are actually narrowing', () => {
    expect(activeFilterCount({})).toBe(0)
    expect(activeFilterCount({ type: 'all', search: 'x' })).toBe(0)
    expect(activeFilterCount({ type: 'income', categoryIds: ['c-food'], from: '2026-01-01' })).toBe(3)
    expect(activeFilterCount({ categoryIds: [] })).toBe(0)
    expect(activeFilterCount({ minAmount: 1_00 })).toBe(1)
    expect(activeFilterCount({ minAmount: 1_00, maxAmount: 9_00 })).toBe(1)
  })
})

describe('transfers in queries', () => {
  const move: Transaction = {
    id: 't4',
    description: 'Move to savings',
    amount: 500_00,
    type: 'transfer',
    categoryId: null,
    accountId: 'a-check',
    toAccountId: 'a-card',
    date: '2026-03-06',
    createdAt: '2026-03-06T10:00:00.000Z',
    updatedAt: '2026-03-06T10:00:00.000Z',
  }
  const all = [...transactions, move]

  it('can be filtered to on its own type', () => {
    expect(filterTransactions(all, { type: 'transfer' }, context).map((t) => t.id)).toEqual(['t4'])
    // ...and is excluded from the income and expense views.
    expect(filterTransactions(all, { type: 'expense' }, context).map((t) => t.id)).not.toContain('t4')
    expect(filterTransactions(all, { type: 'income' }, context).map((t) => t.id)).not.toContain('t4')
  })

  it('matches an account filter from either side of the movement', () => {
    expect(filterTransactions(all, { accountIds: ['a-check'] }, context).map((t) => t.id)).toContain('t4')
    expect(filterTransactions(all, { accountIds: ['a-card'] }, context).map((t) => t.id)).toContain('t4')
  })

  it('is excluded by any category filter, having no category', () => {
    expect(filterTransactions(all, { categoryIds: ['c-food'] }, context).map((t) => t.id)).not.toContain(
      't4',
    )
  })

  it('is findable by the word "transfer" and by either account name', () => {
    expect(filterTransactions(all, { search: 'transfer' }, context).map((t) => t.id)).toEqual(['t4'])
    expect(filterTransactions(all, { search: 'sapphire' }, context).map((t) => t.id)).toContain('t4')
  })

  it('sorts under "Transfer" when sorting by category', () => {
    const order = sortTransactions(all, 'category', 'asc', context).map((t) => t.id)
    // Cinema (Entertainment), Whole Foods (Groceries), Salary, then Transfer.
    expect(order).toEqual(['t2', 't1', 't3', 't4'])
  })
})

describe('sorting', () => {
  it('sorts by date in both directions', () => {
    expect(sortTransactions(transactions, 'date', 'desc').map((t) => t.id)).toEqual(['t1', 't3', 't2'])
    expect(sortTransactions(transactions, 'date', 'asc').map((t) => t.id)).toEqual(['t2', 't3', 't1'])
  })

  it('sorts by amount and description', () => {
    expect(sortTransactions(transactions, 'amount', 'desc')[0].id).toBe('t3')
    expect(sortTransactions(transactions, 'description', 'asc')[0].description).toBe('Cinema tickets')
  })

  it('sorts by category name using the provided context', () => {
    expect(sortTransactions(transactions, 'category', 'asc', context).map((t) => t.id)).toEqual([
      't2',
      't1',
      't3',
    ])
  })

  it('does not mutate the input array', () => {
    const original = [...transactions]
    sortTransactions(transactions, 'amount', 'asc')
    expect(transactions).toEqual(original)
  })

  it('breaks ties deterministically', () => {
    const same: Transaction[] = [
      { ...transactions[0], id: 'b', date: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' },
      { ...transactions[0], id: 'a', date: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' },
    ]
    expect(sortTransactions(same, 'date', 'asc').map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('queryTransactions', () => {
  it('filters then sorts in one pass', () => {
    const result = queryTransactions(
      transactions,
      { type: 'expense', sortField: 'amount', sortDirection: 'desc' },
      context,
    )
    expect(result.map((t) => t.id)).toEqual(['t1', 't2'])
  })
})

describe('groupByDate', () => {
  it('buckets by day preserving the incoming order', () => {
    const groups = groupByDate(sortTransactions(transactions, 'date', 'desc'))
    expect(groups.map(([date]) => date)).toEqual(['2026-03-04', '2026-03-01', '2026-02-18'])
    expect(groups[0][1]).toHaveLength(1)
  })

  it('returns nothing for an empty list', () => {
    expect(groupByDate([])).toEqual([])
  })
})
