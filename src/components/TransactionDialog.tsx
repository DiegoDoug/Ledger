import { useEffect, useMemo, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Checkbox, Field, Input, SegmentedControl, Select, Textarea } from './ui/Field'
import { useLedger } from '../data/store'
import { useToast } from './ui/Toast'
import { useFormat } from '../lib/format'
import { todayIso } from '../domain/dates'
import { formatMoney, parseAmountToCents } from '../domain/money'
import { FREQUENCY_LABELS, advance } from '../domain/recurring'
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_NOTES_LENGTH,
  normaliseDraft,
  validateTransaction,
} from '../domain/validation'
import type { TransactionDraft, ValidationErrors } from '../domain/validation'
import type { Frequency, RecurringTransaction, Transaction, TransactionType } from '../domain/types'

export interface TransactionDialogProps {
  open: boolean
  onClose: () => void
  /** Present when editing; absent when creating. */
  transaction?: Transaction | null
  /** Pre-fills a new transaction, e.g. from an account page. */
  defaults?: Partial<
    Pick<Transaction, 'type' | 'accountId' | 'toAccountId' | 'categoryId' | 'date'>
  >
}

interface FormState {
  description: string
  amount: string
  type: TransactionType
  categoryId: string
  accountId: string
  toAccountId: string
  date: string
  notes: string
  repeat: boolean
  frequency: Frequency
}

/** Form-only errors live alongside the domain's field errors. */
type Errors = ValidationErrors & { notes?: string }

export function TransactionDialog({
  open,
  onClose,
  transaction,
  defaults,
}: TransactionDialogProps) {
  const { data, actions } = useLedger()
  const toast = useToast()
  const format = useFormat()
  const isEdit = Boolean(transaction)

  const [form, setForm] = useState<FormState>(() => initialState(data, transaction, defaults))
  const [errors, setErrors] = useState<Errors>({})
  const [submitted, setSubmitted] = useState(false)

  // Reset whenever the dialog opens so a previous edit never leaks in.
  useEffect(() => {
    if (!open) return
    setForm(initialState(data, transaction, defaults))
    setErrors({})
    setSubmitted(false)
    // `data` is intentionally excluded: re-seeding the form on every store
    // change would discard what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction])

  const isTransfer = form.type === 'transfer'
  const openAccounts = useMemo(
    () => data.accounts.filter((a) => !a.archived),
    [data.accounts],
  )
  const categories = useMemo(
    () => (isTransfer ? [] : data.categories.filter((c) => c.type === form.type)),
    [data.categories, form.type, isTransfer],
  )

  const parsedAmount = parseAmountToCents(form.amount)
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialState(data, transaction, defaults)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, transaction],
  )

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'type') {
        const nextType = value as TransactionType
        if (nextType === 'transfer') {
          // A transfer has no category, and needs a destination that is not the
          // source — default to the first other open account.
          next.categoryId = ''
          if (!next.toAccountId || next.toAccountId === next.accountId) {
            next.toAccountId =
              data.accounts.find((a) => !a.archived && a.id !== next.accountId)?.id ?? ''
          }
        } else {
          next.toAccountId = ''
          const pool = data.categories.filter((c) => c.type === nextType)
          if (!pool.some((c) => c.id === current.categoryId)) {
            next.categoryId = pool[0]?.id ?? ''
          }
        }
      }
      // Moving money to the account it came from is not a transfer.
      if (key === 'accountId' && next.type === 'transfer' && next.toAccountId === value) {
        next.toAccountId =
          data.accounts.find((a) => !a.archived && a.id !== value)?.id ?? ''
      }
      return next
    })
    if (submitted) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function toDraft(state: FormState): TransactionDraft {
    const draft: TransactionDraft = {
      description: state.description,
      amount: state.amount.trim() === '' ? null : parseAmountToCents(state.amount),
      type: state.type,
      categoryId: state.type === 'transfer' ? null : state.categoryId || null,
      accountId: state.accountId,
      date: state.date,
      notes: state.notes,
    }
    if (state.type === 'transfer') draft.toAccountId = state.toAccountId
    return draft
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)

    const draft = toDraft(form)
    const nextErrors: Errors = validateTransaction(draft, {
      accounts: data.accounts,
      categories: data.categories,
    })
    if (form.notes.length > MAX_NOTES_LENGTH) {
      nextErrors.notes = `Notes are limited to ${MAX_NOTES_LENGTH} characters.`
    }
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      // Move the user straight to the first problem.
      const firstKey = Object.keys(nextErrors)[0]
      document.getElementById(`tx-${firstKey}`)?.focus()
      return
    }

    const payload = normaliseDraft(draft)

    if (transaction) {
      actions.updateTransaction(transaction.id, payload)
      toast({
        message: `Updated “${payload.description}”.`,
        tone: 'success',
        action: { label: 'Undo', onClick: actions.undo },
      })
    } else {
      actions.addTransaction(payload)
      if (form.repeat) {
        const rule: Omit<RecurringTransaction, 'id'> = {
          name: payload.description,
          amount: payload.amount,
          type: payload.type,
          categoryId: payload.categoryId,
          accountId: payload.accountId,
          frequency: form.frequency,
          // Start the schedule at the *next* occurrence: this transaction is
          // the first one and has already been recorded.
          startDate: advance(form.date, form.frequency),
          active: true,
          notes: payload.notes,
        }
        if (payload.toAccountId) rule.toAccountId = payload.toAccountId
        actions.addRecurring(rule)
      }
      toast({
        message: `Added ${formatMoney(payload.amount, {
          currency: format.currency,
          locale: format.locale,
        })} — ${payload.description}${
          form.repeat ? `, repeating ${FREQUENCY_LABELS[form.frequency].toLowerCase()}` : ''
        }.`,
        tone: 'success',
        action: { label: 'Undo', onClick: actions.undo },
      })
    }
    onClose()
  }

  const destinationOptions = openAccounts.filter((a) => a.id !== form.accountId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit transaction' : 'New transaction'}
      description={
        isEdit
          ? 'Changes apply immediately and can be undone.'
          : 'Record income, an expense, or a transfer between your accounts.'
      }
      confirmOnDismiss={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="transaction-form">
            {isEdit ? 'Save changes' : 'Add transaction'}
          </Button>
        </>
      }
    >
      <form id="transaction-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <SegmentedControl
          name="tx-type"
          label="Transaction type"
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
            A transfer moves money between your own accounts. It changes both balances but is not
            counted as income or spending, so it never affects your cash flow, budgets or savings
            rate.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Description"
            htmlFor="tx-description"
            error={errors.description}
            required
            className="sm:col-span-2"
          >
            <Input
              id="tx-description"
              data-autofocus
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder={isTransfer ? 'Move to savings' : 'Whole Foods Market'}
              maxLength={MAX_DESCRIPTION_LENGTH + 20}
              autoComplete="off"
              invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? 'tx-description-error' : undefined}
            />
          </Field>

          <Field
            label="Amount"
            htmlFor="tx-amount"
            error={errors.amount}
            required
            hint={
              parsedAmount && parsedAmount > 0
                ? formatMoney(parsedAmount, { currency: format.currency, locale: format.locale })
                : undefined
            }
          >
            <Input
              id="tx-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value)}
              placeholder="0.00"
              prefix={format.symbol}
              invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? 'tx-amount-error' : 'tx-amount-hint'}
            />
          </Field>

          <Field label="Date" htmlFor="tx-date" error={errors.date} required>
            <Input
              id="tx-date"
              type="date"
              value={form.date}
              onChange={(e) => update('date', e.target.value)}
              invalid={Boolean(errors.date)}
              aria-describedby={errors.date ? 'tx-date-error' : undefined}
            />
          </Field>

          {isTransfer ? null : (
            <Field label="Category" htmlFor="tx-categoryId" error={errors.categoryId} required>
              <Select
                id="tx-categoryId"
                value={form.categoryId}
                onChange={(e) => update('categoryId', e.target.value)}
                invalid={Boolean(errors.categoryId)}
                aria-describedby={errors.categoryId ? 'tx-categoryId-error' : undefined}
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
            htmlFor="tx-accountId"
            error={errors.accountId}
            required
          >
            <Select
              id="tx-accountId"
              value={form.accountId}
              onChange={(e) => update('accountId', e.target.value)}
              invalid={Boolean(errors.accountId)}
              aria-describedby={errors.accountId ? 'tx-accountId-error' : undefined}
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
              htmlFor="tx-toAccountId"
              error={errors.toAccountId}
              required
              hint={
                destinationOptions.length === 0
                  ? 'Add a second account to record a transfer.'
                  : undefined
              }
            >
              <Select
                id="tx-toAccountId"
                value={form.toAccountId}
                onChange={(e) => update('toAccountId', e.target.value)}
                invalid={Boolean(errors.toAccountId)}
                disabled={destinationOptions.length === 0}
                aria-describedby={
                  errors.toAccountId ? 'tx-toAccountId-error' : 'tx-toAccountId-hint'
                }
              >
                <option value="">Select an account</option>
                {destinationOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field
            label="Notes"
            htmlFor="tx-notes"
            error={errors.notes}
            hint="Optional — searchable alongside the description."
            className="sm:col-span-2"
          >
            <Textarea
              id="tx-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Split with Sam; reimbursed half."
              invalid={Boolean(errors.notes)}
              aria-describedby={errors.notes ? 'tx-notes-error' : 'tx-notes-hint'}
            />
          </Field>
        </div>

        {!isEdit ? (
          <div className="rounded-lg border border-line bg-surface-muted/50 p-3">
            <Checkbox
              label="Repeat this transaction"
              description="Creates a schedule that posts future occurrences automatically."
              checked={form.repeat}
              onChange={(e) => update('repeat', e.target.checked)}
            />
            {form.repeat ? (
              <div className="mt-3 max-w-[14rem]">
                <Field label="Frequency" htmlFor="tx-frequency">
                  <Select
                    id="tx-frequency"
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
              </div>
            ) : null}
          </div>
        ) : transaction?.recurringId ? (
          <p className="rounded-lg border border-line bg-surface-muted/50 p-3 text-xs text-muted">
            This transaction was posted by a recurring schedule. Editing it changes only this
            occurrence — update the rule on the Recurring page to change future ones.
          </p>
        ) : null}
      </form>
    </Modal>
  )
}

function initialState(
  data: ReturnType<typeof useLedger>['data'],
  transaction?: Transaction | null,
  defaults?: TransactionDialogProps['defaults'],
): FormState {
  if (transaction) {
    return {
      description: transaction.description,
      amount: (transaction.amount / 100).toFixed(2),
      type: transaction.type,
      categoryId: transaction.categoryId ?? '',
      accountId: transaction.accountId,
      toAccountId: transaction.toAccountId ?? '',
      date: transaction.date,
      notes: transaction.notes ?? '',
      repeat: false,
      frequency: 'monthly',
    }
  }

  const type = defaults?.type ?? 'expense'
  const accountId = defaults?.accountId ?? data.accounts.find((a) => !a.archived)?.id ?? ''
  const toAccountId =
    defaults?.toAccountId ??
    (type === 'transfer'
      ? (data.accounts.find((a) => !a.archived && a.id !== accountId)?.id ?? '')
      : '')

  return {
    description: '',
    amount: '',
    type,
    categoryId:
      type === 'transfer'
        ? ''
        : (defaults?.categoryId ?? data.categories.find((c) => c.type === type)?.id ?? ''),
    accountId,
    toAccountId,
    date: defaults?.date ?? todayIso(),
    notes: '',
    repeat: false,
    frequency: 'monthly',
  }
}
