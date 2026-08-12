/**
 * Demo data.
 *
 * Generated relative to *today* so the app always opens on ~8 months of
 * believable history — enough for the analytics trends to say something real.
 * Generation is deterministic (seeded PRNG) so reloading before the first save
 * cannot produce a different past.
 */

import { MONTH_NAMES, addMonthsToKey, daysInMonth, parseMonthKey, toIso } from './dates'
import { materialiseRecurring } from './recurring'
import { toCents } from './money'
import type {
  Account,
  Budget,
  Category,
  IsoDate,
  LedgerData,
  RecurringTransaction,
  Transaction,
  TransactionType,
} from './types'

const DEFAULT_CURRENCY = 'USD'
const DEFAULT_LOCALE = 'en-US'

export const DATA_VERSION = 2
const HISTORY_MONTHS = 8

/* Deterministic PRNG (mulberry32) — same seed, same demo history. */
function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const CATEGORIES: Category[] = [
  { id: 'cat-salary', name: 'Salary', type: 'income', color: 'viz-1' },
  { id: 'cat-freelance', name: 'Freelance', type: 'income', color: 'viz-2' },
  { id: 'cat-interest', name: 'Interest', type: 'income', color: 'viz-3' },
  { id: 'cat-refunds', name: 'Refunds', type: 'income', color: 'viz-4' },

  { id: 'cat-housing', name: 'Housing', type: 'expense', color: 'viz-1' },
  { id: 'cat-groceries', name: 'Groceries', type: 'expense', color: 'viz-2' },
  { id: 'cat-restaurants', name: 'Restaurants', type: 'expense', color: 'viz-3' },
  { id: 'cat-transport', name: 'Transportation', type: 'expense', color: 'viz-4' },
  { id: 'cat-subscriptions', name: 'Subscriptions', type: 'expense', color: 'viz-5' },
  { id: 'cat-utilities', name: 'Utilities', type: 'expense', color: 'viz-6' },
  { id: 'cat-health', name: 'Health & Fitness', type: 'expense', color: 'viz-7' },
  { id: 'cat-shopping', name: 'Shopping', type: 'expense', color: 'viz-8' },
  { id: 'cat-travel', name: 'Travel', type: 'expense', color: 'viz-9' },
  { id: 'cat-entertainment', name: 'Entertainment', type: 'expense', color: 'viz-10' },
  { id: 'cat-insurance', name: 'Insurance', type: 'expense', color: 'viz-11' },
  { id: 'cat-other', name: 'Other', type: 'expense', color: 'viz-neutral' },
]

export const ACCOUNTS: Account[] = [
  {
    id: 'acc-checking',
    name: 'Everyday Checking',
    type: 'checking',
    institution: 'Meridian Bank ···· 4417',
    startingBalance: toCents(3_240.18),
  },
  {
    id: 'acc-savings',
    name: 'High-Yield Savings',
    type: 'savings',
    institution: 'Meridian Bank ···· 8802',
    startingBalance: toCents(18_500),
  },
  {
    id: 'acc-credit',
    name: 'Sapphire Credit Card',
    type: 'credit',
    institution: 'Northline ···· 2291',
    startingBalance: toCents(-412.6),
  },
  {
    id: 'acc-cash',
    name: 'Cash Wallet',
    type: 'cash',
    startingBalance: toCents(180),
  },
  {
    id: 'acc-brokerage',
    name: 'Index Fund Brokerage',
    type: 'investment',
    institution: 'Vantage Invest ···· 6130',
    startingBalance: toCents(24_780.5),
    notes: 'Contributions only — market movement is not tracked.',
  },
]

interface RecurringSeed {
  id: string
  name: string
  amount: number
  type: TransactionType
  /** `null` for transfer schedules. */
  categoryId: string | null
  accountId: string
  /** Destination account for transfer schedules. */
  toAccountId?: string
  frequency: 'weekly' | 'monthly' | 'yearly'
  /** Day of month for monthly/yearly rules. */
  day: number
  /** Months back from the start of history to anchor a yearly rule. */
  monthOffset?: number
  notes?: string
  active?: boolean
}

const RECURRING_SEEDS: RecurringSeed[] = [
  {
    id: 'rec-salary',
    name: 'Salary — Northwind Design',
    amount: toCents(6_240),
    type: 'income',
    categoryId: 'cat-salary',
    accountId: 'acc-checking',
    frequency: 'monthly',
    day: 1,
    notes: 'Net of tax and benefits.',
  },
  {
    id: 'rec-interest',
    name: 'Savings interest',
    amount: toCents(61.4),
    type: 'income',
    categoryId: 'cat-interest',
    accountId: 'acc-savings',
    frequency: 'monthly',
    day: 28,
  },
  {
    id: 'rec-rent',
    name: 'Rent — Fillmore St',
    amount: toCents(2_150),
    type: 'expense',
    categoryId: 'cat-housing',
    accountId: 'acc-checking',
    frequency: 'monthly',
    day: 1,
  },
  {
    id: 'rec-renters',
    name: 'Renters insurance',
    amount: toCents(18.5),
    type: 'expense',
    categoryId: 'cat-insurance',
    accountId: 'acc-checking',
    frequency: 'monthly',
    day: 5,
  },
  {
    id: 'rec-power',
    name: 'Electric & gas',
    amount: toCents(96.4),
    type: 'expense',
    categoryId: 'cat-utilities',
    accountId: 'acc-checking',
    frequency: 'monthly',
    day: 12,
  },
  {
    id: 'rec-internet',
    name: 'Fiber internet',
    amount: toCents(59),
    type: 'expense',
    categoryId: 'cat-utilities',
    accountId: 'acc-checking',
    frequency: 'monthly',
    day: 8,
  },
  {
    id: 'rec-mobile',
    name: 'Mobile plan',
    amount: toCents(30),
    type: 'expense',
    categoryId: 'cat-utilities',
    accountId: 'acc-credit',
    frequency: 'monthly',
    day: 20,
  },
  {
    id: 'rec-gym',
    name: 'Gym membership',
    amount: toCents(89),
    type: 'expense',
    categoryId: 'cat-health',
    accountId: 'acc-credit',
    frequency: 'monthly',
    day: 2,
  },
  {
    id: 'rec-streaming',
    name: 'Streaming — Netflix',
    amount: toCents(15.49),
    type: 'expense',
    categoryId: 'cat-subscriptions',
    accountId: 'acc-credit',
    frequency: 'monthly',
    day: 14,
  },
  {
    id: 'rec-music',
    name: 'Music streaming',
    amount: toCents(11.99),
    type: 'expense',
    categoryId: 'cat-subscriptions',
    accountId: 'acc-credit',
    frequency: 'monthly',
    day: 6,
  },
  {
    id: 'rec-cloud',
    name: 'Cloud storage',
    amount: toCents(2.99),
    type: 'expense',
    categoryId: 'cat-subscriptions',
    accountId: 'acc-credit',
    frequency: 'monthly',
    day: 3,
  },
  {
    id: 'rec-news',
    name: 'News subscription',
    amount: toCents(17),
    type: 'expense',
    categoryId: 'cat-subscriptions',
    accountId: 'acc-credit',
    frequency: 'monthly',
    day: 22,
    active: false,
    notes: 'Paused after the intro rate ended.',
  },
  {
    id: 'rec-transit',
    name: 'Commuter transit pass',
    amount: toCents(38),
    type: 'expense',
    categoryId: 'cat-transport',
    accountId: 'acc-checking',
    frequency: 'weekly',
    day: 1,
  },
  {
    id: 'rec-prime',
    name: 'Annual membership',
    amount: toCents(139),
    type: 'expense',
    categoryId: 'cat-subscriptions',
    accountId: 'acc-credit',
    frequency: 'yearly',
    day: 18,
    monthOffset: 2,
  },

  /*
   * Transfers. None of these are income or expenses: the savings sweep and the
   * brokerage contribution move money between accounts, and the card payment
   * settles a liability. They change balances and net worth only.
   */
  {
    id: 'rec-sweep',
    name: 'Automatic savings sweep',
    amount: toCents(900),
    type: 'transfer',
    categoryId: null,
    accountId: 'acc-checking',
    toAccountId: 'acc-savings',
    frequency: 'monthly',
    day: 2,
    notes: 'Pay-yourself-first transfer the day after payday.',
  },
  {
    id: 'rec-invest',
    name: 'Brokerage contribution',
    amount: toCents(600),
    type: 'transfer',
    categoryId: null,
    accountId: 'acc-checking',
    toAccountId: 'acc-brokerage',
    frequency: 'monthly',
    day: 4,
  },
]

interface VariableSeed {
  categoryId: string
  accountId: string
  merchants: string[]
  min: number
  max: number
  /** Occurrences per month, inclusive range. */
  perMonth: [number, number]
  /** Probability the group appears at all in a given month. */
  chance?: number
  notes?: string
}

const VARIABLE_SEEDS: VariableSeed[] = [
  {
    categoryId: 'cat-groceries',
    accountId: 'acc-credit',
    merchants: [
      'Whole Foods Market',
      "Trader Joe's",
      'Safeway',
      'Costco Wholesale',
      'Bi-Rite Market',
    ],
    min: 38,
    max: 165,
    perMonth: [4, 6],
  },
  {
    categoryId: 'cat-restaurants',
    accountId: 'acc-credit',
    merchants: [
      'Blue Bottle Coffee',
      'Tartine Bakery',
      'Sushi Ren',
      'Thai Basil Kitchen',
      'Pizzeria Delfina',
      'Golden Gate Deli',
      'Ritual Coffee Roasters',
    ],
    min: 9,
    max: 96,
    perMonth: [5, 9],
  },
  {
    categoryId: 'cat-transport',
    accountId: 'acc-checking',
    merchants: ['Shell Station', 'Uber', 'Lyft', 'Parking — Sutter Garage', 'Chevron'],
    min: 11,
    max: 78,
    perMonth: [2, 5],
  },
  {
    categoryId: 'cat-shopping',
    accountId: 'acc-credit',
    merchants: ['Amazon', 'Uniqlo', 'IKEA', 'REI Co-op', 'Apple Store', 'Muji'],
    min: 22,
    max: 260,
    perMonth: [1, 4],
  },
  {
    categoryId: 'cat-entertainment',
    accountId: 'acc-credit',
    merchants: ['AMC Metreon', 'Ticketmaster', 'SFMOMA', 'Alamo Drafthouse'],
    min: 14,
    max: 120,
    perMonth: [1, 3],
  },
  {
    categoryId: 'cat-health',
    accountId: 'acc-checking',
    merchants: ['Walgreens Pharmacy', 'Bay Dental Care', 'Optometry Group'],
    min: 18,
    max: 210,
    perMonth: [1, 2],
    chance: 0.6,
  },
  {
    categoryId: 'cat-other',
    accountId: 'acc-cash',
    merchants: ['Farmers market', 'Barber', 'Laundry', 'Gift'],
    min: 12,
    max: 65,
    perMonth: [1, 3],
  },
  {
    categoryId: 'cat-travel',
    accountId: 'acc-credit',
    merchants: ['Delta Air Lines', 'Airbnb', 'Marriott Bonvoy', 'Amtrak'],
    min: 180,
    max: 940,
    perMonth: [1, 2],
    chance: 0.3,
    notes: 'Trip expense.',
  },
]

export function createSeedData(today: IsoDate = toIso(new Date())): LedgerData {
  const random = createRandom(20260311)
  const makeId = idFactory('seed')
  const now = new Date(`${today}T09:00:00`).toISOString()

  const currentMonth = today.slice(0, 7)
  const firstMonth = addMonthsToKey(currentMonth, -(HISTORY_MONTHS - 1))

  const recurring: RecurringTransaction[] = RECURRING_SEEDS.map((seed) => {
    const rule: RecurringTransaction = {
      id: seed.id,
      name: seed.name,
      amount: seed.amount,
      type: seed.type,
      categoryId: seed.categoryId,
      accountId: seed.accountId,
      frequency: seed.frequency,
      startDate: anchorDate(firstMonth, seed),
      active: seed.active ?? true,
      notes: seed.notes,
    }
    if (seed.toAccountId) rule.toAccountId = seed.toAccountId
    return rule
  })

  // Post every occurrence that already happened, exactly as the live app does.
  const posted = materialiseRecurring(recurring, today, makeId, now)

  const transactions: Transaction[] = [...posted.transactions]

  for (const month of monthsFrom(firstMonth, HISTORY_MONTHS)) {
    for (const group of VARIABLE_SEEDS) {
      if (group.chance !== undefined && random() > group.chance) continue
      const [minCount, maxCount] = group.perMonth
      const count = minCount + Math.floor(random() * (maxCount - minCount + 1))
      for (let i = 0; i < count; i += 1) {
        const date = randomDayIn(month, random)
        if (date > today) continue
        const amount = toCents(
          Math.round((group.min + random() * (group.max - group.min)) * 100) / 100,
        )
        transactions.push({
          id: makeId(),
          description: group.merchants[Math.floor(random() * group.merchants.length)],
          amount,
          type: 'expense',
          categoryId: group.categoryId,
          accountId: group.accountId,
          date,
          notes: group.notes,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    // Occasional freelance income and the odd refund, for a realistic income mix.
    if (random() > 0.45) {
      const date = randomDayIn(month, random)
      if (date <= today) {
        transactions.push({
          id: makeId(),
          description: 'Freelance — brand identity',
          amount: toCents(Math.round((650 + random() * 2200) * 100) / 100),
          type: 'income',
          categoryId: 'cat-freelance',
          accountId: 'acc-checking',
          date,
          notes: 'Invoice paid on receipt.',
          createdAt: now,
          updatedAt: now,
        })
      }
    }
    if (random() > 0.7) {
      const date = randomDayIn(month, random)
      if (date <= today) {
        transactions.push({
          id: makeId(),
          description: 'Refund — returned order',
          amount: toCents(Math.round((25 + random() * 180) * 100) / 100),
          type: 'income',
          categoryId: 'cat-refunds',
          accountId: 'acc-credit',
          date,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    // An occasional one-off top-up out of savings, so transfers appear both on a
    // schedule and as ad-hoc movements.
    if (random() > 0.72) {
      const date = randomDayIn(month, random)
      if (date <= today) {
        transactions.push({
          id: makeId(),
          description: 'Transfer to checking',
          amount: toCents(Math.round((200 + random() * 450) * 100) / 100),
          type: 'transfer',
          categoryId: null,
          accountId: 'acc-savings',
          toAccountId: 'acc-checking',
          date,
          notes: 'Covering a larger bill.',
          createdAt: now,
          updatedAt: now,
        })
      }
    }
    /*
     * Cash has to come from somewhere, and an ATM withdrawal is a transfer, not
     * spending. The amount is drawn from what this month's cash spending
     * actually was, rounded up to a note the machine would dispense, plus a
     * small float — which is what a person does, and which keeps the wallet
     * from either drifting upwards forever or going negative. A physical wallet
     * cannot hold a negative balance.
     */
    const cashSpentThisMonth = transactions
      .filter((t) => t.accountId === 'acc-cash' && t.type === 'expense' && t.date.startsWith(month))
      .reduce((sum, t) => sum + t.amount, 0)

    const withdrawalDate = `${month}-01`
    if (withdrawalDate <= today && cashSpentThisMonth > 0) {
      const float = toCents(20 + Math.floor(random() * 3) * 20)
      const amount = Math.ceil((cashSpentThisMonth + float) / toCents(20)) * toCents(20)
      transactions.push({
        id: makeId(),
        description: 'ATM withdrawal',
        amount,
        type: 'transfer',
        categoryId: null,
        accountId: 'acc-checking',
        toAccountId: 'acc-cash',
        date: withdrawalDate,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  /*
   * Settle the credit card. A real cardholder pays last month's statement, so
   * the payment is derived from what the card actually did rather than being a
   * fixed amount — which is what keeps the balance hovering around one month of
   * spending instead of growing without bound. The current month's activity is
   * still outstanding, exactly as a real card would be.
   */
  const cardOpeningDebt = Math.max(
    0,
    -(ACCOUNTS.find((a) => a.id === 'acc-credit')?.startingBalance ?? 0),
  )
  const historyMonths = monthsFrom(firstMonth, HISTORY_MONTHS)

  for (let i = 1; i < historyMonths.length; i += 1) {
    const statementMonth = historyMonths[i - 1]
    let due = i === 1 ? cardOpeningDebt : 0

    for (const t of transactions) {
      if (t.accountId !== 'acc-credit') continue
      if (t.date.slice(0, 7) !== statementMonth) continue
      if (t.type === 'expense') due += t.amount
      else if (t.type === 'income') due -= t.amount // a refund reduces what is owed
    }
    if (due <= 0) continue

    const { year, monthIndex } = parseMonthKey(historyMonths[i])
    const day = Math.min(24, daysInMonth(year, monthIndex))
    const date = `${historyMonths[i]}-${String(day).padStart(2, '0')}`
    if (date > today) continue

    transactions.push({
      id: makeId(),
      description: 'Credit card payment',
      amount: due,
      type: 'transfer',
      categoryId: null,
      accountId: 'acc-checking',
      toAccountId: 'acc-credit',
      date,
      notes: `Settles the ${formatStatementMonth(statementMonth)} statement.`,
      createdAt: now,
      updatedAt: now,
    })
  }

  transactions.sort((a, b) => b.date.localeCompare(a.date))

  const budgets: Budget[] = [
    { id: 'bud-overall', categoryId: null, amount: toCents(4_200), startMonth: firstMonth },
    { id: 'bud-groceries', categoryId: 'cat-groceries', amount: toCents(650), startMonth: firstMonth },
    {
      id: 'bud-restaurants',
      categoryId: 'cat-restaurants',
      amount: toCents(400),
      startMonth: firstMonth,
    },
    { id: 'bud-shopping', categoryId: 'cat-shopping', amount: toCents(300), startMonth: firstMonth },
    { id: 'bud-transport', categoryId: 'cat-transport', amount: toCents(260), startMonth: firstMonth },
    {
      id: 'bud-entertainment',
      categoryId: 'cat-entertainment',
      amount: toCents(150),
      startMonth: firstMonth,
    },
    { id: 'bud-travel', categoryId: 'cat-travel', amount: toCents(500), startMonth: firstMonth },
  ]

  return {
    version: DATA_VERSION,
    accounts: ACCOUNTS.map((a) => ({ ...a, currency: DEFAULT_CURRENCY })),
    categories: CATEGORIES.map((c) => ({ ...c })),
    transactions,
    budgets,
    recurring: posted.rules,
    settings: {
      currency: DEFAULT_CURRENCY,
      locale: DEFAULT_LOCALE,
      theme: 'system',
      profileName: 'Alex Rivera',
    },
  }
}

/** An empty but usable ledger: accounts and categories, no history. */
export function createEmptyData(): LedgerData {
  return {
    version: DATA_VERSION,
    accounts: [
      {
        id: 'acc-checking',
        name: 'Everyday Checking',
        type: 'checking',
        startingBalance: 0,
        currency: DEFAULT_CURRENCY,
      },
    ],
    categories: CATEGORIES.map((c) => ({ ...c })),
    transactions: [],
    budgets: [],
    recurring: [],
    settings: {
      currency: DEFAULT_CURRENCY,
      locale: DEFAULT_LOCALE,
      theme: 'system',
      profileName: 'You',
    },
  }
}

function anchorDate(firstMonth: string, seed: RecurringSeed): IsoDate {
  const month = seed.monthOffset ? addMonthsToKey(firstMonth, seed.monthOffset) : firstMonth
  const { year, monthIndex } = parseMonthKey(month)
  const day = Math.min(seed.day, daysInMonth(year, monthIndex))
  if (seed.frequency === 'weekly') {
    // Anchor weekly rules on the first Monday of the window.
    const start = new Date(year, monthIndex, 1, 12)
    const offset = (8 - start.getDay()) % 7
    return toIso(new Date(year, monthIndex, 1 + offset, 12))
  }
  return `${month}-${String(day).padStart(2, '0')}`
}

/** "March 2026" for a `YYYY-MM` key, without pulling in the formatting layer. */
function formatStatementMonth(month: string): string {
  const { year, monthIndex } = parseMonthKey(month)
  return `${MONTH_NAMES[monthIndex] ?? month} ${year}`
}

function monthsFrom(firstMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonthsToKey(firstMonth, i))
}

function randomDayIn(month: string, random: () => number): IsoDate {
  const { year, monthIndex } = parseMonthKey(month)
  const day = 1 + Math.floor(random() * daysInMonth(year, monthIndex))
  return `${month}-${String(day).padStart(2, '0')}`
}

/** Stable, collision-free ids without pulling in a uuid dependency. */
export function idFactory(prefix: string): () => string {
  let counter = 0
  return () => {
    counter += 1
    return `${prefix}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
}
