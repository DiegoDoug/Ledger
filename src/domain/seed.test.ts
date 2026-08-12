import { describe, expect, it } from 'vitest'
import { CATEGORIES, DATA_VERSION, createEmptyData, createSeedData, idFactory } from './seed'
import { accountBalances, netWorth, totals } from './calculations'
import { monthKey } from './dates'
import { isLiabilityAccount } from './types'

const TODAY = '2026-08-11'

describe('demo data', () => {
  const data = createSeedData(TODAY)

  it('is deterministic for a given day', () => {
    const again = createSeedData(TODAY)
    expect(again.transactions.length).toBe(data.transactions.length)
    expect(totals(again.transactions)).toEqual(totals(data.transactions))
    expect(accountBalances(again.accounts, again.transactions)).toEqual(
      accountBalances(data.accounts, data.transactions),
    )
  })

  it('demonstrates every feature the app has', () => {
    expect(data.accounts.length).toBeGreaterThanOrEqual(4)
    expect(data.budgets.length).toBeGreaterThan(0)
    expect(data.recurring.length).toBeGreaterThan(0)
    expect(data.transactions.some((t) => t.type === 'income')).toBe(true)
    expect(data.transactions.some((t) => t.type === 'expense')).toBe(true)
    expect(data.transactions.some((t) => t.type === 'transfer')).toBe(true)
    expect(data.recurring.some((r) => r.type === 'transfer')).toBe(true)
    expect(data.recurring.some((r) => !r.active)).toBe(true)
    // Every account type the app supports should be represented.
    expect(new Set(data.accounts.map((a) => a.type)).size).toBeGreaterThanOrEqual(5)
  })

  it('spans several months so trends have something to show', () => {
    const months = new Set(data.transactions.map((t) => monthKey(t.date)))
    expect(months.size).toBeGreaterThanOrEqual(6)
  })

  it('records nothing in the future', () => {
    expect(data.transactions.every((t) => t.date <= TODAY)).toBe(true)
  })

  it('is internally consistent — no dangling references', () => {
    const accountIds = new Set(data.accounts.map((a) => a.id))
    const categoryIds = new Set(data.categories.map((c) => c.id))

    for (const t of data.transactions) {
      expect(accountIds.has(t.accountId)).toBe(true)
      if (t.type === 'transfer') {
        expect(t.categoryId).toBeNull()
        expect(t.toAccountId).toBeDefined()
        expect(accountIds.has(t.toAccountId as string)).toBe(true)
        expect(t.toAccountId).not.toBe(t.accountId)
      } else {
        expect(t.categoryId).not.toBeNull()
        expect(categoryIds.has(t.categoryId as string)).toBe(true)
      }
    }
    for (const b of data.budgets) {
      if (b.categoryId) expect(categoryIds.has(b.categoryId)).toBe(true)
    }
    for (const r of data.recurring) {
      expect(accountIds.has(r.accountId)).toBe(true)
    }
  })

  it('matches every transaction’s category direction to its type', () => {
    const byId = new Map(data.categories.map((c) => [c.id, c]))
    for (const t of data.transactions) {
      if (t.type === 'transfer') continue
      expect(byId.get(t.categoryId as string)?.type).toBe(t.type)
    }
  })

  it('stamps createdAt and updatedAt on every row', () => {
    expect(data.transactions.every((t) => Boolean(t.createdAt) && Boolean(t.updatedAt))).toBe(true)
  })

  /*
   * Balance realism. These are the invariants that make the demo believable: an
   * asset account cannot be overdrawn, physical cash certainly cannot, and a
   * credit card that is actually being paid should not accumulate unbounded debt.
   */
  describe('balances are believable', () => {
    const balances = accountBalances(data.accounts, data.transactions)

    it('never leaves an asset account negative', () => {
      for (const account of data.accounts) {
        if (isLiabilityAccount(account.type)) continue
        expect(balances.get(account.id) ?? 0).toBeGreaterThanOrEqual(0)
      }
    })

    it('keeps the cash wallet positive and in a believable range', () => {
      const cash = data.accounts.find((a) => a.type === 'cash')
      expect(cash).toBeDefined()
      const balance = balances.get(cash!.id) ?? 0
      // A wallet holds spending money, not a savings account's worth of notes.
      expect(balance).toBeGreaterThan(0)
      expect(balance).toBeLessThan(80_000) // under $800
    })

    it('withdraws cash rather than letting the wallet fund itself', () => {
      const withdrawals = data.transactions.filter((t) => t.description === 'ATM withdrawal')
      expect(withdrawals.length).toBeGreaterThan(0)
      expect(withdrawals.every((t) => t.type === 'transfer' && t.toAccountId)).toBe(true)
    })

    it('keeps the credit card owing roughly one month of spending', () => {
      const card = data.accounts.find((a) => a.type === 'credit')
      expect(card).toBeDefined()
      const owed = -(balances.get(card!.id) ?? 0)
      // Owed, but not runaway: the statement is settled every month.
      expect(owed).toBeGreaterThan(0)
      expect(owed).toBeLessThan(400_000) // under $4,000
    })

    it('produces a positive net worth with real liabilities', () => {
      const position = netWorth(data.accounts, data.transactions)
      expect(position.netWorth).toBeGreaterThan(0)
      expect(position.liabilities).toBeGreaterThan(0)
      expect(position.netWorth).toBe(position.assets - position.liabilities)
      // Spendable excludes the card, so it must differ from net worth.
      expect(position.totalBalance).not.toBe(position.netWorth)
    })

    it('settles the card with transfers, not expenses', () => {
      const payments = data.transactions.filter((t) => t.description === 'Credit card payment')
      expect(payments.length).toBeGreaterThan(0)
      expect(payments.every((t) => t.type === 'transfer' && t.toAccountId)).toBe(true)
    })
  })

  it('keeps transfers out of income and expenses', () => {
    const summary = totals(data.transactions)
    expect(summary.transfers).toBeGreaterThan(0)
    expect(summary.net).toBe(summary.income - summary.expenses)
  })

  it('is stamped with the current data version', () => {
    expect(data.version).toBe(DATA_VERSION)
  })
})

describe('empty data', () => {
  const empty = createEmptyData()

  it('is usable straight away — an account and the default categories', () => {
    expect(empty.accounts).toHaveLength(1)
    expect(empty.categories).toEqual(CATEGORIES)
    expect(empty.transactions).toEqual([])
    expect(empty.budgets).toEqual([])
    expect(empty.recurring).toEqual([])
  })

  it('reports zero for every figure without dividing by zero', () => {
    expect(totals(empty.transactions)).toEqual({ income: 0, expenses: 0, net: 0, transfers: 0 })
    expect(netWorth(empty.accounts, empty.transactions)).toEqual({
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      totalBalance: 0,
    })
  })
})

describe('idFactory', () => {
  it('produces unique, prefixed ids', () => {
    const next = idFactory('t')
    const ids = new Set(Array.from({ length: 500 }, next))
    expect(ids.size).toBe(500)
    expect([...ids].every((id) => id.startsWith('t-'))).toBe(true)
  })
})
