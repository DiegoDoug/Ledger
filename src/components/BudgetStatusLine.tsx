import { Link } from 'react-router-dom'
import { Badge } from './ui/Primitives'
import { useFormat } from '../lib/format'
import { plural } from '../lib/plural'
import { BUDGET_STATUS_LABELS } from '../domain/calculations'
import type { BudgetHealth } from '../domain/calculations'

/**
 * One-line budget status, used anywhere budgeting is a secondary concern
 * (Dashboard, Analytics). Budgets itself is the only screen that owns a full
 * empty state and the actual setup flow — every other surface routes there
 * instead of repeating it.
 */
export function BudgetStatusLine({
  health,
  monthLabel,
}: {
  health: BudgetHealth | null
  monthLabel: string
}) {
  const format = useFormat()

  if (!health || health.count === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-line bg-surface-muted/40 px-3 py-2.5">
        <span className="text-[13px] text-muted">No budgets set for {monthLabel}.</span>
        <Link
          to="/budgets"
          className="shrink-0 rounded text-xs font-medium text-accent-text hover:underline"
        >
          Set up a budget →
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Badge
          tone={
            health.status === 'over' ? 'negative' : health.status === 'warning' ? 'warning' : 'positive'
          }
        >
          {BUDGET_STATUS_LABELS[health.status]}
        </Badge>
        <span className="tnum truncate text-[12px] text-muted">
          {format.money(health.spent)}
          <span aria-hidden="true"> / </span>
          <span className="sr-only"> of </span>
          {format.money(health.limit)}
          {health.overCount > 0 ? ` · ${plural(health.overCount, 'category', 'categories')} over` : ''}
        </span>
      </div>
      <Link
        to="/budgets"
        className="shrink-0 rounded text-xs font-medium text-accent-text hover:underline"
      >
        Budgets →
      </Link>
    </div>
  )
}
