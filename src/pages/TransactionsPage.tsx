import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Card, CardBody } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Field'
import { EmptyState } from '../components/ui/Primitives'
import { TransactionRow } from '../components/TransactionRow'
import { FilterToggleButton, TransactionFilterFields } from '../components/TransactionFilterFields'
import { useLedger } from '../data/store'
import { useFormat } from '../lib/format'
import { useUi } from '../App'
import { activeFilterCount, groupByDate, queryTransactions } from '../domain/filters'
import type { SortField, TransactionQuery } from '../domain/filters'
import { totals } from '../domain/calculations'
import { parseAmountToCents } from '../domain/money'
import { formatDate, relativeDayLabel, todayIso } from '../domain/dates'
import { IconInbox, IconPlus, IconSearch } from '../components/icons'
import { cn } from '../lib/cn'
import type { TransactionType } from '../domain/types'

const SORT_OPTIONS: Array<{ value: `${SortField}:${'asc' | 'desc'}`; label: string }> = [
  { value: 'date:desc', label: 'Newest first' },
  { value: 'date:asc', label: 'Oldest first' },
  { value: 'amount:desc', label: 'Largest amount' },
  { value: 'amount:asc', label: 'Smallest amount' },
  { value: 'description:asc', label: 'Description A–Z' },
  { value: 'category:asc', label: 'Category A–Z' },
]

const PAGE_SIZE = 50

export function TransactionsPage() {
  const { data } = useLedger()
  const format = useFormat()
  const ui = useUi()
  const [params, setParams] = useSearchParams()
  const today = todayIso()

  const [search, setSearch] = useState(params.get('q') ?? '')
  const [type, setType] = useState<TransactionType | 'all'>(() => {
    const requested = params.get('type')
    return requested === 'income' || requested === 'expense' || requested === 'transfer'
      ? requested
      : 'all'
  })
  const [categoryId, setCategoryId] = useState(params.get('category') ?? '')
  const [accountId, setAccountId] = useState(params.get('account') ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('date:desc')
  const [showFilters, setShowFilters] = useState(
    Boolean(params.get('category') || params.get('account') || params.get('type')),
  )
  const [limit, setLimit] = useState(PAGE_SIZE)

  // Keep the URL in step with the search box so results stay shareable.
  useEffect(() => {
    const next = new URLSearchParams(params)
    if (search) next.set('q', search)
    else next.delete('q')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const context = useMemo(
    () => ({ categories: data.categories, accounts: data.accounts }),
    [data.categories, data.accounts],
  )

  const query: TransactionQuery = useMemo(() => {
    const [sortField, sortDirection] = sort.split(':') as [SortField, 'asc' | 'desc']
    const min = parseAmountToCents(minAmount)
    const max = parseAmountToCents(maxAmount)
    return {
      search,
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
  }, [search, type, categoryId, accountId, from, to, minAmount, maxAmount, sort])

  const results = useMemo(
    () => queryTransactions(data.transactions, query, context),
    [data.transactions, query, context],
  )

  const summary = useMemo(() => totals(results), [results])
  const filterCount = activeFilterCount(query)
  const visible = results.slice(0, limit)
  const groups = useMemo(() => groupByDate(visible), [visible])

  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [search, type, categoryId, accountId, from, to, minAmount, maxAmount, sort])

  function clearFilters() {
    setType('all')
    setCategoryId('')
    setAccountId('')
    setFrom('')
    setTo('')
    setMinAmount('')
    setMaxAmount('')
  }

  const isFiltered = filterCount > 0 || search.trim().length > 0

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every recorded movement of money. Search, filter and sort to find anything."
        actions={
          <Button variant="primary" onClick={() => ui.newTransaction()}>
            <IconPlus className="h-3.5 w-3.5" />
            New transaction
          </Button>
        }
      />

      <Card className="mb-4">
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <label htmlFor="tx-search" className="sr-only absolute h-px w-px overflow-hidden">
                Search transactions
              </label>
              <Input
                id="tx-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search description, category, account or notes…"
                className="pl-9"
              />
            </div>

            <div className="flex gap-2">
              <FilterToggleButton
                open={showFilters}
                onToggle={() => setShowFilters((v) => !v)}
                count={filterCount}
                controls="transaction-filters"
              />

              <div className="min-w-[9.5rem]">
                <label htmlFor="tx-sort" className="sr-only absolute h-px w-px overflow-hidden">
                  Sort transactions
                </label>
                <Select
                  id="tx-sort"
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
          </div>

          {showFilters ? (
            <div id="transaction-filters">
              <TransactionFilterFields
                idPrefix="filter"
                type={type}
                onTypeChange={setType}
                categoryId={categoryId}
                onCategoryChange={setCategoryId}
                accountId={accountId}
                onAccountChange={setAccountId}
                from={from}
                onFromChange={setFrom}
                to={to}
                onToChange={setTo}
                minAmount={minAmount}
                onMinAmountChange={setMinAmount}
                maxAmount={maxAmount}
                onMaxAmountChange={setMaxAmount}
                categories={data.categories}
                accounts={data.accounts}
                currencySymbol={format.symbol}
                filterCount={filterCount}
                onClear={clearFilters}
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line pt-3 text-xs">
            <span className="text-muted">
              <strong className="tnum font-semibold text-ink">{results.length}</strong>{' '}
              {results.length === 1 ? 'transaction' : 'transactions'}
              {isFiltered ? ` of ${data.transactions.length}` : ''}
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
                </strong>{' '}
                <span className="text-subtle">(not counted above)</span>
              </span>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        {results.length === 0 ? (
          isFiltered ? (
            <EmptyState
              icon={<IconSearch className="h-4 w-4" />}
              title="No transactions match your filters"
              description="Try a different search term, widen the date range, or clear the filters to see everything."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('')
                    clearFilters()
                  }}
                >
                  Reset search and filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<IconInbox className="h-4 w-4" />}
              title="No transactions yet"
              description="Record your income and expenses to build a picture of your finances."
              action={
                <Button variant="primary" onClick={() => ui.newTransaction()}>
                  <IconPlus className="h-3.5 w-3.5" />
                  Add your first transaction
                </Button>
              }
            />
          )
        ) : (
          <>
            {groups.map(([date, items]) => (
              <section key={date}>
                <h2 className="sticky top-14 z-10 flex items-baseline justify-between gap-3 border-b border-line bg-surface-muted/80 px-3 py-1.5 backdrop-blur-sm">
                  <span className="text-[11px] font-semibold text-muted">
                    {formatDate(date, format.locale)}
                  </span>
                  <span className="text-[11px] text-subtle">{relativeDayLabel(date, today)}</span>
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
    </>
  )
}
