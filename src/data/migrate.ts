/**
 * Schema migration for persisted documents.
 *
 * Anything loaded from storage passes through here before the app sees it, so
 * the rest of the codebase can assume the current shape. Migrations are additive
 * and idempotent — running them twice changes nothing.
 */

import { DATA_VERSION } from '../domain/seed'
import type { LedgerData, Settings, Transaction } from '../domain/types'

/** Structural check — enough to catch corruption without a schema dependency. */
export function isLedgerData(value: unknown): value is LedgerData {
  if (typeof value !== 'object' || value === null) return false
  const d = value as Partial<LedgerData>
  return (
    Array.isArray(d.accounts) &&
    Array.isArray(d.categories) &&
    Array.isArray(d.transactions) &&
    Array.isArray(d.budgets) &&
    Array.isArray(d.recurring) &&
    typeof d.settings === 'object' &&
    d.settings !== null
  )
}

const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  locale: 'en-US',
  theme: 'system',
  profileName: 'You',
}

/**
 * v1 → v2: transactions gained `updatedAt` and a nullable `categoryId`
 * (transfers have no category), and accounts gained an explicit currency.
 */
export function migrateDocument(input: LedgerData, primaryCurrency?: string): LedgerData {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...input.settings }
  const currency = primaryCurrency ?? settings.currency

  const transactions = input.transactions.map((t): Transaction => {
    const createdAt = t.createdAt ?? new Date().toISOString()
    const migrated: Transaction = {
      ...t,
      // A transfer never carries a category, whatever an older document said.
      categoryId: t.type === 'transfer' ? null : (t.categoryId ?? null),
      createdAt,
      updatedAt: t.updatedAt ?? createdAt,
    }
    // Drop a destination account left on a non-transfer row by a hand edit.
    if (migrated.type !== 'transfer' && migrated.toAccountId) delete migrated.toAccountId
    return migrated
  })

  return {
    ...input,
    version: DATA_VERSION,
    accounts: input.accounts.map((a) => ({ ...a, currency: a.currency ?? currency })),
    categories: input.categories.map((c) => ({ ...c })),
    transactions,
    budgets: input.budgets.map((b) => ({ ...b })),
    recurring: input.recurring.map((r) => ({
      ...r,
      categoryId: r.type === 'transfer' ? null : (r.categoryId ?? null),
    })),
    settings,
  }
}
