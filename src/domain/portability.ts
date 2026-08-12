/**
 * Data portability: CSV and JSON export, and a validated CSV import.
 *
 * Import is deliberately a two-phase operation. `analyseCsvImport` is pure — it
 * classifies every row as valid, duplicate or invalid and explains why, which is
 * what the preview screen renders. `applyCsvImport` then commits only what the
 * user has seen. No row is ever discarded silently.
 */

import { detectDelimiter, indexHeaders, normaliseHeader, parseCsv, toCsv } from './csv'
import { isValidIso, toIso } from './dates'
import { formatMoney, parseAmountToCents } from './money'
import { isValid, normaliseDraft, validateTransaction } from './validation'
import type { TransactionDraft } from './validation'
import type {
  Account,
  Category,
  LedgerData,
  Transaction,
  TransactionType,
} from './types'

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export const CSV_COLUMNS = [
  'Date',
  'Description',
  'Amount',
  'Type',
  'Category',
  'Account',
  'To Account',
  'Notes',
] as const

/**
 * Transactions as CSV. Amounts are written as a positive decimal magnitude with
 * the direction carried by the Type column, which is exactly what the importer
 * reads back — so an export/import round trip is lossless.
 */
export function transactionsToCsv(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
): string {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  const rows: Array<Array<string | number>> = [[...CSV_COLUMNS]]
  // Oldest first: the natural reading order for a statement.
  const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

  for (const t of ordered) {
    rows.push([
      t.date,
      t.description,
      (t.amount / 100).toFixed(2),
      t.type,
      t.categoryId ? (categoryName.get(t.categoryId) ?? '') : '',
      accountName.get(t.accountId) ?? '',
      t.toAccountId ? (accountName.get(t.toAccountId) ?? '') : '',
      t.notes ?? '',
    ])
  }

  return toCsv(rows)
}

export interface BackupEnvelope {
  format: 'ledger-backup'
  formatVersion: number
  exportedAt: string
  data: LedgerData
}

export const BACKUP_FORMAT_VERSION = 1

/** A complete, restorable snapshot of the ledger. */
export function buildBackup(data: LedgerData, now = new Date().toISOString()): string {
  const envelope: BackupEnvelope = {
    format: 'ledger-backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now,
    data,
  }
  return JSON.stringify(envelope, null, 2)
}

export type BackupParseResult =
  | { ok: true; data: LedgerData; exportedAt?: string }
  | { ok: false; error: string }

/**
 * Read a backup file. Accepts both the wrapped envelope and a bare `LedgerData`
 * document, so a hand-edited export still restores.
 */
export function parseBackup(text: string): BackupParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'That file does not contain a ledger backup.' }
  }

  const envelope = parsed as Partial<BackupEnvelope>
  const candidate = envelope.format === 'ledger-backup' ? envelope.data : (parsed as LedgerData)

  if (!isLedgerShape(candidate)) {
    return {
      ok: false,
      error:
        'That file is missing the accounts, categories or transactions a Ledger backup needs.',
    }
  }

  return {
    ok: true,
    data: candidate,
    ...(envelope.exportedAt ? { exportedAt: envelope.exportedAt } : {}),
  }
}

function isLedgerShape(value: unknown): value is LedgerData {
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

/* ------------------------------------------------------------------ */
/* Import                                                             */
/* ------------------------------------------------------------------ */

/** Header aliases, so exports from other tools import without hand-editing. */
const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'transactiondate', 'posteddate', 'posted', 'when', 'day'],
  description: ['description', 'payee', 'merchant', 'name', 'details', 'reference', 'title'],
  amount: ['amount', 'value', 'total', 'sum'],
  type: ['type', 'transactiontype', 'direction', 'kind'],
  category: ['category', 'categoryname'],
  account: ['account', 'accountname', 'fromaccount', 'from', 'source'],
  toaccount: ['toaccount', 'to', 'destination', 'transferto', 'targetaccount'],
  notes: ['notes', 'note', 'memo', 'comment', 'comments'],
}

export type ImportRowStatus = 'valid' | 'duplicate' | 'invalid'

export interface ImportRow {
  /** 1-based line number in the source file, including the header. */
  line: number
  status: ImportRowStatus
  /** Why the row was rejected, or why it looks like a duplicate. */
  messages: string[]
  /** Non-blocking notes, e.g. "Account defaulted to Everyday Checking". */
  warnings: string[]
  /** What will be created. Present for valid and duplicate rows only. */
  transaction?: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>
  /** Human-readable summary for the preview table. */
  date: string
  description: string
  amount: string
  type: string
  category: string
  account: string
}

/** An entity named in the file that the ledger does not have yet. */
export interface MissingAccount {
  name: string
  placeholderId: string
}

export interface MissingCategory {
  name: string
  type: 'income' | 'expense'
  placeholderId: string
}

export interface ImportAnalysis {
  rows: ImportRow[]
  validCount: number
  duplicateCount: number
  invalidCount: number
  /** Fatal problems with the file itself; when set, `rows` is empty. */
  fileErrors: string[]
  /** Categories named in the file that do not exist yet. */
  missingCategories: MissingCategory[]
  /** Accounts named in the file that do not exist yet. */
  missingAccounts: MissingAccount[]
  delimiter: string
}

export interface ImportOptions {
  /** Create categories and accounts named in the file but not yet in the ledger. */
  createMissing: boolean
  /** Account used when a row has no account column or an empty one. */
  defaultAccountId?: string
  /** Include rows that match an existing transaction. */
  includeDuplicates: boolean
  currency?: string
  locale?: string
}

export function analyseCsvImport(
  text: string,
  data: LedgerData,
  options: ImportOptions,
): ImportAnalysis {
  const empty = (fileErrors: string[]): ImportAnalysis => ({
    rows: [],
    validCount: 0,
    duplicateCount: 0,
    invalidCount: 0,
    fileErrors,
    missingCategories: [],
    missingAccounts: [],
    delimiter: ',',
  })

  if (!text.trim()) return empty(['The file is empty.'])

  const delimiter = detectDelimiter(text)
  const parsed = parseCsv(text, delimiter)
  if (parsed.length === 0) return empty(['The file has no rows.'])

  const header = parsed[0]
  const headerIndex = indexHeaders(header)
  const column = (field: string): number | undefined => {
    for (const alias of HEADER_ALIASES[field] ?? []) {
      const index = headerIndex.get(normaliseHeader(alias))
      if (index !== undefined) return index
    }
    return undefined
  }

  const columns = {
    date: column('date'),
    description: column('description'),
    amount: column('amount'),
    type: column('type'),
    category: column('category'),
    account: column('account'),
    toaccount: column('toaccount'),
    notes: column('notes'),
  }

  const missingRequired = (['date', 'description', 'amount'] as const).filter(
    (field) => columns[field] === undefined,
  )
  if (missingRequired.length > 0) {
    return empty([
      `The file needs a column for ${missingRequired.join(', ')}. Found: ${header
        .map((h) => h.trim())
        .filter(Boolean)
        .join(', ') || '(no header row)'}.`,
    ])
  }

  const body = parsed.slice(1)
  if (body.length === 0) return empty(['The file has a header but no transactions.'])

  // Name lookups are case- and space-insensitive so "eating out" finds "Eating Out".
  const accountByName = new Map(data.accounts.map((a) => [normaliseName(a.name), a]))
  const categoryByName = new Map(
    data.categories.map((c) => [`${c.type}:${normaliseName(c.name)}`, c]),
  )
  const categoryByAnyName = new Map(data.categories.map((c) => [normaliseName(c.name), c]))

  const existingKeys = new Set(data.transactions.map(duplicateKey))
  const batchKeys = new Set<string>()

  // Entities the file references but the ledger lacks. Placeholders are added to
  // the pending lists as they are discovered, so a row is always validated
  // against the ledger as it will look once the import is committed.
  const missingAccounts = new Map<string, MissingAccount>()
  const missingCategories = new Map<string, MissingCategory>()
  const pendingAccounts: Account[] = [...data.accounts]
  const pendingCategories: Category[] = [...data.categories]

  const registerAccount = (rawName: string): string => {
    const key = normaliseName(rawName)
    const existing = missingAccounts.get(key)
    if (existing) return existing.placeholderId
    const placeholderId = pendingId('account', rawName)
    missingAccounts.set(key, { name: rawName.trim(), placeholderId })
    pendingAccounts.push({
      id: placeholderId,
      name: rawName.trim(),
      type: 'other',
      startingBalance: 0,
    })
    return placeholderId
  }

  const registerCategory = (rawName: string, type: 'income' | 'expense'): string => {
    const key = `${type}:${normaliseName(rawName)}`
    const existing = missingCategories.get(key)
    if (existing) return existing.placeholderId
    const placeholderId = pendingId('category', key)
    missingCategories.set(key, { name: rawName.trim(), type, placeholderId })
    pendingCategories.push({
      id: placeholderId,
      name: rawName.trim(),
      type,
      color: 'viz-neutral',
    })
    return placeholderId
  }

  const rows: ImportRow[] = []

  body.forEach((cells, index) => {
    const line = index + 2 // +1 for the header, +1 for 1-based counting
    const cell = (position: number | undefined): string =>
      position === undefined ? '' : (cells[position] ?? '').trim()

    const rawDate = cell(columns.date)
    const rawDescription = cell(columns.description)
    const rawAmount = cell(columns.amount)
    const rawType = cell(columns.type)
    const rawCategory = cell(columns.category)
    const rawAccount = cell(columns.account)
    const rawToAccount = cell(columns.toaccount)
    const rawNotes = cell(columns.notes)

    const messages: string[] = []
    const warnings: string[] = []

    // A completely blank line is noise, not data worth reporting on.
    if (!rawDate && !rawDescription && !rawAmount) return

    const date = coerceDate(rawDate)
    if (!date) messages.push(`Could not read the date "${rawDate || '(empty)'}".`)

    const parsedAmount = parseAmountToCents(rawAmount)
    if (parsedAmount === null) {
      messages.push(`Could not read the amount "${rawAmount || '(empty)'}".`)
    }

    const type = coerceType(rawType, parsedAmount, rawToAccount)
    if (rawType && !type) messages.push(`"${rawType}" is not a known transaction type.`)
    const resolvedType: TransactionType = type ?? (parsedAmount !== null && parsedAmount < 0 ? 'expense' : 'income')
    if (!rawType && !rawToAccount) {
      warnings.push(
        `Type read as ${resolvedType} from the amount's sign.`,
      )
    }

    // Source account.
    let accountId = ''
    if (rawAccount) {
      const found = accountByName.get(normaliseName(rawAccount))
      if (found) accountId = found.id
      else if (options.createMissing) accountId = registerAccount(rawAccount)
      else messages.push(`Account "${rawAccount}" does not exist yet.`)
    } else if (options.defaultAccountId) {
      accountId = options.defaultAccountId
      const name = data.accounts.find((a) => a.id === accountId)?.name
      if (name) warnings.push(`Account defaulted to ${name}.`)
    } else {
      messages.push('No account given and no default chosen.')
    }

    // Destination account for transfers.
    let toAccountId: string | undefined
    if (resolvedType === 'transfer') {
      if (!rawToAccount) {
        messages.push('A transfer needs a destination account.')
      } else {
        const found = accountByName.get(normaliseName(rawToAccount))
        if (found) toAccountId = found.id
        else if (options.createMissing) toAccountId = registerAccount(rawToAccount)
        else messages.push(`Account "${rawToAccount}" does not exist yet.`)
      }
    }

    // Category, scoped to the transaction's direction.
    let categoryId: string | null = null
    if (resolvedType !== 'transfer') {
      const categoryType = resolvedType
      if (rawCategory) {
        const exact = categoryByName.get(`${categoryType}:${normaliseName(rawCategory)}`)
        const anyDirection = categoryByAnyName.get(normaliseName(rawCategory))
        if (exact) {
          categoryId = exact.id
        } else if (anyDirection && anyDirection.type !== categoryType) {
          messages.push(
            `Category "${rawCategory}" is a ${anyDirection.type} category, but this row is ${categoryType}.`,
          )
        } else if (options.createMissing) {
          categoryId = registerCategory(rawCategory, categoryType)
        } else {
          messages.push(`Category "${rawCategory}" does not exist yet.`)
        }
      } else {
        const fallback = fallbackCategory(data.categories, categoryType)
        if (fallback) {
          categoryId = fallback.id
          warnings.push(`Category defaulted to ${fallback.name}.`)
        } else {
          messages.push(`No category given and no ${categoryType} category exists to fall back on.`)
        }
      }
    }

    const summary = {
      date: date ?? rawDate,
      description: rawDescription,
      amount:
        parsedAmount === null
          ? rawAmount
          : formatMoney(Math.abs(parsedAmount), {
              currency: options.currency,
              locale: options.locale,
            }),
      type: resolvedType,
      category: rawCategory || (resolvedType === 'transfer' ? '—' : ''),
      account: rawAccount || data.accounts.find((a) => a.id === accountId)?.name || '',
    }

    if (messages.length > 0) {
      rows.push({ line, status: 'invalid', messages, warnings, ...summary })
      return
    }

    const draft: TransactionDraft = {
      description: rawDescription,
      amount: parsedAmount === null ? null : Math.abs(parsedAmount),
      type: resolvedType,
      categoryId,
      accountId,
      date: date ?? '',
      notes: rawNotes || undefined,
    }
    if (toAccountId) draft.toAccountId = toAccountId

    const errors = validateTransaction(draft, {
      accounts: pendingAccounts,
      categories: pendingCategories,
    })
    if (!isValid(errors)) {
      rows.push({
        line,
        status: 'invalid',
        messages: Object.values(errors).filter((m): m is string => Boolean(m)),
        warnings,
        ...summary,
      })
      return
    }

    const transaction = normaliseDraft(draft)
    const key = duplicateKey(transaction)
    const isDuplicate = existingKeys.has(key) || batchKeys.has(key)
    batchKeys.add(key)

    rows.push({
      line,
      status: isDuplicate ? 'duplicate' : 'valid',
      messages: isDuplicate
        ? [
            existingKeys.has(key)
              ? 'Matches a transaction already in your ledger.'
              : 'Matches an earlier row in this file.',
          ]
        : [],
      warnings,
      transaction,
      ...summary,
    })
  })

  return {
    rows,
    validCount: rows.filter((r) => r.status === 'valid').length,
    duplicateCount: rows.filter((r) => r.status === 'duplicate').length,
    invalidCount: rows.filter((r) => r.status === 'invalid').length,
    fileErrors: [],
    missingCategories: [...missingCategories.values()],
    missingAccounts: [...missingAccounts.values()],
    delimiter,
  }
}

/** Rows an import will actually create, given the duplicate policy. */
export function acceptedRows(analysis: ImportAnalysis, includeDuplicates: boolean): ImportRow[] {
  return analysis.rows.filter(
    (row) =>
      row.transaction !== undefined &&
      (row.status === 'valid' || (row.status === 'duplicate' && includeDuplicates)),
  )
}

export interface ImportResult {
  data: LedgerData
  imported: number
  skippedDuplicates: number
  skippedInvalid: number
  createdAccounts: number
  createdCategories: number
}

/**
 * Commit an analysis. Placeholder ids for accounts and categories created by the
 * import are rewritten to their real ids here, in one pass, so the committed
 * document never contains a dangling reference.
 */
export function applyCsvImport(
  analysis: ImportAnalysis,
  data: LedgerData,
  options: ImportOptions,
  makeId: () => string,
  now = new Date().toISOString(),
): ImportResult {
  const accounts = [...data.accounts]
  const categories = [...data.categories]
  const idRewrites = new Map<string, string>()

  if (options.createMissing) {
    for (const missing of analysis.missingAccounts) {
      const id = makeId()
      idRewrites.set(missing.placeholderId, id)
      accounts.push({
        id,
        name: missing.name,
        type: 'other',
        startingBalance: 0,
        currency: data.settings.currency,
        notes: 'Created by CSV import.',
      })
    }
    for (const missing of analysis.missingCategories) {
      const id = makeId()
      idRewrites.set(missing.placeholderId, id)
      categories.push({
        id,
        name: missing.name,
        type: missing.type,
        color: 'viz-neutral',
      })
    }
  }

  const resolve = (id: string): string => idRewrites.get(id) ?? id
  const accepted = acceptedRows(analysis, options.includeDuplicates)

  const created: Transaction[] = accepted.map((row) => {
    const source = row.transaction as Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>
    const transaction: Transaction = {
      ...source,
      accountId: resolve(source.accountId),
      categoryId: source.categoryId ? resolve(source.categoryId) : null,
      id: makeId(),
      createdAt: now,
      updatedAt: now,
    }
    if (source.toAccountId) transaction.toAccountId = resolve(source.toAccountId)
    return transaction
  })

  return {
    data: {
      ...data,
      accounts,
      categories,
      transactions: [...created, ...data.transactions],
    },
    imported: created.length,
    skippedDuplicates: options.includeDuplicates
      ? 0
      : analysis.rows.filter((r) => r.status === 'duplicate').length,
    skippedInvalid: analysis.invalidCount,
    createdAccounts: accounts.length - data.accounts.length,
    createdCategories: categories.length - data.categories.length,
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const PENDING_PREFIX = '__pending__'

function pendingId(kind: string, name: string): string {
  return `${PENDING_PREFIX}${kind}:${normaliseName(name)}`
}

export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * A transaction is "the same" as another when the day, direction, magnitude,
 * account and description all match. Deliberately strict: two genuine coffees on
 * one day for the same amount would flag, so duplicates are reported for review
 * rather than dropped.
 */
export function duplicateKey(
  transaction: Pick<Transaction, 'date' | 'type' | 'amount' | 'description' | 'accountId'>,
): string {
  return [
    transaction.date,
    transaction.type,
    transaction.amount,
    transaction.accountId,
    normaliseName(transaction.description),
  ].join('|')
}

/** Accept ISO, `DD/MM/YYYY`, `MM/DD/YYYY` and `YYYY/MM/DD`. */
export function coerceDate(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  if (isValidIso(raw)) return raw

  // Some exports append a time; the calendar day is all a ledger entry needs.
  const isoPrefix = raw.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoPrefix)) {
    // Dash-separated and already the right shape: either it is a real date or the
    // row is wrong. Never hand it to `new Date`, which rolls 2026-02-30 into March.
    return isValidIso(isoPrefix) ? isoPrefix : null
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) {
    const [y, m, d] = raw.split(/[-T\s]/)
    const candidate = `${y}-${pad(m)}-${pad(d)}`
    return isValidIso(candidate) ? candidate : null
  }

  const parts = raw.match(/^(\d{1,4})[/.](\d{1,2})[/.](\d{1,4})$/)
  if (parts) {
    const [, a, b, c] = parts
    if (a.length === 4) {
      const candidate = `${a}-${pad(b)}-${pad(c)}`
      return isValidIso(candidate) ? candidate : null
    }
    const year = c.length === 2 ? `20${c}` : c
    const first = Number(a)
    const second = Number(b)
    // Ambiguous DD/MM vs MM/DD: only one reading can be valid when a part is >12.
    const dayFirst = `${year}-${pad(b)}-${pad(a)}`
    const monthFirst = `${year}-${pad(a)}-${pad(b)}`
    if (first > 12 && second <= 12) return isValidIso(dayFirst) ? dayFirst : null
    if (second > 12 && first <= 12) return isValidIso(monthFirst) ? monthFirst : null
    // Genuinely ambiguous — take the ISO-adjacent reading (day first).
    return isValidIso(dayFirst) ? dayFirst : null
  }

  // Last resort: let the platform try, then pin the calendar day.
  const parsedDate = new Date(raw)
  if (!Number.isNaN(parsedDate.getTime())) return toIso(parsedDate)

  return null
}

function pad(value: string): string {
  return value.padStart(2, '0')
}

const TYPE_WORDS: Record<string, TransactionType> = {
  income: 'income',
  credit: 'income',
  deposit: 'income',
  in: 'income',
  earning: 'income',
  expense: 'expense',
  debit: 'expense',
  withdrawal: 'expense',
  payment: 'expense',
  out: 'expense',
  spending: 'expense',
  transfer: 'transfer',
  move: 'transfer',
}

/** Read the type column, falling back to the amount's sign or a destination account. */
export function coerceType(
  rawType: string,
  amount: number | null,
  rawToAccount: string,
): TransactionType | null {
  const word = rawType.trim().toLowerCase()
  if (word) {
    const known = TYPE_WORDS[word]
    if (known) return known
    return null
  }
  if (rawToAccount.trim()) return 'transfer'
  if (amount === null) return null
  return amount < 0 ? 'expense' : 'income'
}

function fallbackCategory(
  categories: Category[],
  type: 'income' | 'expense',
): Category | undefined {
  const scoped = categories.filter((c) => c.type === type)
  return scoped.find((c) => normaliseName(c.name) === 'other') ?? scoped[0]
}

/** Build a filename that sorts chronologically: `ledger-transactions-2026-08-11.csv`. */
export function exportFilename(kind: 'transactions' | 'backup', today: string): string {
  return `ledger-${kind}-${today}.${kind === 'backup' ? 'json' : 'csv'}`
}
