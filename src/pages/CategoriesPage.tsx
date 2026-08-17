import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Field, Input, SegmentedControl, Select } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { Badge, CategoryDot, EmptyState, SectionTitle } from '../components/ui/Primitives'
import { Disclosure } from '../components/ui/Disclosure'
import { Menu } from '../components/ui/Menu'
import { useLedger } from '../data/store'
import { useToast } from '../components/ui/Toast'
import { useFormat } from '../lib/format'
import { categoryTotals, countByCategory, transactionsInMonth } from '../domain/calculations'
import { PALETTE, pickDefaultColor } from '../domain/categoryColor'
import { monthKey, todayIso } from '../domain/dates'
import { IconPlus, IconTag } from '../components/icons'
import { plural } from '../lib/plural'
import type { Category, CategoryType } from '../domain/types'

export function CategoriesPage() {
  const { data, actions } = useLedger()
  const format = useFormat()
  const toast = useToast()
  const navigate = useNavigate()
  const currentMonth = monthKey(todayIso())

  const [editing, setEditing] = useState<Category | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const usage = useMemo(() => countByCategory(data.transactions), [data.transactions])
  const monthTotals = useMemo(() => {
    const month = transactionsInMonth(data.transactions, currentMonth)
    return new Map([
      ...categoryTotals(month, data.categories, 'expense').map(
        (c) => [c.categoryId, c.amount] as const,
      ),
      ...categoryTotals(month, data.categories, 'income').map(
        (c) => [c.categoryId, c.amount] as const,
      ),
    ])
  }, [data.transactions, data.categories, currentMonth])

  const groups: Array<{ type: CategoryType; title: string; description: string }> = [
    { type: 'expense', title: 'Spending', description: 'Where money goes.' },
    { type: 'income', title: 'Income', description: 'Where money comes from.' },
  ]

  return (
    <>
      <PageHeader
        title="Categories"
        description="Categories group your income and spending. Transfers between your own accounts are never categorised."
        actions={
          <Button variant="primary" onClick={() => setEditing(null)}>
            <IconPlus className="h-3.5 w-3.5" />
            New category
          </Button>
        }
      />

      {data.categories.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconTag className="h-4 w-4" />}
            title="No categories"
            description="Add categories so your spending can be broken down and budgeted."
            action={
              <Button variant="primary" onClick={() => setEditing(null)}>
                <IconPlus className="h-3.5 w-3.5" />
                Add a category
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const rows = data.categories.filter((c) => c.type === group.type)
            const usedRows = rows.filter((c) => (usage.get(c.id) ?? 0) > 0)
            const unusedRows = rows.filter((c) => (usage.get(c.id) ?? 0) === 0)

            const renderRow = (category: Category) => {
              const count = usage.get(category.id) ?? 0
              const spent = monthTotals.get(category.id) ?? 0
              const budgets = data.budgets.filter((b) => b.categoryId === category.id)
              return (
                <li
                  key={category.id}
                  className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
                >
                  <CategoryDot color={category.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{category.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {count === 0 ? 'Not used yet' : plural(count, 'transaction')}
                      {budgets.length > 0 ? ' · budgeted' : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-[13px] font-semibold text-ink">
                      {format.money(spent)}
                    </p>
                    <p className="text-[11px] text-subtle">This month</p>
                  </div>
                  <Menu
                    label={`Actions for ${category.name}`}
                    items={[
                      {
                        label: 'View transactions',
                        onSelect: () => navigate(`/transactions?category=${category.id}`),
                      },
                      { label: 'Rename or recolour', onSelect: () => setEditing(category) },
                      {
                        label: 'Delete',
                        destructive: true,
                        onSelect: () => setDeleting(category),
                      },
                    ]}
                  />
                </li>
              )
            }

            return (
              <section key={group.type}>
                <SectionTitle className="mb-2">
                  {group.title} · {plural(rows.length, 'category', 'categories')}
                </SectionTitle>
                <Card>
                  <CardHeader title={group.title} description={group.description} />
                  {rows.length === 0 ? (
                    <EmptyState
                      compact
                      title={`No ${group.title.toLowerCase()} categories`}
                      action={
                        <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                          Add one
                        </Button>
                      }
                    />
                  ) : (
                    <>
                      {usedRows.length > 0 ? <ul>{usedRows.map(renderRow)}</ul> : null}
                      {unusedRows.length > 0 ? (
                        <Disclosure
                          label={`${plural(unusedRows.length, 'unused category', 'unused categories')}`}
                          className="border-t border-line px-2"
                        >
                          <ul>{unusedRows.map(renderRow)}</ul>
                        </Disclosure>
                      ) : null}
                    </>
                  )}
                </Card>
              </section>
            )
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-subtle">
        A category's direction cannot change once created — an income category can never categorise
        spending, which is what keeps the breakdowns trustworthy. Create a new one instead.
      </p>

      {editing !== undefined ? (
        <CategoryDialog category={editing} onClose={() => setEditing(undefined)} />
      ) : null}

      {deleting ? (
        <DeleteCategoryDialog
          category={deleting}
          usageCount={usage.get(deleting.id) ?? 0}
          onClose={() => setDeleting(null)}
          onDeleted={(message) => {
            toast({ message, action: { label: 'Undo', onClick: actions.undo } })
            setDeleting(null)
          }}
        />
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Create / edit                                                       */
/* ------------------------------------------------------------------ */

function CategoryDialog({
  category,
  onClose,
}: {
  category: Category | null
  onClose: () => void
}) {
  const { data, actions } = useLedger()
  const toast = useToast()

  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<CategoryType>(category?.type ?? 'expense')
  const [color, setColor] = useState(() => category?.color ?? pickDefaultColor(data.categories, type))
  const [error, setError] = useState<string | undefined>()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the category a name.')
      return
    }
    if (trimmed.length > 40) {
      setError('Keep the name under 40 characters.')
      return
    }
    // Two categories of the same direction with the same name would be
    // indistinguishable in every picker and every breakdown.
    const clash = data.categories.some(
      (c) =>
        c.id !== category?.id &&
        c.type === type &&
        c.name.trim().toLowerCase() === trimmed.toLowerCase(),
    )
    if (clash) {
      setError(`You already have a ${type} category called “${trimmed}”.`)
      return
    }

    if (category) {
      actions.updateCategory(category.id, { name: trimmed, color })
      toast({ message: `Updated ${trimmed}.`, tone: 'success' })
    } else {
      actions.addCategory({ name: trimmed, type, color })
      toast({
        message: `Added ${trimmed}.`,
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
      title={category ? 'Edit category' : 'New category'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="category-form">
            {category ? 'Save category' : 'Add category'}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {category ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-muted/50 px-3 py-2">
            <span className="text-[13px] text-muted">Direction</span>
            <Badge tone={category.type === 'income' ? 'positive' : 'neutral'}>
              {category.type === 'income' ? 'Income' : 'Spending'}
            </Badge>
          </div>
        ) : (
          <SegmentedControl
            name="category-type"
            label="Direction"
            value={type}
            onChange={(value) => {
              setType(value)
              // A fresh direction has its own set of colours already in use.
              setColor(pickDefaultColor(data.categories, value))
            }}
            options={[
              { value: 'expense', label: 'Spending' },
              { value: 'income', label: 'Income' },
            ]}
          />
        )}

        <Field label="Name" htmlFor="category-name" error={error} required>
          <Input
            id="category-name"
            data-autofocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(undefined)
            }}
            placeholder={type === 'income' ? 'Freelance' : 'Groceries'}
            maxLength={60}
            invalid={Boolean(error)}
            aria-describedby={error ? 'category-name-error' : undefined}
          />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted">Chart colour</legend>
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((option) => (
              <label
                key={option}
                className="cursor-pointer rounded-md p-1 has-[:checked]:ring-2 has-[:checked]:ring-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
              >
                <input
                  type="radio"
                  name="category-color"
                  value={option}
                  checked={color === option}
                  onChange={() => setColor(option)}
                  className="sr-only absolute h-px w-px"
                />
                <span className="sr-only">Colour {option.replace('viz-', '')}</span>
                <span
                  aria-hidden="true"
                  className="block h-5 w-5 rounded"
                  style={{ backgroundColor: `var(--ink-${option})` }}
                />
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-subtle">
            Used in charts alongside the name — never on its own.
          </p>
        </fieldset>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Delete, with reassignment                                           */
/* ------------------------------------------------------------------ */

/**
 * A category in use cannot simply vanish — every transaction referencing it
 * would silently drop out of the breakdowns. Deleting one therefore requires
 * choosing where its transactions go.
 */
function DeleteCategoryDialog({
  category,
  usageCount,
  onClose,
  onDeleted,
}: {
  category: Category
  usageCount: number
  onClose: () => void
  onDeleted: (message: string) => void
}) {
  const { data, actions } = useLedger()

  const alternatives = data.categories.filter(
    (c) => c.id !== category.id && c.type === category.type,
  )
  const [replacementId, setReplacementId] = useState(alternatives[0]?.id ?? '')
  const [error, setError] = useState<string | undefined>()

  const budgetCount = data.budgets.filter((b) => b.categoryId === category.id).length
  const ruleCount = data.recurring.filter((r) => r.categoryId === category.id).length
  const inUse = usageCount > 0 || ruleCount > 0

  function handleDelete() {
    if (inUse && !replacementId) {
      setError('Choose a category to move these transactions to.')
      return
    }
    actions.deleteCategory(category.id, { replacementId: inUse ? replacementId : null })
    const replacement = data.categories.find((c) => c.id === replacementId)
    onDeleted(
      inUse
        ? `Deleted ${category.name} and moved ${plural(usageCount, 'transaction')} to ${replacement?.name}.`
        : `Deleted ${category.name}.`,
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${category.name}?`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleDelete}
            disabled={inUse && alternatives.length === 0}
            className="bg-negative hover:bg-negative"
          >
            Delete category
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!inUse ? (
          <p className="text-[13px] leading-relaxed text-muted">
            Nothing references this category, so it can be removed safely.
            {budgetCount > 0
              ? ` Its ${plural(budgetCount, 'budget')} will be removed too.`
              : ''}
          </p>
        ) : alternatives.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-negative">
            {plural(usageCount, 'transaction')} {usageCount === 1 ? 'uses' : 'use'} this category
            and there is no other {category.type} category to move them to. Create one first, then
            delete this.
          </p>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-muted">
              {plural(usageCount, 'transaction')}
              {ruleCount > 0 ? ` and ${plural(ruleCount, 'recurring schedule')}` : ''}{' '}
              {usageCount === 1 && ruleCount === 0 ? 'uses' : 'use'} this category. Choose where
              they should go — nothing is deleted or left uncategorised.
            </p>
            <Field
              label="Move transactions to"
              htmlFor="category-replacement"
              error={error}
              required
            >
              <Select
                id="category-replacement"
                data-autofocus
                value={replacementId}
                onChange={(e) => {
                  setReplacementId(e.target.value)
                  setError(undefined)
                }}
                invalid={Boolean(error)}
                aria-describedby={error ? 'category-replacement-error' : undefined}
              >
                {alternatives.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {budgetCount > 0 ? (
              <p className="text-xs text-muted">
                Its {plural(budgetCount, 'budget')} will move to the replacement category.
              </p>
            ) : null}
          </>
        )}
        <p className="text-xs text-subtle">This can be undone straight afterwards.</p>
      </div>
    </Modal>
  )
}
