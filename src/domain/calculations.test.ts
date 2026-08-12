import { describe, expect, it } from 'vitest'
import {
  accountActivity,
  accountBalance,
  accountBalances,
  balanceEffect,
  budgetHealth,
  budgetProgress,
  budgetStatus,
  budgetUtilization,
  categoryTotals,
  countByAccount,
  countByCategory,
  netCashFlow,
  netWorth,
  percentChange,
  savingsRate,
  savingsRateFor,
  totalBalance,
  totals,
  transactionsInMonth,
} from './calculations'
import type { Account, Budget, Category, Transaction } from './types'

const categories: Category[] = [
  { id: 'c-salary', name: 'Salary', type: 'income', color: 'viz-1' },
  { id: 'c-food', name: 'Groceries', type: 'expense', color: 'viz-2' },
  { id: 'c-rent', name: 'Housing', type: 'expense', color: 'viz-3' },
]

const accounts: Account[] = [
  { id: 'a1', name: 'Checking', type: 'checking', startingBalance: 100_00 },
  { id: 'a2', name: 'Card', type: 'credit', startingBalance: -50_00 },
]

function tx(partial: Partial<Transaction> & Pick<Transaction, 'amount' | 'type'>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    description: 'Test',
    categoryId: partial.type === 'income' ? 'c-salary' : 'c-food',
    accountId: 'a1',
    date: '2026-03-15',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...partial,
  }
}

/** A transfer always carries a destination and never a category. */
function transfer(
  partial: Partial<Transaction> & Pick<Transaction, 'amount'> & { toAccountId: string },
): Transaction {
  return tx({ ...partial, type: 'transfer', categoryId: null })
}

describe('totals and net cash flow', () => {
  it('splits income from expenses and nets them', () => {
    const result = totals([
      tx({ amount: 5_000_00, type: 'income' }),
      tx({ amount: 1_200_00, type: 'expense' }),
      tx({ amount: 300_50, type: 'expense' }),
    ])
    expect(result.income).toBe(5_000_00)
    expect(result.expenses).toBe(1_500_50)
    expect(result.net).toBe(3_499_50)
  })

  it('is zero for an empty ledger', () => {
    expect(totals([])).toEqual({ income: 0, expenses: 0, net: 0, transfers: 0 })
    expect(netCashFlow([])).toBe(0)
  })

  it('reports a negative net when spending exceeds income', () => {
    expect(netCashFlow([tx({ amount: 100_00, type: 'income' }), tx({ amount: 250_00, type: 'expense' })])).toBe(
      -150_00,
    )
  })
})

describe('transfers', () => {
  const move = transfer({ amount: 500_00, accountId: 'a1', toAccountId: 'a2' })

  it('is neither income nor an expense', () => {
    const result = totals([
      tx({ amount: 3_000_00, type: 'income' }),
      tx({ amount: 800_00, type: 'expense' }),
      move,
    ])
    expect(result.income).toBe(3_000_00)
    expect(result.expenses).toBe(800_00)
    expect(result.net).toBe(2_200_00)
    // Reported separately so the UI can explain it, never folded into a total.
    expect(result.transfers).toBe(500_00)
  })

  it('does not change net cash flow', () => {
    const withoutTransfer = [tx({ amount: 1_000_00, type: 'income' })]
    expect(netCashFlow([...withoutTransfer, move])).toBe(netCashFlow(withoutTransfer))
  })

  it('does not distort the savings rate', () => {
    const base = [tx({ amount: 1_000_00, type: 'income' }), tx({ amount: 600_00, type: 'expense' })]
    expect(savingsRateFor(base)).toBe(40)
    // Sweeping 900 into savings must not read as spending or as income.
    expect(savingsRateFor([...base, transfer({ amount: 900_00, toAccountId: 'a2' })])).toBe(40)
  })

  it('debits the source account and credits the destination', () => {
    const balances = accountBalances(accounts, [move])
    expect(balances.get('a1')).toBe(100_00 - 500_00)
    expect(balances.get('a2')).toBe(-50_00 + 500_00)
  })

  it('leaves the summed position unchanged', () => {
    const before = netWorth(accounts, [])
    const after = netWorth(accounts, [move])
    expect(after.netWorth).toBe(before.netWorth)
  })

  it('reports the signed effect per account and zero for uninvolved accounts', () => {
    expect(balanceEffect(move, 'a1')).toBe(-500_00)
    expect(balanceEffect(move, 'a2')).toBe(500_00)
    expect(balanceEffect(move, 'a3')).toBe(0)
  })

  it('is excluded from category breakdowns', () => {
    const result = categoryTotals([tx({ amount: 100_00, type: 'expense' }), move], categories)
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(100_00)
  })

  it('never consumes a budget', () => {
    const budgets: Budget[] = [
      { id: 'b-all', categoryId: null, amount: 1_000_00, startMonth: '2026-01' },
    ]
    const progress = budgetProgress(budgets, [move], categories, '2026-03')
    expect(progress[0].spent).toBe(0)
    expect(progress[0].status).toBe('healthy')
  })

  it('ignores a destination that no longer exists rather than losing the debit', () => {
    const balances = accountBalances(accounts, [
      transfer({ amount: 200_00, accountId: 'a1', toAccountId: 'gone' }),
    ])
    expect(balances.get('a1')).toBe(100_00 - 200_00)
    expect(balances.size).toBe(2)
  })

  it('counts as money in and out from a single account’s point of view', () => {
    const activity = accountActivity([move, tx({ amount: 30_00, type: 'expense' })], 'a1')
    expect(activity.moneyOut).toBe(500_00 + 30_00)
    expect(activity.moneyIn).toBe(0)
    expect(activity.count).toBe(2)

    const destination = accountActivity([move], 'a2')
    expect(destination.moneyIn).toBe(500_00)
    expect(destination.moneyOut).toBe(0)
  })

  it('is counted against both accounts it touches', () => {
    const counts = countByAccount([move])
    expect(counts.get('a1')).toBe(1)
    expect(counts.get('a2')).toBe(1)
  })

  it('contributes to no category reference count', () => {
    const counts = countByCategory([move, tx({ amount: 1_00, type: 'expense', categoryId: 'c-food' })])
    expect(counts.get('c-food')).toBe(1)
    expect(counts.size).toBe(1)
  })
})

describe('net worth', () => {
  it('treats a credit card balance as a liability that reduces net worth', () => {
    const result = netWorth(accounts, [])
    expect(result.assets).toBe(100_00)
    expect(result.liabilities).toBe(50_00)
    expect(result.netWorth).toBe(50_00)
  })

  it('keeps netWorth equal to assets minus liabilities in every case', () => {
    const mixed: Account[] = [
      { id: 'a1', name: 'Checking', type: 'checking', startingBalance: -20_00 }, // overdrawn
      { id: 'a2', name: 'Card', type: 'credit', startingBalance: 15_00 }, // overpaid
      { id: 'a3', name: 'Savings', type: 'savings', startingBalance: 900_00 },
      { id: 'a4', name: 'Brokerage', type: 'investment', startingBalance: 5_000_00 },
    ]
    const result = netWorth(mixed, [])
    expect(result.assets).toBe(15_00 + 900_00 + 5_000_00)
    expect(result.liabilities).toBe(20_00)
    expect(result.netWorth).toBe(result.assets - result.liabilities)
  })

  it('excludes credit cards from spendable balance but not from net worth', () => {
    const result = netWorth(accounts, [])
    expect(result.totalBalance).toBe(100_00)
    expect(result.netWorth).toBe(50_00)
  })

  it('ignores archived accounts entirely', () => {
    const withArchived: Account[] = [
      ...accounts,
      { id: 'a3', name: 'Old', type: 'savings', startingBalance: 999_00, archived: true },
    ]
    expect(netWorth(withArchived, []).assets).toBe(100_00)
  })

  it('is zero for a ledger with no accounts', () => {
    expect(netWorth([], [])).toEqual({
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      totalBalance: 0,
    })
  })
})

describe('budget health', () => {
  const budgets: Budget[] = [
    { id: 'b-all', categoryId: null, amount: 2_000_00, startMonth: '2026-01' },
    { id: 'b-food', categoryId: 'c-food', amount: 400_00, startMonth: '2026-01' },
    { id: 'b-rent', categoryId: 'c-rent', amount: 1_000_00, startMonth: '2026-01' },
  ]

  it('rolls category budgets up without double-counting the overall cap', () => {
    const progress = budgetProgress(
      budgets,
      [
        tx({ amount: 450_00, type: 'expense', categoryId: 'c-food' }),
        tx({ amount: 900_00, type: 'expense', categoryId: 'c-rent' }),
      ],
      categories,
      '2026-03',
    )
    const health = budgetHealth(progress)
    expect(health.limit).toBe(1_400_00)
    expect(health.spent).toBe(1_350_00)
    expect(health.overCount).toBe(1)
    expect(health.status).toBe('warning')
  })

  it('falls back to the overall budget when no category budgets exist', () => {
    const overallOnly: Budget[] = [budgets[0]]
    const health = budgetHealth(
      budgetProgress(overallOnly, [tx({ amount: 100_00, type: 'expense' })], categories, '2026-03'),
    )
    expect(health.limit).toBe(2_000_00)
    expect(health.spent).toBe(100_00)
  })

  it('is empty and healthy with no budgets at all', () => {
    const health = budgetHealth([])
    expect(health).toMatchObject({ limit: 0, spent: 0, count: 0, status: 'healthy' })
  })
})

describe('savings rate', () => {
  it('is (net income / income) x 100', () => {
    expect(savingsRate(5_000_00, 4_000_00)).toBe(20)
    expect(savingsRate(1_000_00, 250_00)).toBe(75)
  })

  it('returns 0 rather than dividing by zero', () => {
    expect(savingsRate(0, 500_00)).toBe(0)
    expect(savingsRate(0, 0)).toBe(0)
    expect(Number.isFinite(savingsRate(0, 1))).toBe(true)
  })

  it('goes negative when expenses exceed income', () => {
    expect(savingsRate(1_000_00, 1_500_00)).toBe(-50)
  })

  it('ignores negative income defensively', () => {
    expect(savingsRate(-100, 50)).toBe(0)
  })
})

describe('account balances', () => {
  it('is starting balance + income - expenses', () => {
    const transactions = [
      tx({ amount: 1_000_00, type: 'income', accountId: 'a1' }),
      tx({ amount: 250_00, type: 'expense', accountId: 'a1' }),
    ]
    expect(accountBalance(accounts[0], transactions)).toBe(100_00 + 1_000_00 - 250_00)
  })

  it('only counts transactions belonging to the account', () => {
    const transactions = [
      tx({ amount: 400_00, type: 'expense', accountId: 'a2' }),
      tx({ amount: 900_00, type: 'income', accountId: 'a1' }),
    ]
    expect(accountBalance(accounts[1], transactions)).toBe(-50_00 - 400_00)
    expect(accountBalance(accounts[0], transactions)).toBe(100_00 + 900_00)
  })

  it('ignores transactions pointing at a removed account', () => {
    const balances = accountBalances(accounts, [tx({ amount: 10_00, type: 'expense', accountId: 'gone' })])
    expect(balances.get('a1')).toBe(100_00)
    expect(balances.size).toBe(2)
  })

  it('reports spendable balance across non-liability accounts only', () => {
    const withArchived: Account[] = [
      ...accounts,
      { id: 'a3', name: 'Old', type: 'savings', startingBalance: 999_00, archived: true },
    ]
    // The archived savings account and the credit card are both excluded.
    expect(totalBalance(withArchived, [])).toBe(100_00)
  })
})

describe('budget utilization', () => {
  it('is spent / budget x 100', () => {
    expect(budgetUtilization(250_00, 1_000_00)).toBe(25)
    expect(budgetUtilization(1_000_00, 1_000_00)).toBe(100)
    expect(budgetUtilization(1_500_00, 1_000_00)).toBe(150)
  })

  it('handles a zero or negative budget without producing NaN or Infinity', () => {
    expect(budgetUtilization(500_00, 0)).toBe(0)
    expect(budgetUtilization(0, 0)).toBe(0)
    expect(budgetUtilization(10, -5)).toBe(0)
  })

  it('classifies healthy, approaching and over states', () => {
    expect(budgetStatus(45, 100_00, 45_00)).toBe('healthy')
    expect(budgetStatus(79.9, 100_00, 79_90)).toBe('healthy')
    expect(budgetStatus(80, 100_00, 80_00)).toBe('warning')
    expect(budgetStatus(100, 100_00, 100_00)).toBe('warning')
    expect(budgetStatus(100.1, 100_00, 100_10)).toBe('over')
  })

  it('treats any spend against a zero budget as over', () => {
    expect(budgetStatus(0, 0, 1)).toBe('over')
    expect(budgetStatus(0, 0, 0)).toBe('healthy')
  })
})

describe('budget progress', () => {
  const budgets: Budget[] = [
    { id: 'b-all', categoryId: null, amount: 2_000_00, startMonth: '2026-01' },
    { id: 'b-food', categoryId: 'c-food', amount: 400_00, startMonth: '2026-01' },
    { id: 'b-future', categoryId: 'c-rent', amount: 100_00, startMonth: '2026-12' },
  ]

  const transactions = [
    tx({ amount: 150_00, type: 'expense', categoryId: 'c-food', date: '2026-03-02' }),
    tx({ amount: 300_00, type: 'expense', categoryId: 'c-food', date: '2026-03-20' }),
    tx({ amount: 1_200_00, type: 'expense', categoryId: 'c-rent', date: '2026-03-01' }),
    tx({ amount: 99_00, type: 'expense', categoryId: 'c-food', date: '2026-02-10' }),
    tx({ amount: 5_000_00, type: 'income', date: '2026-03-01' }),
  ]

  it('scopes spend to the requested month and the right category', () => {
    const progress = budgetProgress(budgets, transactions, categories, '2026-03')
    const food = progress.find((p) => p.budget.id === 'b-food')
    expect(food?.spent).toBe(450_00)
    expect(food?.remaining).toBe(-50_00)
    expect(food?.status).toBe('over')
  })

  it('counts every expense against an overall budget and excludes income', () => {
    const overall = budgetProgress(budgets, transactions, categories, '2026-03').find(
      (p) => p.budget.categoryId === null,
    )
    expect(overall?.spent).toBe(1_650_00)
    expect(overall?.utilization).toBeCloseTo(82.5)
    expect(overall?.status).toBe('warning')
  })

  it('excludes budgets that have not started yet', () => {
    const ids = budgetProgress(budgets, transactions, categories, '2026-03').map((p) => p.budget.id)
    expect(ids).not.toContain('b-future')
    expect(budgetProgress(budgets, transactions, categories, '2026-12').map((p) => p.budget.id)).toContain(
      'b-future',
    )
  })

  it('reports zero spend for a category with no activity', () => {
    const progress = budgetProgress(budgets, [], categories, '2026-03')
    expect(progress.every((p) => p.spent === 0 && p.utilization === 0)).toBe(true)
    expect(progress.every((p) => p.status === 'healthy')).toBe(true)
  })
})

describe('category totals', () => {
  it('ranks categories by amount and computes each share', () => {
    const result = categoryTotals(
      [
        tx({ amount: 300_00, type: 'expense', categoryId: 'c-food' }),
        tx({ amount: 100_00, type: 'expense', categoryId: 'c-food' }),
        tx({ amount: 600_00, type: 'expense', categoryId: 'c-rent' }),
        tx({ amount: 5_000_00, type: 'income' }),
      ],
      categories,
    )
    expect(result.map((r) => r.name)).toEqual(['Housing', 'Groceries'])
    expect(result[0].share).toBe(60)
    expect(result[1].share).toBe(40)
    expect(result[1].count).toBe(2)
  })

  it('returns an empty list when there is nothing of that type', () => {
    expect(categoryTotals([], categories)).toEqual([])
  })
})

describe('monthly scoping and comparisons', () => {
  it('selects only transactions in the given month', () => {
    const transactions = [
      tx({ amount: 1_00, type: 'expense', date: '2026-02-28' }),
      tx({ amount: 2_00, type: 'expense', date: '2026-03-01' }),
      tx({ amount: 3_00, type: 'expense', date: '2026-03-31' }),
      tx({ amount: 4_00, type: 'expense', date: '2026-04-01' }),
    ]
    expect(transactionsInMonth(transactions, '2026-03')).toHaveLength(2)
  })

  it('returns null for a percentage change with no baseline', () => {
    expect(percentChange(100, 0)).toBeNull()
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
  })
})
