import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { CategoryDot } from './ui/Primitives'
import { TypeBadge } from './TransactionRow'
import { useLedger } from '../data/store'
import { useFormat } from '../lib/format'
import { FREQUENCY_LABELS } from '../domain/recurring'
import type { Transaction } from '../domain/types'

export function TransactionDetail({
  transaction,
  onClose,
  onEdit,
  onDelete,
}: {
  transaction: Transaction | null
  onClose: () => void
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
}) {
  const { data } = useLedger()
  const format = useFormat()
  if (!transaction) return null

  const category = transaction.categoryId
    ? data.categories.find((c) => c.id === transaction.categoryId)
    : undefined
  const account = data.accounts.find((a) => a.id === transaction.accountId)
  const toAccount = transaction.toAccountId
    ? data.accounts.find((a) => a.id === transaction.toAccountId)
    : undefined
  const rule = transaction.recurringId
    ? data.recurring.find((r) => r.id === transaction.recurringId)
    : undefined
  const isTransfer = transaction.type === 'transfer'

  return (
    <Modal
      open
      onClose={onClose}
      title="Transaction details"
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            className="text-negative hover:bg-negative-soft"
            onClick={() => onDelete(transaction)}
          >
            Delete
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => onEdit(transaction)} data-autofocus>
            Edit
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p
            className={`tnum text-2xl font-semibold tracking-[-0.02em] ${
              transaction.type === 'income'
                ? 'text-positive'
                : isTransfer
                  ? 'text-muted'
                  : 'text-ink'
            }`}
          >
            {isTransfer ? '' : transaction.type === 'income' ? '+' : '−'}
            {format.money(transaction.amount)}
          </p>
          <p className="mt-1 text-sm text-ink">{transaction.description}</p>
        </div>

        <dl className="divide-y divide-line rounded-lg border border-line">
          <Row label="Type">
            <TypeBadge type={transaction.type} />
          </Row>
          {isTransfer ? (
            <>
              <Row label="From">{account?.name ?? 'Unknown account'}</Row>
              <Row label="To">{toAccount?.name ?? 'Unknown account'}</Row>
            </>
          ) : (
            <>
              <Row label="Category">
                <span className="flex items-center gap-1.5">
                  <CategoryDot color={category?.color ?? 'viz-neutral'} />
                  {category?.name ?? 'Uncategorized'}
                </span>
              </Row>
              <Row label="Account">{account?.name ?? 'Unknown account'}</Row>
            </>
          )}
          <Row label="Date">{format.date(transaction.date)}</Row>
          <Row label="Recurring">
            {rule
              ? `${FREQUENCY_LABELS[rule.frequency]} — ${rule.name}`
              : transaction.recurringId
                ? 'Schedule removed'
                : 'One-off'}
          </Row>
          <Row label="Recorded">{formatStamp(transaction.createdAt, format.locale)}</Row>
          {transaction.updatedAt && transaction.updatedAt !== transaction.createdAt ? (
            <Row label="Last edited">{formatStamp(transaction.updatedAt, format.locale)}</Row>
          ) : null}
          {transaction.notes ? (
            <div className="px-3 py-2.5">
              <dt className="text-xs text-muted">Notes</dt>
              <dd className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                {transaction.notes}
              </dd>
            </div>
          ) : null}
        </dl>

        {isTransfer ? (
          <p className="text-xs leading-relaxed text-muted">
            This is a transfer between your own accounts. It moves the balance from one account to
            the other and is excluded from income, spending, budgets and your savings rate.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

/** An audit timestamp is a moment in time, so it keeps its time-of-day. */
function formatStamp(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-[13px] text-ink">{children}</dd>
    </div>
  )
}
