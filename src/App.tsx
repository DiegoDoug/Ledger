import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { GlobalSearch } from './components/GlobalSearch'
import { TransactionDialog } from './components/TransactionDialog'
import { TransactionDetail } from './components/TransactionDetail'
import { ConfirmDialog } from './components/ui/Modal'
import { Button } from './components/ui/Button'
import { LoadingPanel } from './components/ui/Primitives'
import { useToast } from './components/ui/Toast'
import { useLedger } from './data/store'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { BudgetsPage } from './pages/BudgetsPage'
import { RecurringPage } from './pages/RecurringPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { AccountsPage } from './pages/AccountsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import type { Transaction } from './domain/types'

type NewDefaults = Parameters<typeof TransactionDialog>[0]['defaults']

interface UiContextValue {
  newTransaction: (defaults?: NewDefaults) => void
  editTransaction: (transaction: Transaction) => void
  viewTransaction: (transaction: Transaction) => void
  confirmDeleteTransaction: (transaction: Transaction) => void
  openSearch: () => void
}

const UiContext = createContext<UiContextValue | null>(null)

export function useUi(): UiContextValue {
  const context = useContext(UiContext)
  if (!context) throw new Error('useUi must be used inside <App>')
  return context
}

export function App() {
  const { status, error, actions, ephemeral } = useLedger()
  const toast = useToast()

  const [searchOpen, setSearchOpen] = useState(false)
  const [formState, setFormState] = useState<{
    open: boolean
    transaction: Transaction | null
    defaults?: NewDefaults
  }>({ open: false, transaction: null })
  const [detail, setDetail] = useState<Transaction | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null)

  const newTransaction = useCallback((defaults?: NewDefaults) => {
    setFormState({ open: true, transaction: null, defaults })
  }, [])

  const editTransaction = useCallback((transaction: Transaction) => {
    setDetail(null)
    setFormState({ open: true, transaction })
  }, [])

  const confirmDeleteTransaction = useCallback((transaction: Transaction) => {
    setDetail(null)
    setPendingDelete(transaction)
  }, [])

  const ui = useMemo<UiContextValue>(
    () => ({
      newTransaction,
      editTransaction,
      viewTransaction: setDetail,
      confirmDeleteTransaction,
      openSearch: () => setSearchOpen(true),
    }),
    [newTransaction, editTransaction, confirmDeleteTransaction],
  )

  // Global shortcuts: ⌘/Ctrl+K opens search, N starts a new transaction.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (!typing && !event.metaKey && !event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        newTransaction()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [newTransaction])

  return (
    <UiContext.Provider value={ui}>
      <AppShell onOpenSearch={() => setSearchOpen(true)} onNewTransaction={() => newTransaction()}>
        {error ? (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft px-3.5 py-3"
          >
            <span aria-hidden="true" className="mt-px text-warning">
              &#9888;
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">
                {ephemeral ? 'Changes are not being saved' : 'Something needs your attention'}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">{error}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={actions.dismissError}>
              Dismiss
            </Button>
          </div>
        ) : null}

        {status === 'loading' ? (
          <LoadingPanel label="Loading your ledger" />
        ) : (
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/recurring" element={<RecurringPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/index.html" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        )}
      </AppShell>

      <TransactionDialog
        open={formState.open}
        transaction={formState.transaction}
        defaults={formState.defaults}
        onClose={() => setFormState({ open: false, transaction: null })}
      />

      <TransactionDetail
        transaction={detail}
        onClose={() => setDetail(null)}
        onEdit={editTransaction}
        onDelete={confirmDeleteTransaction}
      />

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(transaction) => setDetail(transaction)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this transaction?"
        message={
          <>
            <strong className="font-medium text-ink">{pendingDelete?.description}</strong> will be
            removed from your ledger and every total that includes it. You can undo this
            immediately afterwards.
          </>
        }
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          actions.deleteTransaction(pendingDelete.id)
          toast({
            message: `Deleted “${pendingDelete.description}”.`,
            action: { label: 'Undo', onClick: actions.undo },
          })
          setPendingDelete(null)
        }}
      />
    </UiContext.Provider>
  )
}
