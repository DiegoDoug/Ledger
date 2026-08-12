/**
 * The single source of truth for ledger data.
 *
 * A reducer owns the whole document, every mutation pushes the previous document
 * onto an undo stack, and a debounced effect mirrors the current document to the
 * repository. Components never mutate data directly — they call the actions
 * exposed by `useLedger`.
 *
 * The repository is asynchronous (IndexedDB), so loading is a state machine
 * rather than a synchronous read, and saves are coalesced so a burst of edits
 * writes once.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { openRepository } from './repositories'
import { migrateDocument } from './migrate'
import type { LedgerRepository, RepositoryKind } from './repository'
import { materialiseRecurring } from '../domain/recurring'
import { createEmptyData, createSeedData, idFactory } from '../domain/seed'
import { todayIso } from '../domain/dates'
import { applyCsvImport } from '../domain/portability'
import type { ImportAnalysis, ImportOptions, ImportResult } from '../domain/portability'
import type {
  Account,
  Budget,
  Category,
  LedgerData,
  RecurringTransaction,
  Settings,
  Transaction,
} from '../domain/types'

const newId = idFactory('lg')

export type Status = 'loading' | 'ready' | 'error'

interface State {
  status: Status
  data: LedgerData
  /** Non-fatal problem worth telling the user about (e.g. storage full). */
  error: string | null
  /** True when data lives only in memory for this session. */
  ephemeral: boolean
  /**
   * True when the stored document could not be read. Nothing is written while
   * this is set, so the unreadable document survives until the user decides to
   * discard it — see `discardCorruptData`.
   */
  corrupt: boolean
  storage: RepositoryKind
  past: LedgerData[]
  /** Bumped by every mutation; used to trigger the save effect. */
  revision: number
  saving: boolean
}

type Action =
  | {
      type: 'loaded'
      data: LedgerData
      ephemeral: boolean
      storage: RepositoryKind
      error: string | null
      corrupt?: boolean
      /** Set when the loaded document differs from what is stored. */
      dirty?: boolean
    }
  | { type: 'recovered'; data: LedgerData }
  | { type: 'failed'; message: string }
  | { type: 'commit'; data: LedgerData; undoable?: boolean }
  | { type: 'undo' }
  | { type: 'setError'; message: string | null }
  | { type: 'saving'; value: boolean }

const UNDO_LIMIT = 25

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        status: 'ready',
        data: action.data,
        ephemeral: action.ephemeral,
        corrupt: action.corrupt ?? false,
        storage: action.storage,
        error: action.error,
        past: [],
        // A non-dirty load must not trigger a write straight back to storage.
        revision: action.dirty ? state.revision + 1 : 0,
      }
    case 'recovered':
      // Storage is usable again: resume saving, starting from a clean document.
      return {
        ...state,
        data: action.data,
        ephemeral: false,
        corrupt: false,
        error: null,
        past: [],
        revision: state.revision + 1,
      }
    case 'failed':
      return { ...state, status: 'error', error: action.message }
    case 'commit':
      return {
        ...state,
        data: action.data,
        past:
          action.undoable === false
            ? state.past
            : [state.data, ...state.past].slice(0, UNDO_LIMIT),
        revision: state.revision + 1,
      }
    case 'undo': {
      const [previous, ...rest] = state.past
      if (!previous) return state
      return { ...state, data: previous, past: rest, revision: state.revision + 1 }
    }
    case 'setError':
      return { ...state, error: action.message }
    case 'saving':
      return { ...state, saving: action.value }
    default:
      return state
  }
}

export interface CategoryDeletion {
  /** Move referencing transactions here, or `null` to leave them uncategorised. */
  replacementId: string | null
}

export interface LedgerActions {
  addTransaction: (input: NewTransaction) => Transaction
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, 'id' | 'createdAt'>>) => void
  deleteTransaction: (id: string) => void
  deleteTransactions: (ids: string[]) => void

  addAccount: (input: Omit<Account, 'id'>) => Account
  updateAccount: (id: string, patch: Partial<Omit<Account, 'id'>>) => void
  deleteAccount: (id: string) => void

  addCategory: (input: Omit<Category, 'id'>) => Category
  updateCategory: (id: string, patch: Partial<Omit<Category, 'id' | 'type'>>) => void
  /** Reassigns every reference before removing the category. */
  deleteCategory: (id: string, options?: CategoryDeletion) => void

  addBudget: (input: Omit<Budget, 'id'>) => Budget
  updateBudget: (id: string, patch: Partial<Omit<Budget, 'id'>>) => void
  deleteBudget: (id: string) => void

  addRecurring: (input: Omit<RecurringTransaction, 'id'>) => RecurringTransaction
  updateRecurring: (id: string, patch: Partial<Omit<RecurringTransaction, 'id'>>) => void
  deleteRecurring: (id: string) => void
  toggleRecurring: (id: string) => void

  updateSettings: (patch: Partial<Settings>) => void

  undo: () => void
  canUndo: boolean

  /** Replace the whole document — used to restore a JSON backup. */
  replaceAll: (data: LedgerData) => void
  /**
   * Throw away an unreadable stored document and start saving again. Only
   * reachable when `corrupt` is set, and always behind a confirmation.
   */
  discardCorruptData: (mode: 'empty' | 'demo') => void
  runImport: (analysis: ImportAnalysis, options: ImportOptions) => ImportResult
  resetToDemo: () => void
  clearAll: () => void
  dismissError: () => void
}

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>

interface LedgerContextValue extends State {
  actions: LedgerActions
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

const INITIAL: State = {
  status: 'loading',
  data: createEmptyData(),
  error: null,
  ephemeral: false,
  corrupt: false,
  storage: 'indexeddb',
  past: [],
  revision: 0,
  saving: false,
}

const SAVE_DEBOUNCE_MS = 250

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const repositoryRef = useRef<LedgerRepository | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    // StrictMode mounts effects twice in development; opening the database and
    // seeding must happen exactly once.
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false

    void (async () => {
      let opened
      try {
        opened = await openRepository()
      } catch (error) {
        if (cancelled) return
        dispatch({
          type: 'loaded',
          data: createSeedData(todayIso()),
          ephemeral: true,
          storage: 'memory',
          error: `${
            error instanceof Error ? error.message : 'Storage could not be opened.'
          } Ledger is running with demo data for this session only.`,
        })
        return
      }
      if (cancelled) return

      repositoryRef.current = opened.repository
      const { initial, repository, degraded, migratedFrom } = opened
      const today = todayIso()

      if (initial.status === 'ok') {
        // Catch the ledger up on anything the schedule owes since the last visit.
        const posted = materialiseRecurring(initial.data.recurring, today, newId)
        const dirty = posted.transactions.length > 0 || migratedFrom !== undefined
        const data: LedgerData = posted.transactions.length
          ? {
              ...initial.data,
              transactions: [...posted.transactions, ...initial.data.transactions],
              recurring: posted.rules,
            }
          : initial.data
        dispatch({
          type: 'loaded',
          data,
          ephemeral: !repository.durable,
          storage: repository.kind,
          error: degraded ?? null,
          dirty,
        })
        return
      }

      if (initial.status === 'empty') {
        dispatch({
          type: 'loaded',
          data: createSeedData(today),
          ephemeral: !repository.durable,
          storage: repository.kind,
          error: degraded ?? null,
          // Seed data must be written so a reload shows the same history.
          dirty: repository.durable,
        })
        return
      }

      // Storage is unusable or its contents are unreadable: run in memory rather
      // than showing a dead app, and say so plainly instead of pretending the
      // data is safe. Nothing is written, so a corrupt document stays intact.
      dispatch({
        type: 'loaded',
        data: createSeedData(today),
        ephemeral: true,
        corrupt: initial.corrupt ?? false,
        storage: repository.kind,
        error: initial.corrupt
          ? `${initial.message} Nothing will be saved until you deal with it, so the unreadable data is still there — see Settings.`
          : `${initial.message} Ledger is running with demo data for this session only.`,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Mirror to the repository whenever the document changes, coalescing bursts.
  useEffect(() => {
    if (state.status !== 'ready' || state.ephemeral || state.revision === 0) return
    const repository = repositoryRef.current
    if (!repository) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      dispatch({ type: 'saving', value: true })
      void repository.save(state.data).then((result) => {
        if (cancelled) return
        dispatch({ type: 'saving', value: false })
        if (!result.ok) dispatch({ type: 'setError', message: result.message })
      })
    }, SAVE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [state.data, state.status, state.ephemeral, state.revision])

  // Keep a ref so actions stay referentially stable across renders.
  const stateRef = useRef(state)
  stateRef.current = state

  const commit = useCallback(
    (updater: (data: LedgerData) => LedgerData, undoable = true) => {
      dispatch({ type: 'commit', data: updater(stateRef.current.data), undoable })
    },
    [],
  )

  const actions = useMemo<LedgerActions>(() => {
    // `NoInfer` keeps T bound to the list element type — the patch is a subset
    // and must not participate in inference.
    const patchList = <T extends { id: string }>(
      list: T[],
      id: string,
      patch: Partial<NoInfer<T>>,
    ): T[] => list.map((item) => (item.id === id ? { ...item, ...patch, id } : item))

    const now = () => new Date().toISOString()

    return {
      addTransaction(input) {
        const stamp = now()
        const transaction: Transaction = {
          ...input,
          id: newId(),
          createdAt: stamp,
          updatedAt: stamp,
        }
        commit((d) => ({ ...d, transactions: [transaction, ...d.transactions] }))
        return transaction
      },
      updateTransaction(id, patch) {
        commit((d) => ({
          ...d,
          transactions: d.transactions.map((t) => {
            if (t.id !== id) return t
            const next: Transaction = { ...t, ...patch, id, updatedAt: now() }
            // A row that stops being a transfer must not keep a destination.
            if (next.type !== 'transfer') delete next.toAccountId
            if (next.type === 'transfer') next.categoryId = null
            return next
          }),
        }))
      },
      deleteTransaction(id) {
        commit((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }))
      },
      deleteTransactions(ids) {
        const set = new Set(ids)
        commit((d) => ({ ...d, transactions: d.transactions.filter((t) => !set.has(t.id)) }))
      },

      addAccount(input) {
        const account: Account = { ...input, id: newId() }
        commit((d) => ({ ...d, accounts: [...d.accounts, account] }))
        return account
      },
      updateAccount(id, patch) {
        commit((d) => ({ ...d, accounts: patchList(d.accounts, id, patch) }))
      },
      deleteAccount(id) {
        // Removing an account removes its history too — including transfers that
        // merely pointed at it, which would otherwise become half a movement.
        commit((d) => ({
          ...d,
          accounts: d.accounts.filter((a) => a.id !== id),
          transactions: d.transactions.filter(
            (t) => t.accountId !== id && t.toAccountId !== id,
          ),
          recurring: d.recurring.filter((r) => r.accountId !== id && r.toAccountId !== id),
        }))
      },

      addCategory(input) {
        const category: Category = { ...input, id: newId() }
        commit((d) => ({ ...d, categories: [...d.categories, category] }))
        return category
      },
      updateCategory(id, patch) {
        commit((d) => ({ ...d, categories: patchList(d.categories, id, patch) }))
      },
      deleteCategory(id, options) {
        const replacementId = options?.replacementId ?? null
        commit((d) => ({
          ...d,
          categories: d.categories.filter((c) => c.id !== id),
          // Reassign rather than orphan, so no total silently changes shape.
          transactions: d.transactions.map((t) =>
            t.categoryId === id ? { ...t, categoryId: replacementId, updatedAt: now() } : t,
          ),
          recurring: d.recurring.map((r) =>
            r.categoryId === id ? { ...r, categoryId: replacementId } : r,
          ),
          // A budget for a category that no longer exists has nothing to cap.
          budgets: replacementId
            ? d.budgets.map((b) => (b.categoryId === id ? { ...b, categoryId: replacementId } : b))
            : d.budgets.filter((b) => b.categoryId !== id),
        }))
      },

      addBudget(input) {
        const budget: Budget = { ...input, id: newId() }
        commit((d) => ({ ...d, budgets: [...d.budgets, budget] }))
        return budget
      },
      updateBudget(id, patch) {
        commit((d) => ({ ...d, budgets: patchList(d.budgets, id, patch) }))
      },
      deleteBudget(id) {
        commit((d) => ({ ...d, budgets: d.budgets.filter((b) => b.id !== id) }))
      },

      addRecurring(input) {
        const rule: RecurringTransaction = { ...input, id: newId() }
        // Post anything the new rule already owes, so it is never silently late.
        commit((d) => {
          const posted = materialiseRecurring([rule], todayIso(), newId)
          return {
            ...d,
            recurring: [...d.recurring, ...posted.rules],
            transactions: [...posted.transactions, ...d.transactions],
          }
        })
        return rule
      },
      updateRecurring(id, patch) {
        commit((d) => ({ ...d, recurring: patchList(d.recurring, id, patch) }))
      },
      deleteRecurring(id) {
        // Posted history stays; only the rule and its future stop.
        commit((d) => ({ ...d, recurring: d.recurring.filter((r) => r.id !== id) }))
      },
      toggleRecurring(id) {
        commit((d) => ({
          ...d,
          recurring: d.recurring.map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
        }))
      },

      updateSettings(patch) {
        commit((d) => ({ ...d, settings: { ...d.settings, ...patch } }), false)
      },

      undo() {
        dispatch({ type: 'undo' })
      },
      // Replaced with the live value below; actions stay referentially stable.
      canUndo: false,

      replaceAll(data) {
        // Restored files come from outside the app, so they go through the same
        // migration path as anything read from storage.
        const migrated = migrateDocument(data)

        // Restoring a backup is also the way out of an unreadable stored
        // document: the restored file replaces it and saving resumes.
        if (stateRef.current.corrupt) {
          void (async () => {
            await repositoryRef.current?.clear()
            dispatch({ type: 'recovered', data: migrated })
          })()
          return
        }
        commit(() => migrated)
      },
      runImport(analysis, options) {
        const result = applyCsvImport(analysis, stateRef.current.data, options, newId)
        commit(() => result.data)
        return result
      },
      discardCorruptData(mode) {
        const fresh = mode === 'demo' ? createSeedData(todayIso()) : createEmptyData()
        void (async () => {
          // Clear first, so a failure here leaves the app honestly still broken
          // rather than reporting success it cannot deliver.
          await repositoryRef.current?.clear()
          dispatch({ type: 'recovered', data: fresh })
        })()
      },
      resetToDemo() {
        commit(() => createSeedData(todayIso()))
      },
      clearAll() {
        commit(() => createEmptyData())
      },
      dismissError() {
        dispatch({ type: 'setError', message: null })
      },
    }
  }, [commit])

  const value = useMemo<LedgerContextValue>(
    () => ({ ...state, actions: { ...actions, canUndo: state.past.length > 0 } }),
    [state, actions],
  )

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger(): LedgerContextValue {
  const context = useContext(LedgerContext)
  if (!context) throw new Error('useLedger must be used inside <LedgerProvider>')
  return context
}

/** Convenience selectors used across pages. */
export function useLedgerData(): LedgerData {
  return useLedger().data
}
