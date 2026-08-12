import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLedger } from '../data/store'
import { queryTransactions } from '../domain/filters'
import { useFormat } from '../lib/format'
import { cn } from '../lib/cn'
import { CategoryDot, EmptyState } from './ui/Primitives'
import { IconSearch, IconTransfer } from './icons'
import type { Transaction } from '../domain/types'

const LIMIT = 40

/**
 * Global transaction search. Opens with Ctrl/Cmd+K or the header field,
 * filters as you type across description, category, account and notes, and
 * hands off to the transactions page for anything broader.
 */
export function GlobalSearch({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (transaction: Transaction) => void
}) {
  const { data } = useLedger()
  const format = useFormat()
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const context = useMemo(
    () => ({ categories: data.categories, accounts: data.accounts }),
    [data.categories, data.accounts],
  )

  const results = useMemo(() => {
    if (!term.trim()) return []
    return queryTransactions(data.transactions, { search: term }, context).slice(0, LIMIT)
  }, [term, data.transactions, context])

  useEffect(() => {
    if (!open) return
    setTerm('')
    setActive(0)
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = overflow
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [term])

  useEffect(() => {
    listRef.current
      ?.querySelectorAll('li')
      [active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const categoryOf = (id: string) => data.categories.find((c) => c.id === id)
  const accountOf = (id: string) => data.accounts.find((a) => a.id === id)

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const picked = results[active]
      if (picked) {
        onSelect(picked)
        onClose()
      } else if (term.trim()) {
        navigate(`/transactions?q=${encodeURIComponent(term.trim())}`)
        onClose()
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[8vh] sm:pt-[12vh]">
      <div className="absolute inset-0 bg-black/35 animate-fade-in dark:bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search transactions"
        className="relative flex max-h-[76dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop animate-rise"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <IconSearch className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search description, category, account or notes…"
            aria-label="Search transactions"
            aria-controls="global-search-results"
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-subtle"
          />
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-subtle sm:block">
            Esc
          </kbd>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {!term.trim() ? (
            <EmptyState
              compact
              title="Search your ledger"
              description="Start typing to find any transaction. Results update as you type."
            />
          ) : results.length === 0 ? (
            <EmptyState
              compact
              title={`No transactions match “${term.trim()}”`}
              description="Try a merchant name, a category, an account, or an amount like 42.50."
            />
          ) : (
            <ul id="global-search-results" ref={listRef} role="listbox" className="p-1.5">
              {results.map((t, index) => {
                const category = t.categoryId ? categoryOf(t.categoryId) : undefined
                const isTransfer = t.type === 'transfer'
                const toAccount = t.toAccountId ? accountOf(t.toAccountId) : undefined
                return (
                  <li key={t.id} role="option" aria-selected={index === active}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(t)
                        onClose()
                      }}
                      onMouseMove={() => setActive(index)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left',
                        index === active && 'bg-surface-muted',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{t.description}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted">
                          {isTransfer ? (
                            <>
                              <IconTransfer className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">
                                {accountOf(t.accountId)?.name ?? 'Unknown account'}
                                <span aria-hidden="true"> → </span>
                                <span className="sr-only"> to </span>
                                {toAccount?.name ?? 'Unknown account'}
                              </span>
                            </>
                          ) : (
                            <>
                              <CategoryDot color={category?.color ?? 'viz-neutral'} />
                              {category?.name ?? 'Uncategorized'}
                              <span aria-hidden="true">·</span>
                              {accountOf(t.accountId)?.name ?? 'Unknown account'}
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          {format.dateShort(t.date)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'tnum shrink-0 text-[13px] font-semibold',
                          t.type === 'income'
                            ? 'text-positive'
                            : isTransfer
                              ? 'text-muted'
                              : 'text-ink',
                        )}
                      >
                        <span aria-hidden="true">
                          {isTransfer ? '' : t.type === 'income' ? '+' : '−'}
                        </span>
                        <span className="sr-only">
                          {isTransfer ? 'Transfer of ' : t.type === 'income' ? 'Income of ' : 'Expense of '}
                        </span>
                        {format.money(t.amount)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {term.trim() && results.length > 0 ? (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-subtle">
            <span>
              {results.length === LIMIT ? `First ${LIMIT} matches` : `${results.length} match${results.length === 1 ? '' : 'es'}`}
            </span>
            <button
              type="button"
              className="font-medium text-accent-text hover:underline"
              onClick={() => {
                navigate(`/transactions?q=${encodeURIComponent(term.trim())}`)
                onClose()
              }}
            >
              Open in Transactions →
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
