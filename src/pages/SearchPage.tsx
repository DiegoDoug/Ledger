import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Card, CardBody } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Field, Input, Select } from '../components/ui/Field'
import { Badge, EmptyState, SectionTitle } from '../components/ui/Primitives'
import { TransactionRow } from '../components/TransactionRow'
import { useLedger } from '../data/store'
import { useFormat } from '../lib/format'
import { useUi } from '../App'
import { activeFilterCount, groupByDate, queryTransactions } from '../domain/filters'
import type { SortField, TransactionQuery } from '../domain/filters'
import { categoryTotals, totals } from '../domain/calculations'
import { parseAmountToCents } from '../domain/money'
import { formatDate } from '../domain/dates'
import { IconInbox, IconSearch } from '../components/icons'
import { cn } from '../lib/cn'
import { plural } from '../lib/plural'
import type { TransactionType } from '../domain/types'

const PAGE_SIZE = 40

const SORT_OPTIONS: Array<{ value: `${SortField}:${'asc' | 'desc'}`; label: string }> = [
  { value: 'date:desc', label: 'Newest first' },
  { value: 'date:asc', label: 'Oldest first' },
  { value: 'amount:desc', label: 'Largest amount' },
  { value: 'amount:asc', label: 'Smallest amount' },
  { value: 'description:asc', label: 'Description A–Z' },
  { value: 'category:asc', label: 'Category A–Z' },
]

/**
 * Full-page search. The command palette (⌘K) is for jumping straight to one
 * transaction; this page is for interrogating the ledger — search combined with
 * filters, a running total of whatever matched, and a category breakdown of the
 * result set.
 */
export function SearchPage() {
  const { data } = useLedger()
  const format = useFormat()
  const ui = useUi()
  const [params, setParams] = useSearchParams()

  const [term, setTerm] = useState(params.get('q') ?? '')
  const [type, setType] = useState<TransactionType | 'all'>('all')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('date:desc')
  const [limit, setLimit] = useState(PAGE_SIZE)

  // Keep the query in the URL so a search is shareable and survives a reload.
  useEffect(() => {
    const next = new URLSearchParams(params)
    if (term) next.set('q', term)
    else next.delete('q')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])

  const context = useMemo(
    () => ({ categories: data.categories, accounts: data.accounts }),
    [data.categories, data.accounts],
  )

  const query: TransactionQuery = useMemo(() => {
    const [sortField, sortDirection] = sort.split(':') as [SortField, 'asc' | 'desc']
    const min = parseAmountToCents(minAmount)
    const max = parseAmountToCents(maxAmount)
    return {
      search: term,
      type,
      categoryIds: categoryId ? [categoryId] : undefined,
      accountIds: accountId ? [accountId] : undefined,
      from: from || undefined,
      to: to || undefined,
      minAmount: min !== null && min >= 0 ? min : undefined,
      maxAmount: max !== null && max >= 0 ? max : undefined,
      sortField,
      sortDirection,
    }
  }, [term, type, categoryId, accountId, from, to, minAmount, maxAmount, sort])

  const hasQuery = term.trim().length > 0 || activeFilterCount(query) > 0

  const results = useMemo(
    () => (hasQuery ? queryTransactions(data.transactions, query, context) : []),
    [hasQuery, data.transactions, query, context],
  )

  const summary = useMemo(() => totals(results), [results])
  const breakdown = useMemo(
    () => categoryTotals(results, data.categories, 'expense').slice(0, 6),
    [results, data.categories],
  )
  const visible = results.slice(0, limit)
  const groups = useMemo(() => groupByDate(visible), [visible])

  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [term, type, categoryId, accountId, from, to, minAmount, maxAmount, sort])

  function reset() {
    setTerm('')
    setType('all')
    setCategoryId('')
    setAccountId('')
    setFrom('')
    setTo('')
    setMinAmount('')
    setMaxAmount('')
  }

  return (
    <>
      <PageHeader
        title="Search"
        description="Search across descriptions, categories, accounts and notes, then narrow with filters. Results update as you type."
      />

      <Card className="mb-4">
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <label htmlFor="search-term" className="sr-only absolute h-px w-px overflow-hidden">
                Search transactions
              </label>
              <Input
                id="search-term"
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Try a merchant, a category, an account, a note, or an amount like 42.50"
                className="pl-9"
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="min-w-[9.5rem]">
              <label htmlFor="search-sort" className="sr-only absolute h-px w-px overflow-hidden">
                Sort results
              </label>
              <Select
                id="search-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-line bg-surface-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Type" htmlFor="search-type">
              <Select
                id="search-type"
                value={type}
                onChange={(e) => setType(e.target.value as TransactionType | 'all')}
              >
                <option value="all">All types</option>
                <option value="expense">Expenses</option>
                <option value="income">Income</option>
                <option value="transfer">Transfers</option>
              </Select>
            </Field>

            <Field
              label="Category"
              htmlFor="search-category"
              hint={type === 'transfer' ? 'Transfers have no category.' : undefined}
            >
              <Select
                id="search-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={type === 'transfer'}
                aria-describedby={type === 'transfer' ? 'search-category-hint' : undefined}
              >
                <option value="">All categories</option>
                <optgroup label="Spending">
                  {data.categories
                    .filter((c) => c.type === 'expense')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Income">
                  {data.categories
                    .filter((c) => c.type === 'income')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              </Select>
            </Field>

            <Field label="Account" htmlFor="search-account">
              <Select
                id="search-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">All accounts</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Minimum amount" htmlFor="search-min">
              <Input
                id="search-min"
                inputMode="decimal"
                value={minAmount}
                prefix={format.symbol}
                placeholder="0.00"
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </Field>

            <Field label="From" htmlFor="search-from">
              <Input
                id="search-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>

            <Field label="To" htmlFor="search-to">
              <Input
                id="search-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>

            <Field label="Maximum amount" htmlFor="search-max">
              <Input
                id="search-max"
                inputMode="decimal"
                value={maxAmount}
                prefix={format.symbol}
                placeholder="No limit"
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </Field>

            <div className="flex items-end">
              {hasQuery ? (
                <Button variant="ghost" size="sm" onClick={reset}>
                  Clear search and filters
                </Button>
              ) : null}
            </div>
          </div>

          {hasQuery ? (
            <div
              className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line pt-3 text-xs"
              role="status"
              aria-live="polite"
            >
              <span className="text-muted">
                <strong className="tnum font-semibold text-ink">{results.length}</strong>{' '}
                {results.length === 1 ? 'match' : 'matches'} of {data.transactions.length}
              </span>
              <span className="text-muted">
                Income{' '}
                <strong className="tnum font-semibold text-positive">
                  {format.money(summary.income)}
                </strong>
              </span>
              <span className="text-muted">
                Expenses{' '}
                <strong className="tnum font-semibold text-ink">
                  {format.money(summary.expenses)}
                </strong>
              </span>
              <span className="text-muted">
                Net{' '}
                <strong
                  className={cn(
                    'tnum font-semibold',
                    summary.net < 0 ? 'text-negative' : 'text-positive',
                  )}
                >
                  {format.money(summary.net)}
                </strong>
              </span>
              {summary.transfers > 0 ? (
                <span className="text-muted">
                  Transferred{' '}
                  <strong className="tnum font-semibold text-ink">
                    {format.money(summary.transfers)}
                  </strong>
                </span>
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {hasQuery && breakdown.length > 1 ? (
        <>
          <SectionTitle className="mb-2">What matched, by category</SectionTitle>
          <Card className="mb-4">
            <CardBody className="flex flex-wrap gap-2">
              {breakdown.map((row) => (
                <button
                  key={row.categoryId}
                  type="button"
                  onClick={() => setCategoryId(row.categoryId)}
                  className="flex items-center gap-2 rounded-md border border-line bg-surface-muted/50 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:border-line-strong"
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: `var(--ink-${row.color})` }}
                  />
                  <span className="text-ink">{row.name}</span>
                  <span className="tnum text-muted">{format.money(row.amount)}</span>
                  <Badge tone="neutral">{row.count}</Badge>
                </button>
              ))}
            </CardBody>
          </Card>
        </>
      ) : null}

      <Card>
        {!hasQuery ? (
          <EmptyState
            icon={<IconSearch className="h-4 w-4" />}
            title="Search your ledger"
            description={
              data.transactions.length === 0
                ? 'There is nothing to search yet — record a transaction first.'
                : `Start typing, or pick a filter, to search ${plural(
                    data.transactions.length,
                    'transaction',
                  )}. Press ⌘K anywhere for the quick palette.`
            }
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={<IconInbox className="h-4 w-4" />}
            title={term.trim() ? `Nothing matches “${term.trim()}”` : 'Nothing matches those filters'}
            description="Try fewer words, a wider date range, or clear the filters."
            action={
              <Button variant="secondary" onClick={reset}>
                Clear search and filters
              </Button>
            }
          />
        ) : (
          <>
            {groups.map(([date, items]) => (
              <section key={date}>
                <h2 className="flex items-baseline justify-between gap-3 border-b border-line bg-surface-muted/70 px-3 py-1.5">
                  <span className="text-[11px] font-semibold text-muted">
                    {formatDate(date, format.locale)}
                  </span>
                  <span className="text-[11px] text-subtle">{plural(items.length, 'match')}</span>
                </h2>
                {items.map((t) => (
                  <TransactionRow key={t.id} transaction={t} showDate={false} />
                ))}
              </section>
            ))}

            {results.length > visible.length ? (
              <div className="flex items-center justify-center gap-3 border-t border-line px-4 py-3">
                <span className="text-xs text-muted">
                  Showing {visible.length} of {results.length}
                </span>
                <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                  Load {Math.min(PAGE_SIZE, results.length - visible.length)} more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      {hasQuery && results.length > 0 ? (
        <p className="mt-4 text-xs text-subtle">
          Open any result to view or edit it, or{' '}
          <button
            type="button"
            onClick={() => ui.newTransaction()}
            className="rounded underline hover:text-ink"
          >
            record a new transaction
          </button>
          .
        </p>
      ) : null}
    </>
  )
}
