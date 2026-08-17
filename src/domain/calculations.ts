/**
 * Financial calculations.
 *
 * Every number the UI displays is derived here. Components read the results;
 * they never do arithmetic on transactions themselves. All functions are pure
 * and take their inputs explicitly so they can be unit tested without a store.
 *
 * The one rule that governs this file: **a transfer is not income and not an
 * expense.** Moving €500 from checking to savings changes two balances and
 * nothing else — not cash flow, not the savings rate, not a category total.
 */

import { daysBetween, monthKey } from './dates'
import { isLiabilityAccount } from './types'
import type {
  Account,
  Budget,
  Category,
  IsoDate,
  MonthKey,
  Transaction,
  TransactionType,
} from './types'

export interface Totals {
  income: number
  expenses: number
  /** income - expenses */
  net: number
  /** Money moved between own accounts in the period. Reported, never counted. */
  transfers: number
}

export function sumByType(transactions: Transaction[], type: TransactionType): number {
  let total = 0
  for (const t of transactions) {
    if (t.type === type) total += t.amount
  }
  return total
}

export function totals(transactions: Transaction[]): Totals {
  let income = 0
  let expenses = 0
  let transfers = 0
  for (const t of transactions) {
    if (t.type === 'income') income += t.amount
    else if (t.type === 'expense') expenses += t.amount
    else transfers += t.amount
  }
  return { income, expenses, net: income - expenses, transfers }
}

/** Net cash flow: income - expenses. Transfers are excluded by construction. */
export function netCashFlow(transactions: Transaction[]): number {
  return totals(transactions).net
}

/**
 * Savings rate: (net income / income) x 100.
 *
 * Returns 0 when there is no income — a rate is undefined without a
 * denominator, and 0 is the honest, non-misleading value to render. Callers
 * that need to distinguish "no income yet" check the income total themselves.
 */
export function savingsRate(income: number, expenses: number): number {
  if (income <= 0) return 0
  return ((income - expenses) / income) * 100
}

export function savingsRateFor(transactions: Transaction[]): number {
  const t = totals(transactions)
  return savingsRate(t.income, t.expenses)
}

/**
 * A ledger younger than this has too little history for a savings rate to mean
 * anything — one week of a new account can swing to ±1000% on a single
 * transaction. Below this floor the UI shows a plain-language notice instead
 * of the number.
 */
export const MIN_RELIABLE_HISTORY_DAYS = 30

/** Income below this (in cents) is too thin a denominator to trust a percentage. */
export const SAVINGS_RATE_INCOME_FLOOR = 5_000

export type SavingsRateConfidenceReason = 'ok' | 'no-income' | 'low-income' | 'insufficient-history'

export interface SavingsRateConfidence {
  reliable: boolean
  reason: SavingsRateConfidenceReason
}

/**
 * Whether a computed savings rate is safe to show as a number. `no-income` is
 * its own reason because "no income yet" is not misleading — the number is
 * genuinely undefined and callers already render that case as "—". The other
 * two reasons guard against a technically-correct but practically meaningless
 * percentage, such as -314% from one week of a €70 paycheck.
 */
export function savingsRateConfidence(
  income: number,
  earliestTransactionDate: IsoDate | undefined,
  today: IsoDate,
): SavingsRateConfidence {
  if (income <= 0) return { reliable: false, reason: 'no-income' }
  if (!earliestTransactionDate || daysBetween(earliestTransactionDate, today) < MIN_RELIABLE_HISTORY_DAYS) {
    return { reliable: false, reason: 'insufficient-history' }
  }
  if (income < SAVINGS_RATE_INCOME_FLOOR) return { reliable: false, reason: 'low-income' }
  return { reliable: true, reason: 'ok' }
}

/* ------------------------------------------------------------------ */
/* Balances                                                            */
/* ------------------------------------------------------------------ */

/**
 * The signed effect a transaction has on one account.
 *
 * A transfer touches two accounts with opposite signs, which is why this takes
 * an account id rather than reading `accountId` alone.
 */
export function balanceEffect(transaction: Transaction, accountId: string): number {
  const { type, amount } = transaction
  if (type === 'transfer') {
    if (transaction.accountId === accountId) return -amount
    if (transaction.toAccountId === accountId) return amount
    return 0
  }
  if (transaction.accountId !== accountId) return 0
  return type === 'income' ? amount : -amount
}

/**
 * Account balance: opening balance + income - expenses ± transfers.
 * Derived on demand — a balance is never stored, so it cannot drift.
 */
export function accountBalance(account: Account, transactions: Transaction[]): number {
  let balance = account.startingBalance
  for (const t of transactions) balance += balanceEffect(t, account.id)
  return balance
}

export function accountBalances(
  accounts: Account[],
  transactions: Transaction[],
): Map<string, number> {
  const balances = new Map<string, number>()
  for (const a of accounts) balances.set(a.id, a.startingBalance)

  for (const t of transactions) {
    if (t.type === 'transfer') {
      const from = balances.get(t.accountId)
      if (from !== undefined) balances.set(t.accountId, from - t.amount)
      const to = t.toAccountId ? balances.get(t.toAccountId) : undefined
      if (t.toAccountId && to !== undefined) balances.set(t.toAccountId, to + t.amount)
      continue
    }
    const current = balances.get(t.accountId)
    if (current === undefined) continue // orphaned transaction — ignored, not crashed
    balances.set(t.accountId, current + (t.type === 'income' ? t.amount : -t.amount))
  }

  return balances
}

export interface NetWorth {
  /** Everything you own, in cents. Always >= 0. */
  assets: number
  /** Everything you owe, as a positive magnitude. Always >= 0. */
  liabilities: number
  /** assets - liabilities. Equal to the signed sum of every active balance. */
  netWorth: number
  /** Spendable money: the balances of accounts that are not debts. */
  totalBalance: number
}

/**
 * Split every active account into what you own and what you owe.
 *
 * A credit card carries a negative balance when money is owed, so it lands in
 * `liabilities` and pulls net worth **down**. An overdrawn checking account is
 * also a debt, and a credit card paid past zero is genuinely an asset, so the
 * split is by the sign of each balance rather than by account type alone —
 * which keeps `netWorth === assets - liabilities` true in every case.
 */
export function netWorth(accounts: Account[], transactions: Transaction[]): NetWorth {
  const balances = accountBalances(accounts, transactions)
  let assets = 0
  let liabilities = 0
  let totalBalance = 0

  for (const account of accounts) {
    if (account.archived) continue
    const balance = balances.get(account.id) ?? 0
    if (balance >= 0) assets += balance
    else liabilities += -balance
    if (!isLiabilityAccount(account.type)) totalBalance += balance
  }

  return { assets, liabilities, netWorth: assets - liabilities, totalBalance }
}

/** Spendable money across non-liability accounts. */
export function totalBalance(accounts: Account[], transactions: Transaction[]): number {
  return netWorth(accounts, transactions).totalBalance
}

export interface AccountActivity {
  /** Money that arrived: income plus incoming transfers. */
  moneyIn: number
  /** Money that left: expenses plus outgoing transfers. */
  moneyOut: number
  /** Rows touching this account, counting both sides of a transfer. */
  count: number
}

/**
 * What actually moved through one account. Unlike cash flow this *does* include
 * transfers, because from a single account's point of view a transfer genuinely
 * is money arriving or leaving.
 */
export function accountActivity(
  transactions: Transaction[],
  accountId: string,
): AccountActivity {
  let moneyIn = 0
  let moneyOut = 0
  let count = 0

  for (const t of transactions) {
    const effect = balanceEffect(t, accountId)
    if (effect === 0) continue
    if (effect > 0) moneyIn += effect
    else moneyOut += -effect
    count += 1
  }

  return { moneyIn, moneyOut, count }
}

export function transactionsInMonth(transactions: Transaction[], key: MonthKey): Transaction[] {
  return transactions.filter((t) => monthKey(t.date) === key)
}

export function transactionsBetween(
  transactions: Transaction[],
  from: string,
  to: string,
): Transaction[] {
  return transactions.filter((t) => t.date >= from && t.date <= to)
}

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

export type BudgetStatus = 'healthy' | 'warning' | 'over'

export interface BudgetProgress {
  budget: Budget
  /** Resolved category, or null for an overall monthly budget. */
  category: Category | null
  name: string
  limit: number
  spent: number
  /** limit - spent; negative when overspent. */
  remaining: number
  /** spent / limit x 100, clamped to 0 when the limit is 0. */
  utilization: number
  status: BudgetStatus
}

export const BUDGET_WARNING_THRESHOLD = 80

/** Budget utilization: spent / budget x 100. A zero budget yields 0, not NaN. */
export function budgetUtilization(spent: number, limit: number): number {
  if (limit <= 0) return 0
  return (spent / limit) * 100
}

export function budgetStatus(utilization: number, limit: number, spent: number): BudgetStatus {
  // A zero-amount budget with any spending is over budget by definition.
  if (limit <= 0) return spent > 0 ? 'over' : 'healthy'
  if (utilization > 100) return 'over'
  if (utilization >= BUDGET_WARNING_THRESHOLD) return 'warning'
  return 'healthy'
}

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  healthy: 'On track',
  warning: 'Approaching limit',
  over: 'Over budget',
}

/** Budgets that are in force for the given month. */
export function activeBudgets(budgets: Budget[], month: MonthKey): Budget[] {
  return budgets.filter((b) => !b.archived && b.startMonth <= month)
}

export function budgetProgress(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
): BudgetProgress[] {
  const monthly = transactionsInMonth(transactions, month)
  const categoryById = new Map(categories.map((c) => [c.id, c]))

  const spentByCategory = new Map<string, number>()
  let spentOverall = 0
  for (const t of monthly) {
    // Transfers are not spending; they must never consume a budget.
    if (t.type !== 'expense') continue
    spentOverall += t.amount
    if (t.categoryId) {
      spentByCategory.set(t.categoryId, (spentByCategory.get(t.categoryId) ?? 0) + t.amount)
    }
  }

  return activeBudgets(budgets, month).map((budget) => {
    const category = budget.categoryId ? (categoryById.get(budget.categoryId) ?? null) : null
    const spent = budget.categoryId ? (spentByCategory.get(budget.categoryId) ?? 0) : spentOverall
    const utilization = budgetUtilization(spent, budget.amount)
    return {
      budget,
      category,
      name: budget.categoryId ? (category?.name ?? 'Removed category') : 'All spending',
      limit: budget.amount,
      spent,
      remaining: budget.amount - spent,
      utilization,
      status: budgetStatus(utilization, budget.amount, spent),
    }
  })
}

/** Roll budget progress up into one health figure for the dashboard. */
export interface BudgetHealth {
  limit: number
  spent: number
  remaining: number
  utilization: number
  status: BudgetStatus
  overCount: number
  warningCount: number
  count: number
}

export function budgetHealth(progress: BudgetProgress[]): BudgetHealth {
  // The overall cap already spans every category; counting it alongside the
  // per-category budgets would double-count the same spending.
  const scoped = progress.filter((p) => p.budget.categoryId !== null)
  const rows = scoped.length > 0 ? scoped : progress

  let limit = 0
  let spent = 0
  let overCount = 0
  let warningCount = 0
  for (const p of rows) {
    limit += p.limit
    spent += p.spent
    if (p.status === 'over') overCount += 1
    else if (p.status === 'warning') warningCount += 1
  }

  const utilization = budgetUtilization(spent, limit)
  return {
    limit,
    spent,
    remaining: limit - spent,
    utilization,
    status: budgetStatus(utilization, limit, spent),
    overCount,
    warningCount,
    count: rows.length,
  }
}

/* ------------------------------------------------------------------ */
/* Category breakdown                                                  */
/* ------------------------------------------------------------------ */

export interface CategoryTotal {
  categoryId: string
  name: string
  color: string
  amount: number
  /** Share of the period total, 0–100. */
  share: number
  count: number
}

export function categoryTotals(
  transactions: Transaction[],
  categories: Category[],
  type: CategoryTotalType = 'expense',
): CategoryTotal[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const buckets = new Map<string, { amount: number; count: number }>()
  let total = 0

  for (const t of transactions) {
    // Transfers carry no category and are never part of a spending breakdown.
    if (t.type !== type) continue
    const key = t.categoryId ?? UNCATEGORIZED
    const bucket = buckets.get(key) ?? { amount: 0, count: 0 }
    bucket.amount += t.amount
    bucket.count += 1
    buckets.set(key, bucket)
    total += t.amount
  }

  return [...buckets.entries()]
    .map(([categoryId, { amount, count }]) => {
      const category = categoryById.get(categoryId)
      return {
        categoryId,
        name: category?.name ?? 'Uncategorized',
        color: category?.color ?? 'viz-neutral',
        amount,
        share: total > 0 ? (amount / total) * 100 : 0,
        count,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

export type CategoryTotalType = 'income' | 'expense'

export const UNCATEGORIZED = '__uncategorized__'

/** Percentage change from `previous` to `current`; null when undefined. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/** How many transactions reference a category — the guard before deleting one. */
export function countByCategory(transactions: Transaction[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const t of transactions) {
    if (!t.categoryId) continue
    counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
  }
  return counts
}

/** How many transactions touch an account, counting both sides of transfers. */
export function countByAccount(transactions: Transaction[]): Map<string, number> {
  const counts = new Map<string, number>()
  const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const t of transactions) {
    bump(t.accountId)
    if (t.type === 'transfer' && t.toAccountId) bump(t.toAccountId)
  }
  return counts
}
