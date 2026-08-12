import { describe, expect, it } from 'vitest'
import {
  MAX_AMOUNT_CENTS,
  MAX_DESCRIPTION_LENGTH,
  MAX_NOTES_LENGTH,
  isValid,
  normaliseDraft,
  validateTransaction,
} from './validation'
import type { TransactionDraft } from './validation'
import type { Account, Category } from './types'

const accounts: Account[] = [
  { id: 'a1', name: 'Checking', type: 'checking', startingBalance: 0 },
  { id: 'a2', name: 'Savings', type: 'savings', startingBalance: 0 },
]

const categories: Category[] = [
  { id: 'c-food', name: 'Groceries', type: 'expense', color: 'viz-1' },
  { id: 'c-pay', name: 'Salary', type: 'income', color: 'viz-2' },
]

const context = { accounts, categories }

function draft(overrides: Partial<TransactionDraft> = {}): TransactionDraft {
  return {
    description: 'Whole Foods',
    amount: 42_50,
    type: 'expense',
    categoryId: 'c-food',
    accountId: 'a1',
    date: '2026-03-15',
    ...overrides,
  }
}

describe('required fields', () => {
  it('accepts a complete expense', () => {
    expect(validateTransaction(draft(), context)).toEqual({})
    expect(isValid(validateTransaction(draft(), context))).toBe(true)
  })

  it('rejects a missing or whitespace-only description', () => {
    expect(validateTransaction(draft({ description: '' }), context).description).toBeDefined()
    expect(validateTransaction(draft({ description: '   ' }), context).description).toBeDefined()
  })

  it('rejects a description beyond the stored length', () => {
    const long = 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1)
    expect(validateTransaction(draft({ description: long }), context).description).toBeDefined()
    expect(
      validateTransaction(draft({ description: 'x'.repeat(MAX_DESCRIPTION_LENGTH) }), context)
        .description,
    ).toBeUndefined()
  })

  it('rejects a missing account and one that no longer exists', () => {
    expect(validateTransaction(draft({ accountId: '' }), context).accountId).toBeDefined()
    expect(validateTransaction(draft({ accountId: 'gone' }), context).accountId).toBeDefined()
  })
})

describe('amounts', () => {
  it('rejects an unparseable, zero or negative amount', () => {
    expect(validateTransaction(draft({ amount: null }), context).amount).toBeDefined()
    expect(validateTransaction(draft({ amount: 0 }), context).amount).toBeDefined()
    expect(validateTransaction(draft({ amount: -100 }), context).amount).toBeDefined()
  })

  it('rejects a non-integer amount, since cents are the smallest unit', () => {
    expect(validateTransaction(draft({ amount: 10.5 }), context).amount).toBeDefined()
  })

  it('rejects NaN and Infinity rather than storing them', () => {
    expect(validateTransaction(draft({ amount: Number.NaN }), context).amount).toBeDefined()
    expect(validateTransaction(draft({ amount: Number.POSITIVE_INFINITY }), context).amount).toBeDefined()
  })

  it('accepts the largest supported amount and rejects one above it', () => {
    expect(validateTransaction(draft({ amount: MAX_AMOUNT_CENTS }), context).amount).toBeUndefined()
    expect(validateTransaction(draft({ amount: MAX_AMOUNT_CENTS + 1 }), context).amount).toBeDefined()
  })
})

describe('dates', () => {
  it('rejects an empty, malformed or impossible date', () => {
    expect(validateTransaction(draft({ date: '' }), context).date).toBeDefined()
    expect(validateTransaction(draft({ date: '15/03/2026' }), context).date).toBeDefined()
    expect(validateTransaction(draft({ date: '2026-02-30' }), context).date).toBeDefined()
    expect(validateTransaction(draft({ date: '2026-13-01' }), context).date).toBeDefined()
  })

  it('accepts a leap day in a leap year', () => {
    expect(validateTransaction(draft({ date: '2028-02-29' }), context).date).toBeUndefined()
    expect(validateTransaction(draft({ date: '2026-02-29' }), context).date).toBeDefined()
  })
})

describe('categories', () => {
  it('requires a category on income and expenses', () => {
    expect(validateTransaction(draft({ categoryId: null }), context).categoryId).toBeDefined()
  })

  it('rejects a category that no longer exists', () => {
    expect(validateTransaction(draft({ categoryId: 'gone' }), context).categoryId).toBeDefined()
  })

  it('rejects a category whose direction contradicts the transaction', () => {
    // "Salary" is an income category, so it cannot categorise an expense.
    expect(validateTransaction(draft({ categoryId: 'c-pay' }), context).categoryId).toBeDefined()
    expect(
      validateTransaction(draft({ type: 'income', categoryId: 'c-food' }), context).categoryId,
    ).toBeDefined()
    expect(
      validateTransaction(draft({ type: 'income', categoryId: 'c-pay' }), context).categoryId,
    ).toBeUndefined()
  })
})

describe('transfers', () => {
  const move = (overrides: Partial<TransactionDraft> = {}) =>
    draft({ type: 'transfer', categoryId: null, accountId: 'a1', toAccountId: 'a2', ...overrides })

  it('accepts a transfer between two different accounts with no category', () => {
    expect(validateTransaction(move(), context)).toEqual({})
  })

  it('requires a destination account', () => {
    expect(validateTransaction(move({ toAccountId: undefined }), context).toAccountId).toBeDefined()
  })

  it('rejects a transfer to the same account', () => {
    expect(validateTransaction(move({ toAccountId: 'a1' }), context).toAccountId).toBeDefined()
  })

  it('rejects a destination that no longer exists', () => {
    expect(validateTransaction(move({ toAccountId: 'gone' }), context).toAccountId).toBeDefined()
  })

  it('does not demand a category', () => {
    expect(validateTransaction(move({ categoryId: null }), context).categoryId).toBeUndefined()
  })
})

describe('normaliseDraft', () => {
  it('trims text and drops empty notes', () => {
    const result = normaliseDraft(draft({ description: '  Coffee  ', notes: '   ' }))
    expect(result.description).toBe('Coffee')
    expect(result.notes).toBeUndefined()
  })

  it('strips the category from a transfer and the destination from everything else', () => {
    const asTransfer = normaliseDraft(
      draft({ type: 'transfer', categoryId: 'c-food', toAccountId: 'a2' }),
    )
    expect(asTransfer.categoryId).toBeNull()
    expect(asTransfer.toAccountId).toBe('a2')

    const asExpense = normaliseDraft(draft({ type: 'expense', toAccountId: 'a2' }))
    expect(asExpense.toAccountId).toBeUndefined()
    expect(asExpense.categoryId).toBe('c-food')
  })

  it('truncates over-long text rather than rejecting it', () => {
    const result = normaliseDraft(
      draft({
        description: 'y'.repeat(MAX_DESCRIPTION_LENGTH + 50),
        notes: 'n'.repeat(MAX_NOTES_LENGTH + 50),
      }),
    )
    expect(result.description).toHaveLength(MAX_DESCRIPTION_LENGTH)
    expect(result.notes).toHaveLength(MAX_NOTES_LENGTH)
  })

  it('coerces a null amount to zero, which validation has already rejected', () => {
    expect(normaliseDraft(draft({ amount: null })).amount).toBe(0)
  })
})
