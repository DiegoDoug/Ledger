import { useLedger } from '../data/store'
import { useFormat } from '../lib/format'
import { useUi } from '../App'
import { cn } from '../lib/cn'
import { Badge, CategoryDot } from './ui/Primitives'
import { PaymentMethodBadge } from './ui/PaymentMethodBadge'
import { Menu } from './ui/Menu'
import { IconRepeat, IconTransfer } from './icons'
import { TRANSACTION_TYPE_LABELS } from '../domain/types'
import { todayIso } from '../domain/dates'
import { detectPaymentMethod } from '../lib/paymentMethod'
import type { Transaction } from '../domain/types'

/**
 * One transaction, rendered as a table row on wide screens and a stacked card
 * on narrow ones. The whole row opens the detail view; the menu holds the
 * explicit edit/delete actions.
 */
export function TransactionRow({
  transaction,
  showDate = true,
  compact = false,
}: {
  transaction: Transaction
  showDate?: boolean
  compact?: boolean
}) {
  const { data } = useLedger()
  const format = useFormat()
  const ui = useUi()

  const category = transaction.categoryId
    ? data.categories.find((c) => c.id === transaction.categoryId)
    : undefined
  const account = data.accounts.find((a) => a.id === transaction.accountId)
  const toAccount = transaction.toAccountId
    ? data.accounts.find((a) => a.id === transaction.toAccountId)
    : undefined

  const isIncome = transaction.type === 'income'
  const isTransfer = transaction.type === 'transfer'
  const isUpcoming = transaction.date > todayIso()
  const paymentMethod = isTransfer ? null : detectPaymentMethod(transaction.description)

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 border-b border-line px-3 last:border-b-0',
        compact ? 'py-2' : 'py-2.5',
        'transition-colors hover:bg-surface-muted/60',
      )}
    >
      <button
        type="button"
        onClick={() => ui.viewTransaction(transaction)}
        className="min-w-0 flex-1 text-left"
      >
        {/* The clickable name is the accessible label for the whole row. */}
        <span className="sr-only">
          View details for {transaction.description}, {format.money(transaction.amount)} on{' '}
          {format.date(transaction.date)}
        </span>
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-ink">
            {transaction.description}
          </span>
          {transaction.recurringId ? (
            <IconRepeat className="h-3 w-3 shrink-0 text-subtle" aria-label="Recurring" />
          ) : null}
          {isUpcoming ? (
            <Badge tone="neutral" className="shrink-0">
              Upcoming
            </Badge>
          ) : null}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted">
          {isTransfer ? (
            <>
              <IconTransfer className="h-3 w-3 shrink-0 text-subtle" aria-hidden="true" />
              <span className="truncate">Transfer</span>
              <span aria-hidden="true" className="text-subtle">
                ·
              </span>
              <span className="truncate">
                {account?.name ?? 'Unknown account'}
                <span aria-hidden="true"> → </span>
                <span className="sr-only"> to </span>
                {toAccount?.name ?? 'Unknown account'}
              </span>
            </>
          ) : (
            <>
              <CategoryDot color={category?.color ?? 'viz-neutral'} />
              <span className="truncate">{category?.name ?? 'Uncategorized'}</span>
              <span aria-hidden="true" className="text-subtle">
                ·
              </span>
              <span className="truncate">{account?.name ?? 'Unknown account'}</span>
              {paymentMethod ? <PaymentMethodBadge method={paymentMethod} /> : null}
            </>
          )}
          {showDate ? (
            <>
              <span aria-hidden="true" className="text-subtle">
                ·
              </span>
              <span className="tnum">{format.dateShort(transaction.date)}</span>
            </>
          ) : null}
        </span>
      </button>

      <span
        className={cn(
          'tnum shrink-0 text-[13px] font-semibold tabular-nums',
          isIncome ? 'text-positive' : isTransfer ? 'text-muted' : 'text-ink',
        )}
      >
        {/* A transfer is neither a gain nor a loss overall, so it carries no sign. */}
        <span aria-hidden="true">{isTransfer ? '' : isIncome ? '+' : '−'}</span>
        <span className="sr-only">
          {isTransfer ? 'Transfer of ' : isIncome ? 'Income of ' : 'Expense of '}
        </span>
        {format.money(transaction.amount)}
      </span>

      <Menu
        label={`Actions for ${transaction.description}`}
        items={[
          { label: 'View details', onSelect: () => ui.viewTransaction(transaction) },
          { label: 'Edit', onSelect: () => ui.editTransaction(transaction) },
          {
            label: 'Delete',
            destructive: true,
            onSelect: () => ui.confirmDeleteTransaction(transaction),
          },
        ]}
      />
    </div>
  )
}

export function TypeBadge({ type }: { type: Transaction['type'] }) {
  return (
    <Badge tone={type === 'income' ? 'positive' : type === 'transfer' ? 'accent' : 'neutral'}>
      {TRANSACTION_TYPE_LABELS[type]}
    </Badge>
  )
}
