import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Field'
import { Badge, DeltaTag, EmptyState, ProgressBar, SectionTitle } from '../components/ui/Primitives'
import { CashFlowChart } from '../components/charts/CashFlowChart'
import { Donut } from '../components/charts/Donut'
import { TransactionRow } from '../components/TransactionRow'
import { useLedger } from '../data/store'
import { useFormat } from '../lib/format'
import { useUi } from '../App'
import {
  BUDGET_STATUS_LABELS,
  budgetHealth,
  budgetProgress,
  netWorth,
  percentChange,
  savingsRate,
} from '../domain/calculations'
import { buildReport, earliestDate, previousPeriod, resolvePeriod } from '../domain/analytics'
import type { PeriodId } from '../domain/analytics'
import { totals } from '../domain/calculations'
import { formatMonthLabel, monthKey, relativeDayLabel, todayIso } from '../domain/dates'
import { upcomingOccurrences } from '../domain/recurring'
import { IconInbox, IconPlus, IconRepeat } from '../components/icons'
import { cn } from '../lib/cn'
import { plural } from '../lib/plural'

/** The dashboard offers the useful subset — a custom range belongs in Analytics. */
const DASHBOARD_PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'last-3-months', label: 'Last 3 months' },
  { id: 'last-6-months', label: 'Last 6 months' },
  { id: 'this-year', label: 'This year' },
]

export function DashboardPage() {
  const { data } = useLedger()
  const format = useFormat()
  const ui = useUi()

  const today = todayIso()
  const currentMonth = monthKey(today)
  const [periodId, setPeriodId] = useState<PeriodId>('this-month')

  const view = useMemo(() => {
    const period = resolvePeriod(periodId, today, { earliest: earliestDate(data.transactions) })
    const report = buildReport(data.transactions, data.categories, period)

    const window = previousPeriod(period)
    const previous = totals(
      data.transactions.filter((t) => t.date >= window.from && t.date <= window.to),
    )

    // Budgets are monthly, so they report against the last month in view.
    const budgetMonth = period.months[period.months.length - 1] ?? currentMonth
    const budgets = budgetProgress(data.budgets, data.transactions, data.categories, budgetMonth)

    return {
      period,
      report,
      previous,
      position: netWorth(data.accounts, data.transactions),
      savings: savingsRate(report.income, report.expenses),
      previousSavings: savingsRate(previous.income, previous.expenses),
      // The chart always shows six months so the trend stays readable, whatever
      // period is selected for the figures above it.
      chart: buildReport(
        data.transactions,
        data.categories,
        resolvePeriod('last-6-months', today),
      ).monthly,
      recent: [...data.transactions]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 7),
      upcoming: upcomingOccurrences(data.recurring, today, 30),
      budgetMonth,
      budgets,
      health: budgetHealth(budgets),
    }
  }, [data, periodId, currentMonth, today])

  const hasHistory = data.transactions.length > 0
  const upcomingExpenses = view.upcoming.filter((o) => o.rule.type === 'expense')
  const upcomingTotal = upcomingExpenses.reduce((sum, o) => sum + o.rule.amount, 0)
  const activeAccounts = data.accounts.filter((a) => !a.archived).length
  const periodLabel =
    view.period.months.length === 1 ? formatMonthLabel(view.period.months[0]) : view.period.label

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Calculated from ${plural(data.transactions.length, 'recorded transaction')} across ${plural(
          activeAccounts,
          'account',
        )}.`}
        actions={
          <div className="flex items-center gap-2">
            <div className="min-w-[10.5rem]">
              <label
                htmlFor="dashboard-period"
                className="sr-only absolute h-px w-px overflow-hidden"
              >
                Reporting period
              </label>
              <Select
                id="dashboard-period"
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value as PeriodId)}
              >
                {DASHBOARD_PERIODS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="primary" onClick={() => ui.newTransaction()} className="sm:hidden">
              <IconPlus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>
        }
      />

      {!hasHistory ? (
        <Card className="mb-5">
          <EmptyState
            icon={<IconInbox className="h-4.5 w-4.5" />}
            title="Your ledger is empty"
            description="Add your first transaction and the dashboard will start reporting your balance, cash flow and spending patterns."
            action={
              <Button variant="primary" onClick={() => ui.newTransaction()}>
                <IconPlus className="h-3.5 w-3.5" />
                Add a transaction
              </Button>
            }
          />
        </Card>
      ) : null}

      <SectionTitle className="mb-2">Net position</SectionTitle>
      <section aria-label="Net position" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net worth"
          value={format.money(view.position.netWorth)}
          tone={view.position.netWorth < 0 ? 'negative' : 'default'}
          meta={<p className="text-xs text-muted">Assets minus liabilities</p>}
        />
        <StatCard
          label="Total balance"
          value={format.money(view.position.totalBalance)}
          tone={view.position.totalBalance < 0 ? 'negative' : 'default'}
          meta={<p className="text-xs text-muted">Spendable, excluding credit cards</p>}
        />
        <StatCard
          label="Assets"
          value={format.money(view.position.assets)}
          tone="positive"
          meta={<p className="text-xs text-muted">Everything you hold</p>}
        />
        <StatCard
          label="Liabilities"
          value={format.money(view.position.liabilities)}
          tone={view.position.liabilities > 0 ? 'negative' : 'default'}
          meta={<p className="text-xs text-muted">Everything you owe</p>}
        />
      </section>

      <SectionTitle className="mb-2 mt-5">Cash flow · {periodLabel}</SectionTitle>
      <section aria-label={`Cash flow for ${periodLabel}`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Income"
          value={format.money(view.report.income)}
          meta={
            <DeltaTag
              percent={percentChange(view.report.income, view.previous.income)}
              suffix="vs prior period"
            />
          }
        />
        <StatCard
          label="Expenses"
          value={format.money(view.report.expenses)}
          meta={
            <DeltaTag
              percent={percentChange(view.report.expenses, view.previous.expenses)}
              invert
              suffix="vs prior period"
            />
          }
        />
        <StatCard
          label="Net cash flow"
          value={format.money(view.report.net)}
          tone={view.report.net < 0 ? 'negative' : view.report.net > 0 ? 'positive' : 'default'}
          meta={
            <p className="text-xs text-muted">
              {view.report.net >= 0 ? 'Surplus' : 'Deficit'} for {periodLabel.toLowerCase()}
            </p>
          }
        />
        <StatCard
          label="Savings rate"
          value={view.report.income > 0 ? format.percent(view.savings) : '—'}
          tone={view.savings < 0 ? 'negative' : view.savings >= 20 ? 'positive' : 'default'}
          meta={
            view.report.income > 0 ? (
              <DeltaTag
                percent={view.previous.income > 0 ? view.savings - view.previousSavings : null}
                unit="pts"
                suffix="vs prior period"
              />
            ) : (
              <p className="text-xs text-muted">No income in this period</p>
            )
          }
        />
      </section>

      {view.report.transfers > 0 ? (
        <p className="mt-3 text-xs text-muted">
          {format.money(view.report.transfers)} moved between your own accounts in this period —
          excluded from income, expenses and your savings rate.
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Monthly cash flow"
            description="Income against expenses over the last six months."
            actions={
              <Link
                to="/analytics"
                className="rounded px-1.5 py-1 text-xs font-medium text-accent-text hover:bg-accent-soft"
              >
                Analytics →
              </Link>
            }
          />
          <CardBody>
            <CashFlowChart data={view.chart} currency={format.currency} locale={format.locale} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Spending by category" description={periodLabel} />
          <CardBody>
            {view.report.byCategory.length === 0 ? (
              <EmptyState
                compact
                title="No spending in this period"
                description="Expenses will break down by category here as soon as you record one."
              />
            ) : (
              <Donut
                data={view.report.byCategory}
                currency={format.currency}
                locale={format.locale}
                size={150}
                centerLabel="Spent"
              />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent transactions"
            description="The latest activity across every account."
            actions={
              <Link
                to="/transactions"
                className="rounded px-1.5 py-1 text-xs font-medium text-accent-text hover:bg-accent-soft"
              >
                View all →
              </Link>
            }
          />
          {view.recent.length === 0 ? (
            <EmptyState
              compact
              title="Nothing recorded yet"
              action={
                <Button variant="secondary" size="sm" onClick={() => ui.newTransaction()}>
                  Add a transaction
                </Button>
              }
            />
          ) : (
            <div>
              {view.recent.map((t) => (
                <TransactionRow key={t.id} transaction={t} compact />
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Upcoming in 30 days"
              description={
                upcomingExpenses.length > 0
                  ? `${format.money(upcomingTotal)} of scheduled payments`
                  : 'Scheduled payments and income'
              }
              actions={
                <Link
                  to="/recurring"
                  className="rounded px-1.5 py-1 text-xs font-medium text-accent-text hover:bg-accent-soft"
                >
                  Manage →
                </Link>
              }
            />
            {view.upcoming.length === 0 ? (
              <EmptyState
                compact
                icon={<IconRepeat className="h-4 w-4" />}
                title="Nothing scheduled"
                description="Recurring bills and income you set up will appear here before they are due."
              />
            ) : (
              <ul className="max-h-[19rem] overflow-y-auto scrollbar-thin">
                {view.upcoming.slice(0, 8).map((occurrence) => {
                  const { rule } = occurrence
                  const isTransfer = rule.type === 'transfer'
                  const category = rule.categoryId
                    ? data.categories.find((c) => c.id === rule.categoryId)
                    : undefined
                  const destination = rule.toAccountId
                    ? data.accounts.find((a) => a.id === rule.toAccountId)
                    : undefined

                  return (
                    <li
                      key={`${rule.id}-${occurrence.date}`}
                      className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{rule.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted">
                          {isTransfer
                            ? `Transfer to ${destination?.name ?? 'another account'}`
                            : (category?.name ?? 'Uncategorized')}{' '}
                          ·{' '}
                          <span
                            className={cn(occurrence.daysAway <= 3 && 'font-medium text-warning')}
                          >
                            {relativeDayLabel(occurrence.date, today)}
                          </span>
                        </p>
                      </div>
                      <span
                        className={cn(
                          'tnum shrink-0 text-[13px] font-semibold',
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
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Budget health"
              description={formatMonthLabel(view.budgetMonth)}
              actions={
                <Link
                  to="/budgets"
                  className="rounded px-1.5 py-1 text-xs font-medium text-accent-text hover:bg-accent-soft"
                >
                  Budgets →
                </Link>
              }
            />
            {view.budgets.length === 0 ? (
              <EmptyState
                compact
                title="No budgets yet"
                description="Set a monthly cap to track spending against a target."
                action={
                  <Link to="/budgets">
                    <Button variant="secondary" size="sm">
                      Create a budget
                    </Button>
                  </Link>
                }
              />
            ) : (
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
                  <Badge
                    tone={
                      view.health.status === 'over'
                        ? 'negative'
                        : view.health.status === 'warning'
                          ? 'warning'
                          : 'positive'
                    }
                  >
                    {BUDGET_STATUS_LABELS[view.health.status]}
                  </Badge>
                  <span className="tnum text-[11px] text-muted">
                    {format.money(view.health.spent)}
                    <span aria-hidden="true"> / </span>
                    <span className="sr-only"> of </span>
                    {format.money(view.health.limit)}
                    {view.health.overCount > 0
                      ? ` · ${plural(view.health.overCount, 'category')} over`
                      : ''}
                  </span>
                </div>
                {view.budgets.slice(0, 4).map((progress) => (
                  <div key={progress.budget.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] text-ink">{progress.name}</span>
                      <span className="tnum shrink-0 text-[11px] text-muted">
                        {format.money(progress.spent, { compact: true })}
                        <span aria-hidden="true"> / </span>
                        <span className="sr-only"> of </span>
                        {format.money(progress.limit, { compact: true })}
                      </span>
                    </div>
                    <ProgressBar
                      size="sm"
                      value={progress.utilization}
                      label={`${progress.name}: ${Math.round(progress.utilization)} percent of budget used, ${BUDGET_STATUS_LABELS[progress.status]}`}
                      tone={
                        progress.status === 'over'
                          ? 'negative'
                          : progress.status === 'warning'
                            ? 'warning'
                            : 'accent'
                      }
                    />
                  </div>
                ))}
                {view.budgets.length > 4 ? (
                  <p className="text-[11px] text-subtle">
                    {view.budgets.length - 4} more on the budgets page.
                  </p>
                ) : null}
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
