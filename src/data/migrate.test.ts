import { describe, expect, it } from 'vitest'
import { isLedgerData, migrateDocument } from './migrate'
import { DATA_VERSION } from '../domain/seed'
import type { LedgerData } from '../domain/types'

/** A minimal valid document, as version 1 would have written it. */
function v1Document(): LedgerData {
  return {
    version: 1,
    accounts: [{ id: 'a1', name: 'Checking', type: 'checking', startingBalance: 0 }],
    categories: [{ id: 'c1', name: 'Groceries', type: 'expense', color: 'viz-1' }],
    transactions: [
      {
        id: 't1',
        description: 'Shop',
        amount: 1000,
        type: 'expense',
        categoryId: 'c1',
        accountId: 'a1',
        date: '2026-03-01',
        createdAt: '2026-03-01T00:00:00.000Z',
      } as LedgerData['transactions'][number],
    ],
    budgets: [{ id: 'b1', categoryId: 'c1', amount: 50_000, startMonth: '2026-01' }],
    recurring: [],
    settings: { currency: 'EUR', locale: 'en-IE', theme: 'dark', profileName: 'Sam' },
  }
}

describe('isLedgerData', () => {
  it('accepts a well-formed document', () => {
    expect(isLedgerData(v1Document())).toBe(true)
  })

  it('rejects anything that is not a ledger', () => {
    expect(isLedgerData(null)).toBe(false)
    expect(isLedgerData(undefined)).toBe(false)
    expect(isLedgerData('a string')).toBe(false)
    expect(isLedgerData(42)).toBe(false)
    expect(isLedgerData([])).toBe(false)
    expect(isLedgerData({})).toBe(false)
  })

  it('rejects a document with a collection of the wrong shape', () => {
    expect(isLedgerData({ ...v1Document(), accounts: 'nope' })).toBe(false)
    expect(isLedgerData({ ...v1Document(), transactions: null })).toBe(false)
    expect(isLedgerData({ ...v1Document(), settings: null })).toBe(false)
  })
})

describe('migrateDocument', () => {
  it('stamps the current version', () => {
    expect(migrateDocument(v1Document()).version).toBe(DATA_VERSION)
  })

  it('backfills updatedAt from createdAt on version 1 rows', () => {
    const [t] = migrateDocument(v1Document()).transactions
    expect(t.updatedAt).toBe('2026-03-01T00:00:00.000Z')
  })

  it('gives accounts an explicit currency, defaulting to the primary one', () => {
    const [a] = migrateDocument(v1Document()).accounts
    expect(a.currency).toBe('EUR')
  })

  it('keeps an account currency that is already set', () => {
    const doc = v1Document()
    doc.accounts[0].currency = 'GBP'
    expect(migrateDocument(doc).accounts[0].currency).toBe('GBP')
  })

  it('fills in missing settings without discarding the ones present', () => {
    const doc = { ...v1Document(), settings: { theme: 'light' } } as unknown as LedgerData
    const settings = migrateDocument(doc).settings
    expect(settings.theme).toBe('light')
    expect(settings.currency).toBe('USD')
    expect(settings.locale).toBe('en-US')
    expect(settings.profileName).toBe('You')
  })

  it('normalises a transfer to carry no category, whatever was stored', () => {
    const doc = v1Document()
    doc.transactions[0] = {
      ...doc.transactions[0],
      type: 'transfer',
      categoryId: 'c1',
      toAccountId: 'a2',
    }
    const [t] = migrateDocument(doc).transactions
    expect(t.categoryId).toBeNull()
    expect(t.toAccountId).toBe('a2')
  })

  it('strips a destination account from a row that is not a transfer', () => {
    const doc = v1Document()
    doc.transactions[0] = { ...doc.transactions[0], type: 'expense', toAccountId: 'a2' }
    expect(migrateDocument(doc).transactions[0].toAccountId).toBeUndefined()
  })

  it('turns a missing categoryId into null rather than undefined', () => {
    const doc = v1Document()
    doc.transactions[0] = { ...doc.transactions[0], categoryId: undefined as unknown as string }
    expect(migrateDocument(doc).transactions[0].categoryId).toBeNull()
  })

  it('normalises transfer schedules the same way', () => {
    const doc = v1Document()
    doc.recurring = [
      {
        id: 'r1',
        name: 'Sweep',
        amount: 90_000,
        type: 'transfer',
        categoryId: 'c1',
        accountId: 'a1',
        toAccountId: 'a2',
        frequency: 'monthly',
        startDate: '2026-01-02',
        active: true,
      },
    ]
    expect(migrateDocument(doc).recurring[0].categoryId).toBeNull()
  })

  it('is idempotent — migrating twice changes nothing further', () => {
    const once = migrateDocument(v1Document())
    expect(migrateDocument(once)).toEqual(once)
  })

  it('does not mutate the document it was given', () => {
    const doc = v1Document()
    const snapshot = JSON.parse(JSON.stringify(doc))
    migrateDocument(doc)
    expect(doc).toEqual(snapshot)
  })
})
