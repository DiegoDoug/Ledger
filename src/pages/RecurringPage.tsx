import { useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Field, Input, SegmentedControl, Select, Textarea } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Badge, CategoryDot, EmptyState } from '../components/ui/Primitives'
import { Menu } from '../components/ui/Menu'
import { StatCard } from '../components/StatCard'
import { useLedger } from '../data/store'
import { useToast } from '../components/ui/Toast'
import { useFormat } from '../lib/format'
import {
  FREQUENCY_LABELS,
  monthlyCommitment,
  monthlyEquivalent,
  nextOccurrence,
} from '../domain/recurring'
import { addDays, isValidIso, relativeDayLabel, todayIso } from '../domain/dates'
import { parseAmountToCents } from '../domain/money'
import { IconPlus, IconRepeat, IconTransfer } from '../components/icons'
import { cn } from '../lib/cn'
import { plural } from '../lib/plural'
import type { Frequency, RecurringTransaction, TransactionType } from '../domain/types'

export function RecurringPage() {
  const { data, actions } = useLedger()
  const format = useFormat()
  const toast = useToast()
  const today = todayIso()

  const [editing, setEditing] = useState<RecurringTransaction | null | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<RecurringTransaction | null>(null)

  const rules = useMemo(
    () =>
      [...data.recurring].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        return (
          nextOccurrence(a, addDays(today, -1)).localeCompare(
            nextOccurrence(b, addDays(today, -1)),
          ) || a.name.localeCompare(b.name)
        )
      }),
    [data.recurring, today],
  )

  const committedExpense = monthlyCommitment(data.recurring, 'expense')
  const committedIncome = monthlyCommitment(data.recurring, 'income')
  const activeIncomeCount = data.recurring.filter((r) => r.active && r.type === 'income').length

  return (
    <>
      <PageHeader
        title="Recurring"
        description="Scheduled income and bills. Occurrences post to your transactions automatically once their date arrives."
        actions={
          <Button variant="primary" onClick={() => setEditing(null)}>
            <IconPlus className="h-3.5 w-3.5" />
            New schedule
          </Button>
        }
      />

      <section aria-label="Recurring summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Committed each month"
          value={format.money(committedExpense)}
          meta={
            <p className="text-xs text-muted">
              Weekly and yearly schedules normalised to a monthly figure
            </p>
          }
        />
        <StatCard
          label="Recurring income"
          value={format.money(committedIncome)}
          tone={committedIncome > 0 ? 'positive' : 'default'}
          meta={
            activeIncomeCount === 0 ? (
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded text-xs font-medium text-accent-text hover:underline"
              >
                + Add income
              </button>
            ) : (
              <p className="text-xs text-muted">{plural(activeIncomeCount, 'active source')}</p>
            )
          }
        />
        <StatCard
          label="Net monthly commitment"
          value={format.money(committedIncome - committedExpense)}
          tone={committedIncome - committedExpense < 0 ? 'negative' : 'positive'}
          meta={<p className="text-xs text-muted">Before any variable spending</p>}
        />
      </section>

      <Card className="mt-4">
        <CardHeader
          title="Schedules"
          description={`${data.recurring.filter((r) => r.active).length} active, ${
            data.recurring.filter((r) => !r.active).length
          } paused`}
        />
        {rules.length === 0 ? (
          <EmptyState
            icon={<IconRepeat className="h-4 w-4" />}
            title="No recurring transactions"
            description="Set up your rent, salary or subscriptions once and Ledger will keep posting them for you."
            action={
              <Button variant="primary" onClick={() => setEditing(null)}>
                <IconPlus className="h-3.5 w-3.5" />
                Create a schedule
              </Button>
            }
          />
        ) : (
          <ul>
            {rules.map((rule) => {
              const category = rule.categoryId
                ? data.categories.find((c) => c.id === rule.categoryId)
                : undefined
              const account = data.accounts.find((a) => a.id === rule.accountId)
              const toAccount = rule.toAccountId
                ? data.accounts.find((a) => a.id === rule.toAccountId)
                : undefined
              const isTransfer = rule.type === 'transfer'
              const next = nextOccurrence(rule, addDays(today, -1))
              return (
                <li
                  key={rule.id}
                  className={cn(
                    'flex items-center gap-3 border-b border-line px-3 py-3 last:border-b-0',
                    !rule.active && 'opacity-70',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-ink">{rule.name}</span>
                      <Badge tone="neutral">{FREQUENCY_LABELS[rule.frequency]}</Badge>
                      {!rule.active ? <Badge tone="neutral">Paused</Badge> : null}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
                      {isTransfer ? (
                        <>
                          <IconTransfer className="h-3 w-3 shrink-0 text-subtle" aria-hidden="true" />
                          <span>
                            {account?.name ?? 'Unknown account'}
                            <span aria-hidden="true"> → </span>
                            <span className="sr-only"> to </span>
                            {toAccount?.name ?? 'Unknown account'}
                          </span>
                        </>
                      ) : (
                        <>
                          <CategoryDot color={category?.color ?? 'viz-neutral'} />
                          {category?.name ?? 'Uncategorized'}
                          <span aria-hidden="true" className="text-subtle">
                            ·
                          </span>
                          {account?.name ?? 'Unknown account'}
                        </>
                      )}
                      <span aria-hidden="true" className="text-subtle">
                        ·
                      </span>
                      {rule.active ? (
                        <>
                          Next {format.dateShort(next)} ({relativeDayLabel(next, today)})
                        </>
                      ) : (
                        'Not scheduled while paused'
                      )}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'tnum text-[13px] font-semibold',
                        rule.type === 'income'
                          ? 'text-positive'
                          : isTransfer
                            ? 'text-muted'
                            : 'text-ink',
                      )}
                    >
                      <span aria-hidden="true">
                        {isTransfer ? '' : rule.type === 'income' ? '+' : '−'}
                      </span>
                      <span className="sr-only">
                        {isTransfer ? 'Transfer of ' : rule.type === 'income' ? 'Income of ' : 'Payment of '}
                      </span>
                      {format.money(rule.amount)}
                    </p>
                    {rule.frequency !== 'monthly' ? (
                      <p className="tnum text-[11px] text-subtle">
                        ≈ {format.money(monthlyEquivalent(rule))}/mo
                      </p>
                    ) : null}
                  </div>

                  <Menu
                    label={`Actions for ${rule.name}`}
                    items={[
                      { label: 'Edit', onSelect: () => setEditing(rule) },
                      {
                        label: rule.active ? 'Pause schedule' : 'Resume schedule',
                        onSelect: () => {
                          actions.toggleRecurring(rule.id)
                          toast({
                            message: rule.active
                              ? `Paused “${rule.name}”. No further occurrences will post.`
                              : `Resumed “${rule.name}”.`,
                            action: { label: 'Undo', onClick: actions.undo },
                          })
                        },
                      },
                      {
                        label: 'Delete',
                        destructive: true,
                        onSelect: () => setPendingDelete(rule),
                      },
                    ]}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {editing !== undefined ? (
        <RecurringDialog rule={editing} onClose={() => setEditing(undefined)} />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this schedule?"
        message={
          <>
            <strong className="font-medium text-ink">{pendingDelete?.name}</strong> will stop
            posting new transactions. Occurrences already recorded stay in your history.
          </>
        }
        confirmLabel="Delete schedule"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          actions.deleteRecurring(pendingDelete.id)
          toast({
            message: `Deleted “${pendingDelete.name}”.`,
            action: { label: 'Undo', onClick: actions.undo },
          })
          setPendingDelete(null)
        }}
      />
    </>
  )
}

interface RuleForm {
  name: string
  amount: string
  type: TransactionType
  categoryId: string
  accountId: string
  toAccountId: string
  frequency: Frequency
  startDate: string
  notes: string
}

function RecurringDialog({
  rule,
  onClose,
}: {
  rule: RecurringTransaction | null
  onClose: () => void
}) {
  const { data, actions } = useLedger()
  const format = useFormat()
  const toast = useToast()

  const [form, setForm] = useState<RuleForm>(() => ({
    name: rule?.name ?? '',
    amount: rule ? (rule.amount / 100).toFixed(2) : '',
    type: rule?.type ?? 'expense',
    categoryId: rule?.categoryId ?? data.categories.find((c) => c.type === 'expense')?.id ?? '',
    accountId: rule?.accountId ?? data.accounts.find((a) => !a.archived)?.id ?? '',
    toAccountId: rule?.toAccountId ?? '',
    frequency: rule?.frequency ?? 'monthly',
    startDate: rule?.startDate ?? todayIso(),
    notes: rule?.notes ?? '',
  }))
  const [errors, setErrors] = useState<Partial<Record<keyof RuleForm, string>>>({})

  const isTransfer = form.type === 'transfer'
  const openAccounts = data.accounts.filter((a) => !a.archived)
  const categories = isTransfer ? [] : data.categories.filter((c) => c.type === form.type)
  const destinations = openAccounts.filter((a) => a.id !== form.accountId)

  function update<K extends keyof RuleForm>(key: K, value: RuleForm[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'type') {
        if (value === 'transfer') {
          next.categoryId = ''
          if (!next.toAccountId || next.toAccountId === next.accountId) {
            next.toAccountId =
              data.accounts.find((a) => !a.archived && a.id !== next.accountId)?.id ?? ''
          }
        } else {
          next.toAccountId = ''
          const pool = data.categories.filter((c) => c.type === value)
          if (!pool.some((c) => c.id === current.categoryId)) next.categoryId = pool[0]?.id ?? ''
        }
      }
      if (key === 'accountId' && next.type === 'transfer' && next.toAccountId === value) {
        next.toAccountId = data.accounts.find((a) => !a.archived && a.id !== value)?.id ?? ''
      }
      return next
    })
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next: Partial<Record<keyof RuleForm, string>> = {}
    if (!form.name.trim()) next.name = 'Give the schedule a name.'
    const cents = parseAmountToCents(form.amount)
    if (form.amount.trim() === '') next.amount = 'Enter an amount.'
    else if (cents === null) next.amount = 'That is not a valid amount.'
    else if (cents <= 0) next.amount = 'Amount must be greater than zero.'
    if (!isTransfer && !form.categoryId) next.categoryId = 'Choose a category.'
    if (!form.accountId) {
      next.accountId = isTransfer ? 'Choose the account to move from.' : 'Choose an account.'
    }
    if (isTransfer) {
      if (!form.toAccountId) next.toAccountId = 'Choose the account to move to.'
      else if (form.toAccountId === form.accountId) next.toAccountId = 'Choose two different accounts.'
    }
    if (!isValidIso(form.startDate)) next.startDate = 'Use a real calendar date.'

    setErrors(next)
    if (Object.keys(next).length > 0) return

    const payload: Omit<RecurringTransaction, 'id' | 'active'> = {
      name: form.name.trim(),
      amount: cents ?? 0,
      type: form.type,
      categoryId: isTransfer ? null : form.categoryId,
      accountId: form.accountId,
      frequency: form.frequency,
      startDate: form.startDate,
      notes: form.notes.trim() || undefined,
    }
    // Always assigned, so editing a transfer into an expense clears the destination.
    payload.toAccountId = isTransfer ? form.toAccountId : undefined

    if (rule) {
      actions.updateRecurring(rule.id, payload)
      toast({ message: `Updated “${payload.name}”.`, tone: 'success' })
    } else {
      actions.addRecurring({ ...payload, active: true })
      toast({
        message: `“${payload.name}” will repeat ${FREQUENCY_LABELS[
          payload.frequency
        ].toLowerCase()} from ${format.dateShort(payload.startDate)}.`,
        tone: 'success',
        action: { label: 'Undo', onClick: actions.undo },
      })
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? 'Edit schedule' : 'New recurring transaction'}
      description={
        rule
          ? 'Changes apply to future occurrences only.'
          : 'Occurrences on or before today are posted immediately.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="recurring-form">
            {rule ? 'Save schedule' : 'Create schedule'}
          </Button>
        </>
      }
    >
      <form id="recurring-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <SegmentedControl
          name="rule-type"
          label="Schedule type"
          value={form.type}
          onChange={(value) => update('type', value)}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfer' },
          ]}
        />

        {isTransfer ? (
          <p className="rounded-lg border border-line bg-surface-muted/50 px-3 py-2 text-xs text-muted">
            A recurring transfer — a savings sweep or a card payment — moves money between your own
            accounts on schedule. It is never counted as income or spending.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            htmlFor="rule-name"
            error={errors.name}
            required
            className="sm:col-span-2"
          >
            <Input
              id="rule-name"
              data-autofocus
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Rent — Fillmore St"
              invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'rule-name-error' : undefined}
            />
          </Field>

          <Field label="Amount" htmlFor="rule-amount" error={errors.amount} required>
            <Input
              id="rule-amount"
              inputMode="decimal"
              value={form.amount}
              prefix={format.symbol}
              onChange={(e) => update('amount', e.target.value)}
              placeholder="0.00"
              invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? 'rule-amount-error' : undefined}
            />
          </Field>

          <Field label="Frequency" htmlFor="rule-frequency">
            <Select
              id="rule-frequency"
              value={form.frequency}
              onChange={(e) => update('frequency', e.target.value as Frequency)}
            >
              {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={rule ? 'Schedule anchor' : 'First occurrence'}
            htmlFor="rule-startDate"
            error={errors.startDate}
            required
          >
            <Input
              id="rule-startDate"
              type="date"
              value={form.startDate}
              onChange={(e) => update('startDate', e.target.value)}
              invalid={Boolean(errors.startDate)}
              aria-describedby={errors.startDate ? 'rule-startDate-error' : undefined}
            />
          </Field>

          {isTransfer ? null : (
            <Field label="Category" htmlFor="rule-categoryId" error={errors.categoryId} required>
              <Select
                id="rule-categoryId"
                value={form.categoryId}
                onChange={(e) => update('categoryId', e.target.value)}
                invalid={Boolean(errors.categoryId)}
                aria-describedby={errors.categoryId ? 'rule-categoryId-error' : undefined}
              >
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field
            label={isTransfer ? 'From account' : 'Account'}
            htmlFor="rule-accountId"
            error={errors.accountId}
            required
          >
            <Select
              id="rule-accountId"
              value={form.accountId}
              onChange={(e) => update('accountId', e.target.value)}
              invalid={Boolean(errors.accountId)}
              aria-describedby={errors.accountId ? 'rule-accountId-error' : undefined}
            >
              <option value="">Select an account</option>
              {openAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          {isTransfer ? (
            <Field
              label="To account"
              htmlFor="rule-toAccountId"
              error={errors.toAccountId}
              required
              hint={destinations.length === 0 ? 'Add a second account to schedule a transfer.' : undefined}
            >
              <Select
                id="rule-toAccountId"
                value={form.toAccountId}
                onChange={(e) => update('toAccountId', e.target.value)}
                invalid={Boolean(errors.toAccountId)}
                disabled={destinations.length === 0}
                aria-describedby={
                  errors.toAccountId ? 'rule-toAccountId-error' : 'rule-toAccountId-hint'
                }
              >
                <option value="">Select an account</option>
                {destinations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Notes" htmlFor="rule-notes" className="sm:col-span-2">
            <Textarea
              id="rule-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Optional context copied onto each posted transaction."
            />
          </Field>
        </div>
      </form>
    </Modal>
  )
}
