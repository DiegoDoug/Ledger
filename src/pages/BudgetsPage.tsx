import { useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Field, Input, Select } from '../components/ui/Field'
import { Modal, ConfirmDialog } from '../components/ui/Modal'
import { Badge, CategoryDot, EmptyState, ProgressBar } from '../components/ui/Primitives'
import { Menu } from '../components/ui/Menu'
import { StatCard } from '../components/StatCard'
import { useLedger } from '../data/store'
import { useToast } from '../components/ui/Toast'
import { useFormat } from '../lib/format'
import {
  BUDGET_STATUS_LABELS,
  budgetProgress,
  type BudgetProgress,
} from '../domain/calculations'
import { addMonthsToKey, formatMonthLabel, monthKey, todayIso } from '../domain/dates'
import { formatMoney, parseAmountToCents } from '../domain/money'
import { IconBudget, IconPlus } from '../components/icons'
import { cn } from '../lib/cn'
import { plural } from '../lib/plural'
import type { Budget } from '../domain/types'

/**
 * Labels come from the domain so the dashboard, analytics and this page can
 * never disagree about what "approaching limit" means. Only the tone is a
 * presentation concern, and it is always paired with the text — never alone.
 */
const STATUS_COPY = {
  healthy: { label: BUDGET_STATUS_LABELS.healthy, tone: 'positive' as const },
  warning: { label: BUDGET_STATUS_LABELS.warning, tone: 'warning' as const },
  over: { label: BUDGET_STATUS_LABELS.over, tone: 'negative' as const },
}

export function BudgetsPage() {
  const { data, actions } = useLedger()
  const format = useFormat()
  const toast = useToast()
  const currentMonth = monthKey(todayIso())

  const [month, setMonth] = useState(currentMonth)
  const [editing, setEditing] = useState<Budget | null | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<BudgetProgress | null>(null)

  const progress = useMemo(
    () => budgetProgress(data.budgets, data.transactions, data.categories, month),
    [data.budgets, data.transactions, data.categories, month],
  )

  const overall = progress.find((p) => p.budget.categoryId === null) ?? null
  const perCategory = progress.filter((p) => p.budget.categoryId !== null)
  const totalLimit = perCategory.reduce((sum, p) => sum + p.limit, 0)
  const totalSpent = perCategory.reduce((sum, p) => sum + p.spent, 0)
  const overCount = progress.filter((p) => p.status === 'over').length

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Monthly caps for your overall spending and individual categories. Progress is recalculated from your transactions."
        actions={
          <>
            <div className="min-w-[10rem]">
              <label htmlFor="budget-month" className="sr-only absolute h-px w-px overflow-hidden">
                Budget month
              </label>
              <Select
                id="budget-month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              >
                {monthOptions(currentMonth).map((key) => (
                  <option key={key} value={key}>
                    {formatMonthLabel(key)}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="primary" onClick={() => setEditing(null)}>
              <IconPlus className="h-3.5 w-3.5" />
              New budget
            </Button>
          </>
        }
      />

      {progress.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconBudget className="h-4 w-4" />}
            title={`No budgets for ${formatMonthLabel(month)}`}
            description="Create a monthly cap for your total spending, or set separate limits per category to keep the big ones in check."
            action={
              <Button variant="primary" onClick={() => setEditing(null)}>
                <IconPlus className="h-3.5 w-3.5" />
                Create your first budget
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <section aria-label="Budget summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Category budgets"
              value={format.money(totalLimit)}
              meta={<p className="text-xs text-muted">{plural(perCategory.length, 'category', 'categories')} tracked</p>}
            />
            <StatCard
              label="Spent against them"
              value={format.money(totalSpent)}
              meta={
                <p className="text-xs text-muted">
                  {totalLimit > 0
                    ? `${format.percent((totalSpent / totalLimit) * 100, 0)} of allocated`
                    : 'No allocation set'}
                </p>
              }
            />
            <StatCard
              label="Needing attention"
              value={String(overCount)}
              tone={overCount > 0 ? 'negative' : 'default'}
              meta={
                <p className="text-xs text-muted">
                  {overCount === 0 ? 'Everything within limits' : 'Budgets exceeded this month'}
                </p>
              }
            />
          </section>

          {overall ? (
            <Card className="mt-4">
              <CardHeader
                title="Overall monthly spending"
                description="Every expense in the month counts towards this cap."
                actions={
                  <Menu
                    label="Overall budget actions"
                    items={[
                      { label: 'Edit', onSelect: () => setEditing(overall.budget) },
                      {
                        label: 'Delete',
                        destructive: true,
                        onSelect: () => setPendingDelete(overall),
                      },
                    ]}
                  />
                }
              />
              <CardBody>
                <BudgetMeter progress={overall} large />
              </CardBody>
            </Card>
          ) : null}

          <Card className="mt-4">
            <CardHeader
              title="Category budgets"
              description={formatMonthLabel(month)}
            />
            {perCategory.length === 0 ? (
              <EmptyState
                compact
                title="No category budgets"
                description="Add one to track a specific area of spending, like groceries or travel."
                action={
                  <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                    Add a category budget
                  </Button>
                }
              />
            ) : (
              <ul>
                {perCategory.map((item) => (
                  <li
                    key={item.budget.id}
                    className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <BudgetMeter progress={item} />
                    </div>
                    <Menu
                      label={`Actions for the ${item.name} budget`}
                      items={[
                        { label: 'Edit', onSelect: () => setEditing(item.budget) },
                        {
                          label: 'Delete',
                          destructive: true,
                          onSelect: () => setPendingDelete(item),
                        },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {editing !== undefined ? (
        <BudgetDialog
          budget={editing}
          month={month}
          onClose={() => setEditing(undefined)}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this budget?"
        message={
          <>
            The <strong className="font-medium text-ink">{pendingDelete?.name}</strong> budget will
            be removed. Your transactions are not affected.
          </>
        }
        confirmLabel="Delete budget"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          actions.deleteBudget(pendingDelete.budget.id)
          toast({
            message: `Deleted the ${pendingDelete.name} budget.`,
            action: { label: 'Undo', onClick: actions.undo },
          })
          setPendingDelete(null)
        }}
      />
    </>
  )
}

/** Amount, progress meter and status — the status is stated, never colour-only. */
function BudgetMeter({ progress, large = false }: { progress: BudgetProgress; large?: boolean }) {
  const format = useFormat()
  const status = STATUS_COPY[progress.status]
  const over = progress.remaining < 0

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          {progress.category ? <CategoryDot color={progress.category.color} /> : null}
          <span className={cn('font-medium text-ink', large ? 'text-sm' : 'text-[13px]')}>
            {progress.name}
          </span>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <span className="tnum text-[13px] text-muted">
          <strong className="font-semibold text-ink">{format.money(progress.spent)}</strong>
          {' of '}
          {format.money(progress.limit)}
        </span>
      </div>

      <ProgressBar
        value={progress.utilization}
        size={large ? 'md' : 'sm'}
        label={`${progress.name}: ${Math.round(progress.utilization)} percent of budget used`}
        tone={
          progress.status === 'over' ? 'negative' : progress.status === 'warning' ? 'warning' : 'accent'
        }
      />

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 text-[11px]">
        <span className="tnum text-muted">
          {format.percent(progress.utilization, 0)} used
        </span>
        <span className={cn('tnum', over ? 'font-medium text-negative' : 'text-muted')}>
          {over
            ? `${format.money(Math.abs(progress.remaining))} over`
            : `${format.money(progress.remaining)} left`}
        </span>
      </div>
    </div>
  )
}

function BudgetDialog({
  budget,
  month,
  onClose,
}: {
  budget: Budget | null
  month: string
  onClose: () => void
}) {
  const { data, actions } = useLedger()
  const format = useFormat()
  const toast = useToast()

  const [categoryId, setCategoryId] = useState<string>(budget?.categoryId ?? '')
  const [amount, setAmount] = useState(budget ? (budget.amount / 100).toFixed(2) : '')
  const [error, setError] = useState<string | null>(null)

  const expenseCategories = data.categories.filter((c) => c.type === 'expense')
  const takenIds = new Set(
    data.budgets
      .filter((b) => !b.archived && b.id !== budget?.id)
      .map((b) => b.categoryId ?? '__overall__'),
  )

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const cents = parseAmountToCents(amount)
    if (cents === null || amount.trim() === '') {
      setError('Enter a budget amount.')
      return
    }
    if (cents <= 0) {
      setError('A budget must be greater than zero.')
      return
    }
    const key = categoryId || '__overall__'
    if (takenIds.has(key)) {
      setError(
        categoryId
          ? 'That category already has a budget. Edit the existing one instead.'
          : 'An overall monthly budget already exists.',
      )
      return
    }

    const name = categoryId
      ? (expenseCategories.find((c) => c.id === categoryId)?.name ?? 'Category')
      : 'Overall monthly'

    if (budget) {
      actions.updateBudget(budget.id, { amount: cents, categoryId: categoryId || null })
      toast({ message: `Updated the ${name} budget.`, tone: 'success' })
    } else {
      actions.addBudget({ categoryId: categoryId || null, amount: cents, startMonth: month })
      toast({
        message: `Created a ${formatMoney(cents, {
          currency: format.currency,
          locale: format.locale,
        })} budget for ${name}.`,
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
      title={budget ? 'Edit budget' : 'New budget'}
      description={`Applies from ${formatMonthLabel(budget?.startMonth ?? month)} onward.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="budget-form">
            {budget ? 'Save budget' : 'Create budget'}
          </Button>
        </>
      }
    >
      <form id="budget-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field
          label="Scope"
          htmlFor="budget-category"
          hint="An overall budget counts every expense in the month."
        >
          <Select
            id="budget-category"
            value={categoryId}
            data-autofocus
            onChange={(e) => {
              setCategoryId(e.target.value)
              setError(null)
            }}
          >
            <option value="">Overall monthly spending</option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Monthly amount" htmlFor="budget-amount" error={error ?? undefined} required>
          <Input
            id="budget-amount"
            inputMode="decimal"
            value={amount}
            prefix={format.symbol}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
            placeholder="0.00"
            invalid={Boolean(error)}
            aria-describedby={error ? 'budget-amount-error' : undefined}
          />
        </Field>
      </form>
    </Modal>
  )
}

/** The current month plus the previous eleven, newest first. */
function monthOptions(current: string): string[] {
  return Array.from({ length: 12 }, (_, i) => addMonthsToKey(current, -i))
}
