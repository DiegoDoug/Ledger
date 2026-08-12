/**
 * Transaction querying: search, filter and sort. Kept separate from rendering
 * so the same query engine backs the transactions table, the search page, the
 * command palette and any analytics drill-down.
 */

import type { Account, Category, IsoDate, Transaction, TransactionType } from './types'

export type SortField = 'date' | 'amount' | 'description' | 'category'
export type SortDirection = 'asc' | 'desc'

export interface TransactionQuery {
  search?: string
  type?: TransactionType | 'all'
  categoryIds?: string[]
  accountIds?: string[]
  from?: IsoDate
  to?: IsoDate
  minAmount?: number
  maxAmount?: number
  sortField?: SortField
  sortDirection?: SortDirection
}

export interface QueryContext {
  categories: Category[]
  accounts: Account[]
}

/** Both accounts a transaction touches — one for most rows, two for transfers. */
export function accountIdsOf(transaction: Transaction): string[] {
  if (transaction.type === 'transfer' && transaction.toAccountId) {
    return [transaction.accountId, transaction.toAccountId]
  }
  return [transaction.accountId]
}

/**
 * Matches a transaction against a free-text query across description,
 * category name, account name(s), notes and the formatted amount.
 */
export function matchesSearch(
  transaction: Transaction,
  term: string,
  context: QueryContext,
): boolean {
  const needle = term.trim().toLowerCase()
  if (!needle) return true

  const category = transaction.categoryId
    ? context.categories.find((c) => c.id === transaction.categoryId)
    : undefined
  const accountNames = accountIdsOf(transaction).map(
    (id) => context.accounts.find((a) => a.id === id)?.name ?? '',
  )

  const haystack = [
    transaction.description,
    transaction.notes ?? '',
    category?.name ?? '',
    ...accountNames,
    // A transfer is findable by the word "transfer" even though it has no category.
    transaction.type === 'transfer' ? 'transfer' : '',
    (transaction.amount / 100).toFixed(2),
  ]
    .join(' ')
    .toLowerCase()

  // Every whitespace-separated token must appear, so "coffee march" narrows.
  return needle.split(/\s+/).every((token) => haystack.includes(token))
}

export function filterTransactions(
  transactions: Transaction[],
  query: TransactionQuery,
  context: QueryContext,
): Transaction[] {
  const {
    search = '',
    type = 'all',
    categoryIds,
    accountIds,
    from,
    to,
    minAmount,
    maxAmount,
  } = query

  const accountFilter = accountIds && accountIds.length > 0 ? new Set(accountIds) : null
  const categoryFilter = categoryIds && categoryIds.length > 0 ? new Set(categoryIds) : null

  return transactions.filter((t) => {
    if (type !== 'all' && t.type !== type) return false
    // A transfer has no category, so any category filter necessarily excludes it.
    if (categoryFilter && (!t.categoryId || !categoryFilter.has(t.categoryId))) return false
    // A transfer matches an account filter from either side of the movement.
    if (accountFilter && !accountIdsOf(t).some((id) => accountFilter.has(id))) return false
    if (from && t.date < from) return false
    if (to && t.date > to) return false
    if (minAmount !== undefined && t.amount < minAmount) return false
    if (maxAmount !== undefined && t.amount > maxAmount) return false
    if (search && !matchesSearch(t, search, context)) return false
    return true
  })
}

export function sortTransactions(
  transactions: Transaction[],
  field: SortField = 'date',
  direction: SortDirection = 'desc',
  context?: QueryContext,
): Transaction[] {
  const factor = direction === 'asc' ? 1 : -1
  const categoryName = (transaction: Transaction) => {
    if (transaction.type === 'transfer') return 'Transfer'
    if (!transaction.categoryId) return ''
    return context?.categories.find((c) => c.id === transaction.categoryId)?.name ?? ''
  }

  return [...transactions].sort((a, b) => {
    let result = 0
    switch (field) {
      case 'amount':
        result = a.amount - b.amount
        break
      case 'description':
        result = a.description.localeCompare(b.description)
        break
      case 'category':
        result = categoryName(a).localeCompare(categoryName(b))
        break
      case 'date':
      default:
        result = a.date.localeCompare(b.date)
        break
    }
    // Stable tiebreak so equal keys never reorder between renders.
    if (result === 0) result = a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    return result * factor
  })
}

export function queryTransactions(
  transactions: Transaction[],
  query: TransactionQuery,
  context: QueryContext,
): Transaction[] {
  const filtered = filterTransactions(transactions, query, context)
  return sortTransactions(filtered, query.sortField ?? 'date', query.sortDirection ?? 'desc', context)
}

/** Number of filters (excluding search + sort) that are narrowing the result. */
export function activeFilterCount(query: TransactionQuery): number {
  let count = 0
  if (query.type && query.type !== 'all') count += 1
  if (query.categoryIds && query.categoryIds.length > 0) count += 1
  if (query.accountIds && query.accountIds.length > 0) count += 1
  if (query.from || query.to) count += 1
  if (query.minAmount !== undefined || query.maxAmount !== undefined) count += 1
  return count
}

/** Group transactions into date buckets, newest first, for list rendering. */
export function groupByDate(transactions: Transaction[]): Array<[IsoDate, Transaction[]]> {
  const groups = new Map<IsoDate, Transaction[]>()
  for (const t of transactions) {
    const bucket = groups.get(t.date)
    if (bucket) bucket.push(t)
    else groups.set(t.date, [t])
  }
  return [...groups.entries()]
}
