import { describe, expect, it } from 'vitest'
import {
  acceptedRows,
  analyseCsvImport,
  applyCsvImport,
  buildBackup,
  coerceDate,
  coerceType,
  duplicateKey,
  parseBackup,
  transactionsToCsv,
} from './portability'
import type { ImportOptions } from './portability'
import { parseCsv } from './csv'
import { DATA_VERSION } from './seed'
import type { Account, Category, LedgerData, Transaction } from './types'

const accounts: Account[] = [
  { id: 'a1', name: 'Everyday Checking', type: 'checking', startingBalance: 0 },
  { id: 'a2', name: 'High-Yield Savings', type: 'savings', startingBalance: 0 },
]

const categories: Category[] = [
  { id: 'c-food', name: 'Groceries', type: 'expense', color: 'viz-1' },
  { id: 'c-other', name: 'Other', type: 'expense', color: 'viz-2' },
  { id: 'c-pay', name: 'Salary', type: 'income', color: 'viz-3' },
]

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    description: 'Whole Foods',
    amount: 42_50,
    type: 'expense',
    categoryId: 'c-food',
    accountId: 'a1',
    date: '2026-03-15',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  }
}

function ledger(transactions: Transaction[] = []): LedgerData {
  return {
    version: DATA_VERSION,
    accounts,
    categories,
    transactions,
    budgets: [],
    recurring: [],
    settings: { currency: 'EUR', locale: 'en-IE', theme: 'system', profileName: 'Test' },
  }
}

const options: ImportOptions = {
  createMissing: false,
  includeDuplicates: false,
  defaultAccountId: 'a1',
}

let idCounter = 0
const makeId = () => `new-${(idCounter += 1)}`

/* ------------------------------------------------------------------ */
/* Export                                                             */
/* ------------------------------------------------------------------ */

describe('transactionsToCsv', () => {
  it('writes a header and one row per transaction, oldest first', () => {
    const csv = transactionsToCsv(
      [tx({ id: 'b', date: '2026-03-02' }), tx({ id: 'a', date: '2026-03-01' })],
      accounts,
      categories,
    )
    const rows = parseCsv(csv)
    expect(rows[0]).toEqual([
      'Date',
      'Description',
      'Amount',
      'Type',
      'Category',
      'Account',
      'To Account',
      'Notes',
    ])
    expect(rows[1][0]).toBe('2026-03-01')
    expect(rows[2][0]).toBe('2026-03-02')
  })

  it('writes amounts as a positive decimal with direction in the Type column', () => {
    const csv = transactionsToCsv([tx({ amount: 1_234_56 })], accounts, categories)
    const [, row] = parseCsv(csv)
    expect(row[2]).toBe('1234.56')
    expect(row[3]).toBe('expense')
  })

  it('writes both accounts for a transfer and leaves the category empty', () => {
    const csv = transactionsToCsv(
      [tx({ type: 'transfer', categoryId: null, toAccountId: 'a2', description: 'Sweep' })],
      accounts,
      categories,
    )
    const [, row] = parseCsv(csv)
    expect(row[3]).toBe('transfer')
    expect(row[4]).toBe('')
    expect(row[5]).toBe('Everyday Checking')
    expect(row[6]).toBe('High-Yield Savings')
  })

  it('round-trips back through the importer without loss', () => {
    const original = [
      tx({ id: '1', amount: 42_50, date: '2026-03-01', notes: 'Weekly, with Sam' }),
      tx({ id: '2', type: 'income', categoryId: 'c-pay', amount: 3_000_00, date: '2026-03-02' }),
      tx({
        id: '3',
        type: 'transfer',
        categoryId: null,
        toAccountId: 'a2',
        amount: 500_00,
        date: '2026-03-03',
      }),
    ]
    const csv = transactionsToCsv(original, accounts, categories)
    const analysis = analyseCsvImport(csv, ledger(), options)

    expect(analysis.fileErrors).toEqual([])
    expect(analysis.validCount).toBe(3)
    const imported = acceptedRows(analysis, false).map((r) => r.transaction)
    expect(imported).toEqual([
      expect.objectContaining({ amount: 42_50, type: 'expense', categoryId: 'c-food', notes: 'Weekly, with Sam' }),
      expect.objectContaining({ amount: 3_000_00, type: 'income', categoryId: 'c-pay' }),
      expect.objectContaining({ amount: 500_00, type: 'transfer', categoryId: null, toAccountId: 'a2' }),
    ])
  })
})

describe('JSON backup', () => {
  it('wraps the document in a versioned envelope and restores it', () => {
    const data = ledger([tx()])
    const result = parseBackup(buildBackup(data, '2026-08-11T00:00:00.000Z'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.transactions).toHaveLength(1)
    expect(result.exportedAt).toBe('2026-08-11T00:00:00.000Z')
  })

  it('also accepts a bare ledger document', () => {
    const result = parseBackup(JSON.stringify(ledger([tx()])))
    expect(result.ok).toBe(true)
  })

  it('reports invalid JSON without throwing', () => {
    const result = parseBackup('{not json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/not valid JSON/i)
  })

  it('rejects JSON that is not a ledger backup', () => {
    expect(parseBackup('{"hello":"world"}').ok).toBe(false)
    expect(parseBackup('[]').ok).toBe(false)
    expect(parseBackup('null').ok).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/* Import parsing helpers                                             */
/* ------------------------------------------------------------------ */

describe('coerceDate', () => {
  it('passes ISO dates through', () => {
    expect(coerceDate('2026-03-15')).toBe('2026-03-15')
  })

  it('takes the calendar day from an ISO timestamp', () => {
    expect(coerceDate('2026-03-15T22:45:00Z')).toBe('2026-03-15')
  })

  it('reads an unambiguous day-first or month-first date', () => {
    expect(coerceDate('25/03/2026')).toBe('2026-03-25')
    expect(coerceDate('03/25/2026')).toBe('2026-03-25')
  })

  it('reads a year-first slashed date', () => {
    expect(coerceDate('2026/03/15')).toBe('2026-03-15')
  })

  it('expands a two-digit year', () => {
    expect(coerceDate('15/03/26')).toBe('2026-03-15')
  })

  it('rejects an impossible date rather than rolling it over', () => {
    expect(coerceDate('30/02/2026')).toBeNull()
    expect(coerceDate('2026-02-30')).toBeNull()
  })

  it('returns null for empty or unreadable input', () => {
    expect(coerceDate('')).toBeNull()
    expect(coerceDate('   ')).toBeNull()
    expect(coerceDate('sometime last week')).toBeNull()
  })
})

describe('coerceType', () => {
  it('reads common words used by other tools', () => {
    expect(coerceType('debit', null, '')).toBe('expense')
    expect(coerceType('CREDIT', null, '')).toBe('income')
    expect(coerceType('Withdrawal', null, '')).toBe('expense')
    expect(coerceType('transfer', null, '')).toBe('transfer')
  })

  it('returns null for a word it does not know, rather than guessing', () => {
    expect(coerceType('reversal', -500, '')).toBeNull()
  })

  it('falls back to the amount sign when there is no type column', () => {
    expect(coerceType('', -500, '')).toBe('expense')
    expect(coerceType('', 500, '')).toBe('income')
  })

  it('treats a destination account as a transfer when no type is given', () => {
    expect(coerceType('', -500, 'Savings')).toBe('transfer')
  })
})

describe('duplicateKey', () => {
  it('matches on day, direction, amount, account and description', () => {
    expect(duplicateKey(tx())).toBe(duplicateKey(tx({ id: 'other' })))
  })

  it('ignores case and extra spacing in the description', () => {
    expect(duplicateKey(tx({ description: '  whole   foods ' }))).toBe(duplicateKey(tx()))
  })

  it('distinguishes a different day, amount or account', () => {
    expect(duplicateKey(tx({ date: '2026-03-16' }))).not.toBe(duplicateKey(tx()))
    expect(duplicateKey(tx({ amount: 42_51 }))).not.toBe(duplicateKey(tx()))
    expect(duplicateKey(tx({ accountId: 'a2' }))).not.toBe(duplicateKey(tx()))
  })
})

/* ------------------------------------------------------------------ */
/* Import analysis                                                    */
/* ------------------------------------------------------------------ */

describe('analyseCsvImport — file level', () => {
  it('reports an empty file', () => {
    expect(analyseCsvImport('', ledger(), options).fileErrors).toHaveLength(1)
    expect(analyseCsvImport('   ', ledger(), options).fileErrors).toHaveLength(1)
  })

  it('names the columns it needs when they are missing', () => {
    const analysis = analyseCsvImport('foo,bar\n1,2', ledger(), options)
    expect(analysis.fileErrors[0]).toMatch(/date/)
    expect(analysis.fileErrors[0]).toMatch(/amount/)
    expect(analysis.rows).toEqual([])
  })

  it('reports a header with no data rows', () => {
    const analysis = analyseCsvImport('Date,Description,Amount', ledger(), options)
    expect(analysis.fileErrors[0]).toMatch(/no transactions/i)
  })

  it('accepts header aliases from other tools', () => {
    const csv = 'Posted Date,Payee,Value\n2026-03-01,Coffee,-4.50'
    const analysis = analyseCsvImport(csv, ledger(), options)
    expect(analysis.fileErrors).toEqual([])
    expect(analysis.validCount).toBe(1)
    expect(analysis.rows[0].transaction).toMatchObject({ type: 'expense', amount: 4_50 })
  })

  it('reads semicolon-delimited files and reports the delimiter', () => {
    const analysis = analyseCsvImport(
      'Date;Description;Amount\n2026-03-01;Coffee;-4,50',
      ledger(),
      options,
    )
    expect(analysis.delimiter).toBe(';')
    expect(analysis.validCount).toBe(1)
    expect(analysis.rows[0].transaction?.amount).toBe(4_50)
  })
})

describe('analyseCsvImport — row level', () => {
  const header = 'Date,Description,Amount,Type,Category,Account\n'

  it('classifies a good row as valid', () => {
    const analysis = analyseCsvImport(
      `${header}2026-03-01,Coffee,4.50,expense,Groceries,Everyday Checking`,
      ledger(),
      options,
    )
    expect(analysis.validCount).toBe(1)
    expect(analysis.rows[0].status).toBe('valid')
    expect(analysis.rows[0].messages).toEqual([])
  })

  it('reports an unreadable date and keeps the row for review', () => {
    const analysis = analyseCsvImport(
      `${header}last tuesday,Coffee,4.50,expense,Groceries,Everyday Checking`,
      ledger(),
      options,
    )
    expect(analysis.invalidCount).toBe(1)
    expect(analysis.rows[0].status).toBe('invalid')
    expect(analysis.rows[0].messages[0]).toMatch(/date/i)
    // Nothing is discarded: the row is still reported with its line number.
    expect(analysis.rows[0].line).toBe(2)
  })

  it('reports an unreadable amount', () => {
    const analysis = analyseCsvImport(
      `${header}2026-03-01,Coffee,abc,expense,Groceries,Everyday Checking`,
      ledger(),
      options,
    )
    expect(analysis.rows[0].messages[0]).toMatch(/amount/i)
  })

  it('reports a missing description', () => {
    const analysis = analyseCsvImport(
      `${header}2026-03-01,,4.50,expense,Groceries,Everyday Checking`,
      ledger(),
      options,
    )
    expect(analysis.rows[0].status).toBe('invalid')
    expect(analysis.rows[0].messages.join(' ')).toMatch(/description/i)
  })

  it('reports an unknown account when not creating missing entities', () => {
    const analysis = analyseCsvImport(
      `${header}2026-03-01,Coffee,4.50,expense,Groceries,Nowhere Bank`,
      ledger(),
      options,
    )
    expect(analysis.rows[0].messages[0]).toMatch(/Nowhere Bank/)
    expect(analysis.missingAccounts).toEqual([])
  })

  it('reports a category whose direction contradicts the row', () => {
    const analysis = analyseCsvImport(
      `${header}2026-03-01,Coffee,4.50,expense,Salary,Everyday Checking`,
      ledger(),
      options,
    )
    expect(analysis.rows[0].messages[0]).toMatch(/income category/i)
  })

  it('defaults a blank account to the chosen one and says so', () => {
    const analysis = analyseCsvImport(
      `${header}2026-03-01,Coffee,4.50,expense,Groceries,`,
      ledger(),
      options,
    )
    expect(analysis.rows[0].status).toBe('valid')
    expect(analysis.rows[0].warnings[0]).toMatch(/Everyday Checking/)
  })

  it('rejects a row with no account when no default was chosen', () => {
    const analysis = analyseCsvImport(
      `${header}2026-03-01,Coffee,4.50,expense,Groceries,`,
      ledger(),
      { ...options, defaultAccountId: undefined },
    )
    expect(analysis.rows[0].status).toBe('invalid')
    expect(analysis.rows[0].messages[0]).toMatch(/no default/i)
  })

  it('defaults a blank category to Other and warns', () => {
    const analysis = analyseCsvImport(
      `${header}2026-03-01,Coffee,4.50,expense,,Everyday Checking`,
      ledger(),
      options,
    )
    expect(analysis.rows[0].status).toBe('valid')
    expect(analysis.rows[0].transaction?.categoryId).toBe('c-other')
    expect(analysis.rows[0].warnings[0]).toMatch(/Other/)
  })

  it('skips genuinely blank lines without reporting them as errors', () => {
    const analysis = analyseCsvImport(
      `${header}2026-03-01,Coffee,4.50,expense,Groceries,Everyday Checking\n,,,,,\n`,
      ledger(),
      options,
    )
    expect(analysis.rows).toHaveLength(1)
    expect(analysis.invalidCount).toBe(0)
  })

  it('requires a destination for a transfer row', () => {
    const analysis = analyseCsvImport(
      `${header}2026-03-01,Sweep,500,transfer,,Everyday Checking`,
      ledger(),
      options,
    )
    expect(analysis.rows[0].status).toBe('invalid')
    expect(analysis.rows[0].messages[0]).toMatch(/destination/i)
  })

  it('accepts a transfer with a destination column', () => {
    const analysis = analyseCsvImport(
      'Date,Description,Amount,Type,Account,To Account\n2026-03-01,Sweep,500,transfer,Everyday Checking,High-Yield Savings',
      ledger(),
      options,
    )
    expect(analysis.rows[0].status).toBe('valid')
    expect(analysis.rows[0].transaction).toMatchObject({
      type: 'transfer',
      categoryId: null,
      accountId: 'a1',
      toAccountId: 'a2',
    })
  })

  it('rejects a transfer to the same account', () => {
    const analysis = analyseCsvImport(
      'Date,Description,Amount,Type,Account,To Account\n2026-03-01,Sweep,500,transfer,Everyday Checking,Everyday Checking',
      ledger(),
      options,
    )
    expect(analysis.rows[0].status).toBe('invalid')
  })
})

describe('analyseCsvImport — duplicates', () => {
  const header = 'Date,Description,Amount,Type,Category,Account\n'
  const row = '2026-03-15,Whole Foods,42.50,expense,Groceries,Everyday Checking'

  it('flags a row that already exists in the ledger', () => {
    const analysis = analyseCsvImport(`${header}${row}`, ledger([tx()]), options)
    expect(analysis.duplicateCount).toBe(1)
    expect(analysis.validCount).toBe(0)
    expect(analysis.rows[0].messages[0]).toMatch(/already in your ledger/i)
  })

  it('flags a row repeated inside the same file', () => {
    const analysis = analyseCsvImport(`${header}${row}\n${row}`, ledger(), options)
    expect(analysis.validCount).toBe(1)
    expect(analysis.duplicateCount).toBe(1)
    expect(analysis.rows[1].messages[0]).toMatch(/earlier row/i)
  })

  it('does not flag near-misses that differ by amount or day', () => {
    const analysis = analyseCsvImport(
      `${header}2026-03-15,Whole Foods,42.51,expense,Groceries,Everyday Checking`,
      ledger([tx()]),
      options,
    )
    expect(analysis.duplicateCount).toBe(0)
  })
})

/* ------------------------------------------------------------------ */
/* Commit                                                             */
/* ------------------------------------------------------------------ */

describe('applyCsvImport', () => {
  const header = 'Date,Description,Amount,Type,Category,Account\n'

  it('creates only the valid rows and leaves existing data untouched', () => {
    const existing = tx({ id: 'keep' })
    const csv = `${header}2026-04-01,Coffee,4.50,expense,Groceries,Everyday Checking\nbadrow,Broken,x,expense,Groceries,Everyday Checking`
    const analysis = analyseCsvImport(csv, ledger([existing]), options)
    const result = applyCsvImport(analysis, ledger([existing]), options, makeId, '2026-08-11T00:00:00.000Z')

    expect(result.imported).toBe(1)
    expect(result.skippedInvalid).toBe(1)
    expect(result.data.transactions).toHaveLength(2)
    expect(result.data.transactions.some((t) => t.id === 'keep')).toBe(true)
  })

  it('stamps created and updated timestamps on imported rows', () => {
    const analysis = analyseCsvImport(
      `${header}2026-04-01,Coffee,4.50,expense,Groceries,Everyday Checking`,
      ledger(),
      options,
    )
    const result = applyCsvImport(analysis, ledger(), options, makeId, '2026-08-11T09:00:00.000Z')
    expect(result.data.transactions[0]).toMatchObject({
      createdAt: '2026-08-11T09:00:00.000Z',
      updatedAt: '2026-08-11T09:00:00.000Z',
    })
  })

  it('skips duplicates by default and includes them on request', () => {
    const csv = `${header}2026-03-15,Whole Foods,42.50,expense,Groceries,Everyday Checking`
    const base = ledger([tx()])

    const skipped = applyCsvImport(
      analyseCsvImport(csv, base, options),
      base,
      options,
      makeId,
    )
    expect(skipped.imported).toBe(0)
    expect(skipped.skippedDuplicates).toBe(1)

    const withDuplicates: ImportOptions = { ...options, includeDuplicates: true }
    const kept = applyCsvImport(
      analyseCsvImport(csv, base, withDuplicates),
      base,
      withDuplicates,
      makeId,
    )
    expect(kept.imported).toBe(1)
    expect(kept.skippedDuplicates).toBe(0)
  })

  it('creates missing accounts and categories, wiring rows to their real ids', () => {
    const createMissing: ImportOptions = { ...options, createMissing: true }
    const csv = `${header}2026-04-01,Vet visit,80.00,expense,Pet care,Joint Account`
    const analysis = analyseCsvImport(csv, ledger(), createMissing)

    expect(analysis.missingAccounts.map((a) => a.name)).toEqual(['Joint Account'])
    expect(analysis.missingCategories.map((c) => c.name)).toEqual(['Pet care'])
    expect(analysis.rows[0].status).toBe('valid')

    const result = applyCsvImport(analysis, ledger(), createMissing, makeId)
    expect(result.createdAccounts).toBe(1)
    expect(result.createdCategories).toBe(1)

    const created = result.data.transactions[0]
    const account = result.data.accounts.find((a) => a.id === created.accountId)
    const category = result.data.categories.find((c) => c.id === created.categoryId)
    expect(account?.name).toBe('Joint Account')
    expect(category).toMatchObject({ name: 'Pet care', type: 'expense' })
    // No placeholder id may survive into the committed document.
    expect(created.accountId.startsWith('__pending__')).toBe(false)
    expect(created.categoryId?.startsWith('__pending__')).toBe(false)
  })

  it('creates a missing account only once when several rows reference it', () => {
    const createMissing: ImportOptions = { ...options, createMissing: true }
    const csv =
      `${header}2026-04-01,One,10.00,expense,Groceries,Joint Account\n` +
      `2026-04-02,Two,20.00,expense,Groceries,joint account`
    const analysis = analyseCsvImport(csv, ledger(), createMissing)
    expect(analysis.missingAccounts).toHaveLength(1)

    const result = applyCsvImport(analysis, ledger(), createMissing, makeId)
    expect(result.createdAccounts).toBe(1)
    const [first, second] = result.data.transactions
    expect(first.accountId).toBe(second.accountId)
  })

  it('resolves a created account on both sides of a transfer', () => {
    const createMissing: ImportOptions = { ...options, createMissing: true }
    const csv =
      'Date,Description,Amount,Type,Account,To Account\n' +
      '2026-04-01,Sweep,500,transfer,Everyday Checking,Vault'
    const analysis = analyseCsvImport(csv, ledger(), createMissing)
    const result = applyCsvImport(analysis, ledger(), createMissing, makeId)
    const created = result.data.transactions[0]
    expect(created.accountId).toBe('a1')
    expect(result.data.accounts.find((a) => a.id === created.toAccountId)?.name).toBe('Vault')
  })

  it('imports nothing when every row is invalid', () => {
    const csv = `${header}nope,Broken,x,expense,Groceries,Everyday Checking`
    const analysis = analyseCsvImport(csv, ledger(), options)
    const result = applyCsvImport(analysis, ledger(), options, makeId)
    expect(result.imported).toBe(0)
    expect(result.data.transactions).toEqual([])
  })
})
