/**
 * Core domain model for Ledger.
 *
 * Conventions used throughout the app:
 * - All monetary values are integer **cents**. Floating point never touches a
 *   stored amount, so sums are exact and calculations are deterministic.
 * - All dates are **date-only ISO strings** (`YYYY-MM-DD`). They represent a
 *   calendar day with no timezone attached, which is what a ledger entry is.
 * - Amounts are always stored as a positive magnitude; direction is carried by
 *   `TransactionType`. This keeps sign handling in one place.
 */

/**
 * A transfer is a *movement* of money, not income or expense. It is a distinct
 * type rather than a pair of rows so it can never be double-counted, and so
 * every aggregation has exactly one place to exclude it.
 */
export type TransactionType = 'income' | 'expense' | 'transfer'

export type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'other'

export type Frequency = 'weekly' | 'monthly' | 'yearly'

/** `YYYY-MM-DD` */
export type IsoDate = string

/** `YYYY-MM` */
export type MonthKey = string

/** Categories describe spending and earning; transfers are uncategorised. */
export type CategoryType = 'income' | 'expense'

export interface Category {
  id: string
  name: string
  /** Categories are scoped to a direction so pickers stay short and relevant. */
  type: CategoryType
  /** Token name from the chart palette, e.g. `viz-1`. Never the only signal. */
  color: string
}

export interface Account {
  id: string
  name: string
  type: AccountType
  /** Balance before any recorded transaction, in cents. May be negative. */
  startingBalance: number
  /**
   * ISO 4217 code. Ledger does **not** convert between currencies, so this
   * records what the account is denominated in and always matches the primary
   * currency in settings; it exists so a future multi-currency version has a
   * place to put the value without a data migration.
   */
  currency?: string
  /** Free-form, e.g. "•••• 4417". */
  institution?: string
  notes?: string
  /** Archived accounts keep their history but leave the active totals. */
  archived?: boolean
}

export interface Transaction {
  id: string
  description: string
  /** Positive magnitude in cents. */
  amount: number
  type: TransactionType
  /**
   * `null` for transfers — moving money between your own accounts is not
   * spending, so it belongs to no category and never reaches a category total.
   */
  categoryId: string | null
  /** For a transfer, the account money leaves. Otherwise the account affected. */
  accountId: string
  /** Destination account. Required when `type` is `'transfer'`, unused otherwise. */
  toAccountId?: string
  date: IsoDate
  notes?: string
  /** Set when this row was generated from a RecurringTransaction. */
  recurringId?: string
  createdAt: string
  updatedAt: string
}

export interface Budget {
  id: string
  /** `null` = an overall monthly spending cap across every category. */
  categoryId: string | null
  /** Cap in cents for one month. */
  amount: number
  /** Budgets apply from this month onward until superseded. */
  startMonth: MonthKey
  archived?: boolean
}

export interface RecurringTransaction {
  id: string
  name: string
  amount: number
  type: TransactionType
  /** `null` for transfer schedules. */
  categoryId: string | null
  accountId: string
  /** Destination account for transfer schedules. */
  toAccountId?: string
  frequency: Frequency
  /** First occurrence; the schedule is derived from this anchor. */
  startDate: IsoDate
  /** Last date the schedule was materialised into real transactions. */
  lastPostedDate?: IsoDate
  active: boolean
  notes?: string
}

export interface Settings {
  currency: string
  locale: string
  theme: 'light' | 'dark' | 'system'
  /** Owner name shown in the sidebar profile area. */
  profileName: string
}

export interface LedgerData {
  version: number
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  recurring: RecurringTransaction[]
  settings: Settings
}

/* ------------------------------------------------------------------ */
/* Type guards and labels                                              */
/* ------------------------------------------------------------------ */

export const TRANSACTION_TYPES: TransactionType[] = ['expense', 'income', 'transfer']

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
}

export const ACCOUNT_TYPES: AccountType[] = [
  'checking',
  'savings',
  'credit',
  'cash',
  'investment',
  'other',
]

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit: 'Credit card',
  cash: 'Cash',
  investment: 'Investment',
  other: 'Other',
}

/**
 * Account types whose natural balance is money **owed**. A credit card with a
 * balance of -412.60 is a 412.60 liability, not a negative asset, and must
 * reduce net worth rather than inflate it.
 */
export function isLiabilityAccount(type: AccountType): boolean {
  return type === 'credit'
}

export function isTransfer(transaction: Pick<Transaction, 'type'>): boolean {
  return transaction.type === 'transfer'
}

/** Transfers are excluded from every income/expense aggregation. */
export function affectsCashFlow(transaction: Pick<Transaction, 'type'>): boolean {
  return transaction.type !== 'transfer'
}
