import { Button } from './ui/Button'
import { Field, Input, Select } from './ui/Field'
import { Badge } from './ui/Primitives'
import { IconFilter } from './icons'
import type { Account, Category, TransactionType } from '../domain/types'

/**
 * The toggle that shows or hides `TransactionFilterFields`. Shared so
 * Transactions and Search collapse their filter grid the same way instead of
 * each page inventing its own disclosure behaviour.
 */
export function FilterToggleButton({
  open,
  onToggle,
  count,
  controls,
}: {
  open: boolean
  onToggle: () => void
  count: number
  controls: string
}) {
  return (
    <Button
      variant={open ? 'subtle' : 'secondary'}
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
    >
      <IconFilter className="h-3.5 w-3.5" />
      Filters
      {count > 0 ? (
        <Badge tone="accent" className="ml-0.5">
          {count}
        </Badge>
      ) : null}
    </Button>
  )
}

export interface TransactionFilterFieldsProps {
  type: TransactionType | 'all'
  onTypeChange: (value: TransactionType | 'all') => void
  categoryId: string
  onCategoryChange: (value: string) => void
  accountId: string
  onAccountChange: (value: string) => void
  from: string
  onFromChange: (value: string) => void
  to: string
  onToChange: (value: string) => void
  minAmount: string
  onMinAmountChange: (value: string) => void
  maxAmount: string
  onMaxAmountChange: (value: string) => void
  categories: Category[]
  accounts: Account[]
  currencySymbol: string
  filterCount: number
  onClear: () => void
  idPrefix: string
}

/**
 * The seven-field filter grid used by both Transactions and Search. Collapsed
 * behind `FilterToggleButton` by default on both pages so a page whose whole
 * job is one search box doesn't open with a wall of empty form fields.
 */
export function TransactionFilterFields({
  type,
  onTypeChange,
  categoryId,
  onCategoryChange,
  accountId,
  onAccountChange,
  from,
  onFromChange,
  to,
  onToChange,
  minAmount,
  onMinAmountChange,
  maxAmount,
  onMaxAmountChange,
  categories,
  accounts,
  currencySymbol,
  filterCount,
  onClear,
  idPrefix,
}: TransactionFilterFieldsProps) {
  const id = (suffix: string) => `${idPrefix}-${suffix}`

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Type" htmlFor={id('type')}>
        <Select
          id={id('type')}
          value={type}
          onChange={(e) => onTypeChange(e.target.value as TransactionType | 'all')}
        >
          <option value="all">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
        </Select>
      </Field>

      <Field
        label="Category"
        htmlFor={id('category')}
        hint={type === 'transfer' ? 'Transfers have no category.' : undefined}
      >
        <Select
          id={id('category')}
          value={categoryId}
          onChange={(e) => onCategoryChange(e.target.value)}
          disabled={type === 'transfer'}
          aria-describedby={type === 'transfer' ? id('category-hint') : undefined}
        >
          <option value="">All categories</option>
          <optgroup label="Spending">
            {categories
              .filter((c) => c.type === 'expense')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Income">
            {categories
              .filter((c) => c.type === 'income')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        </Select>
      </Field>

      <Field label="Account" htmlFor={id('account')}>
        <Select id={id('account')} value={accountId} onChange={(e) => onAccountChange(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="From" htmlFor={id('from')}>
        <Input
          id={id('from')}
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </Field>

      <Field label="To" htmlFor={id('to')}>
        <Input
          id={id('to')}
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onToChange(e.target.value)}
        />
      </Field>

      <Field label="Minimum amount" htmlFor={id('min')}>
        <Input
          id={id('min')}
          inputMode="decimal"
          value={minAmount}
          prefix={currencySymbol}
          placeholder="0.00"
          onChange={(e) => onMinAmountChange(e.target.value)}
        />
      </Field>

      <Field label="Maximum amount" htmlFor={id('max')}>
        <Input
          id={id('max')}
          inputMode="decimal"
          value={maxAmount}
          prefix={currencySymbol}
          placeholder="No limit"
          onChange={(e) => onMaxAmountChange(e.target.value)}
        />
      </Field>

      {filterCount > 0 ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear all filters
          </Button>
        </div>
      ) : null}
    </div>
  )
}
