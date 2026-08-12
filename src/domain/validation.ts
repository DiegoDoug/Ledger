/**
 * Transaction validation.
 *
 * One implementation serves the transaction form and the CSV importer, so a row
 * that the form would reject can never enter the ledger through an import.
 * Errors are keyed by field name so a form can attach each message to its input.
 */

import { isValidIso } from './dates'
import type { Account, Category, IsoDate, Transaction, TransactionType } from './types'

export interface TransactionDraft {
  description: string
  /** Positive magnitude in cents, or null when the input was unparseable. */
  amount: number | null
  type: TransactionType
  categoryId: string | null
  accountId: string
  toAccountId?: string
  date: IsoDate
  notes?: string
}

export type FieldName =
  | 'description'
  | 'amount'
  | 'categoryId'
  | 'accountId'
  | 'toAccountId'
  | 'date'

export type ValidationErrors = Partial<Record<FieldName, string>>

export interface ValidationContext {
  accounts: Account[]
  categories: Category[]
}

/** The largest amount Ledger accepts: 1 trillion in minor units. */
export const MAX_AMOUNT_CENTS = 100_000_000_000

export const MAX_DESCRIPTION_LENGTH = 120
export const MAX_NOTES_LENGTH = 500

export function validateTransaction(
  draft: TransactionDraft,
  context: ValidationContext,
): ValidationErrors {
  const errors: ValidationErrors = {}
  const { accounts, categories } = context

  const description = draft.description.trim()
  if (!description) {
    errors.description = 'Enter a description.'
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`
  }

  if (draft.amount === null) {
    errors.amount = 'Enter an amount.'
  } else if (!Number.isFinite(draft.amount) || !Number.isInteger(draft.amount)) {
    errors.amount = 'Enter a valid amount.'
  } else if (draft.amount <= 0) {
    errors.amount = 'Amount must be greater than zero.'
  } else if (draft.amount > MAX_AMOUNT_CENTS) {
    errors.amount = 'That amount is larger than Ledger supports.'
  }

  if (!draft.date) {
    errors.date = 'Choose a date.'
  } else if (!isValidIso(draft.date)) {
    errors.date = 'Enter a real date as YYYY-MM-DD.'
  }

  const account = accounts.find((a) => a.id === draft.accountId)
  if (!draft.accountId) {
    errors.accountId = draft.type === 'transfer' ? 'Choose the account to move from.' : 'Choose an account.'
  } else if (!account) {
    errors.accountId = 'That account no longer exists.'
  }

  if (draft.type === 'transfer') {
    if (!draft.toAccountId) {
      errors.toAccountId = 'Choose the account to move to.'
    } else if (!accounts.some((a) => a.id === draft.toAccountId)) {
      errors.toAccountId = 'That account no longer exists.'
    } else if (draft.toAccountId === draft.accountId) {
      errors.toAccountId = 'Choose two different accounts.'
    }
  } else {
    // Income and expenses must be categorised, and the category's direction has
    // to match the transaction's — otherwise a "Salary" expense would corrupt
    // both the income and the spending breakdown.
    if (!draft.categoryId) {
      errors.categoryId = 'Choose a category.'
    } else {
      const category = categories.find((c) => c.id === draft.categoryId)
      if (!category) errors.categoryId = 'That category no longer exists.'
      else if (category.type !== draft.type) {
        errors.categoryId = `Choose a${draft.type === 'income' ? 'n income' : ' spending'} category.`
      }
    }
  }

  // Over-long notes are truncated by `normaliseDraft` rather than rejected —
  // there is no useful action for the user to take on a note that is too long.

  return errors
}

export function isValid(errors: ValidationErrors): boolean {
  return Object.keys(errors).length === 0
}

/**
 * Normalise a validated draft into the fields a stored transaction needs.
 * Trims text, drops the category on transfers and the destination on
 * everything else, so no contradictory row is ever persisted.
 */
export function normaliseDraft(draft: TransactionDraft): Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> {
  const isTransferRow = draft.type === 'transfer'
  const notes = draft.notes?.trim()

  const normalised: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
    description: draft.description.trim().slice(0, MAX_DESCRIPTION_LENGTH),
    amount: draft.amount ?? 0,
    type: draft.type,
    categoryId: isTransferRow ? null : draft.categoryId,
    accountId: draft.accountId,
    date: draft.date,
  }

  if (isTransferRow && draft.toAccountId) normalised.toAccountId = draft.toAccountId
  if (notes) normalised.notes = notes.slice(0, MAX_NOTES_LENGTH)

  return normalised
}
