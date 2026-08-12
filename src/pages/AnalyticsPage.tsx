import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { StatCard } from '../components/StatCard'
import { DeltaTag, EmptyState, ProgressBar } from '../components/ui/Primitives'
import { CashFlowChart } from '../components/charts/CashFlowChart'
import { NetFlowChart } from '../components/charts/NetFlowChart'
import { TrendChart } from '../components/charts/TrendChart'
import { Donut } from '../components/charts/Donut'
import { Field, Input, Select } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { useLedger } from '../data/store'
import { useFormat } from '../lib/format'
import {
  PERIOD_OPTIONS,
  buildReport,
  categoryDeltas,
  earliestDate,
  previousPeriod,
  resolvePeriod,
  spendingTrend,
  type PeriodId,
} from '../domain/analytics'
import {
  BUDGET_STATUS_LABELS,
  budgetHealth,
  budgetProgress,
  percentChange,
  savingsRate,
  totals,
} from '../domain/calculations'
import { addMonthsToKey, formatMonthLabel, monthKey, todayIso } from '../domain/dates'
import { IconAnalytics } from '../components/icons'
import { plural } from '../lib/plural'

export function AnalyticsPage() {
  const { data } = useLedger()
  const format = useFormat()
  const navigate = useNavigate()
  const today = todayIso()

  const [periodId, setPeriodId] = useState<PeriodId>('last-6-months')
  const [customFrom, setCustomFrom] = useState(() => addMonthsToKey(monthKey(today), -2) + '-01')
  const [customTo, setCustomTo] = useState(today)

  const report = useMemo(() => {
    const period = resolvePeriod(periodId, today, {
      earliest: earliestDate(data.transactions),
      from: customFrom,
      to: customTo,
    })
    return buildReport(data.transactions, data.categories, period)
  }, [periodId, today, customFrom, customTo, data.transactions, data.categories])

  const previousTransactions = useMemo(() => {
    const window = previousPeriod(report.period)
    return data.transactions.filter((t) => t.date >= window.from && t.date <= window.to)
  }, [report.period, data.transactions])

  const comparison = useMemo(() => totals(previousTransactions), [previousTransactions])

  const movement = useMemo(
    () => categoryDeltas(report.transactions, previousTransactions, data.categories).slice(0, 6),
    [report.transactions, previousTransactions, data.categories],
  )

  // Budget performance across the months in view, so the figure matches the period.
  const budgetRows = useMemo(
    () =>
      report.period.months.map((month) => ({
        month,
        health: budgetHealth(budgetProgress(data.budgets, data.transactions, data.categories, month)),
      })),
    [report.period.months, data.budgets, data.transactions, data.categories],
  )
  const budgetedMonths = budgetRows.filter((row) => row.health.limit > 0)

  const trend = spendingTrend(report.monthly)
  const rate = savingsRate(report.income, report.expenses)
  const monthsWithActivity = report.monthly.filter((m) => m.count > 0).length

  if (data.transactions.length === 0) {
    return (
      <>
        <PageHeader title="Analytics" description="Spending patterns and cash flow over time." />
        <Card>
          <EmptyState
            icon={<IconAnalytics className="h-4 w-4" />}
            title="Nothing to analyse yet"
            description="Once you have recorded a few transactions, this page shows where your money goes and how that changes month to month."
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`${plural(report.transactionCount, 'transaction')} between ${format.date(
          report.period.from,
        )} and ${format.date(report.period.to)}.`}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[11rem]">
              <label htmlFor="period" className="sr-only absolute h-px w-px overflow-hidden">
                Reporting period
              </label>
              <Select
                id="period"
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value as PeriodId)}
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            {periodId === 'custom' ? (
              <>
                <Field label="From" htmlFor="period-from" className="w-[9.5rem]">
                  <Input
                    id="period-from"
                    type="date"
                    value={customFrom}
                    max={customTo}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </Field>
                <Field label="To" htmlFor="period-to" className="w-[9.5rem]">
                  <Input
                    id="period-to"
                    type="date"
                    value={customTo}
                    min={customFrom}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </Field>
              </>
            ) : null}
          </div>
        }
      />

      <section aria-label="Period summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Income"
          value={format.money(report.income)}
          meta={<DeltaTag percent={percentChange(report.income, comparison.income)} />}
        />
        <StatCard
          label="Expenses"
          value={format.money(report.expenses)}
          meta={<DeltaTag percent={percentChange(report.expenses, comparison.expenses)} invert />}
        />
        <StatCard
          label="Net cash flow"
          value={format.money(report.net)}
          tone={report.net < 0 ? 'negative' : report.net > 0 ? 'positive' : 'default'}
          meta={
            <p className="text-xs text-muted">
              Average {format.money(report.averageMonthlySpend)} spent per month
            </p>
          }
        />
        <StatCard
          label="Savings rate"
          value={report.income > 0 ? format.percent(rate) : '—'}
          tone={rate < 0 ? 'negative' : rate >= 20 ? 'positive' : 'default'}
          meta={
            <p className="text-xs text-muted">
              {report.income > 0
                ? `${format.money(report.net)} kept out of ${format.money(report.income)}`
                : 'No income in this period'}
            </p>
          }
        />
      </section>

      {report.transfers > 0 ? (
        <p className="mt-3 text-xs text-muted">
          {format.money(report.transfers)} was moved between your own accounts in this period.
          Transfers are excluded from income, expenses and every figure above.
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Income vs expenses"
            description={`${monthsWithActivity} of ${report.monthly.length} months have activity.`}
          />
          <CardBody>
            <CashFlowChart
              data={report.monthly}
              currency={format.currency}
              locale={format.locale}
              height={264}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Spending by category" description={report.period.label} />
          <CardBody>
            {report.byCategory.length === 0 ? (
              <EmptyState compact title="No expenses in this period" />
            ) : (
              <Donut
                data={report.byCategory}
                currency={format.currency}
                locale={format.locale}
                size={150}
                centerLabel="Spent"
                onSelect={(categoryId) => navigate(`/transactions?category=${categoryId}`)}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Net cash flow by month"
            description="Surplus above the line, deficit below."
          />
          <CardBody>
            <NetFlowChart
              data={report.monthly}
              currency={format.currency}
              locale={format.locale}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Spending trend"
            description={
              trend === null
                ? 'Monthly spending against the period average.'
                : `Spending is ${
                    Math.abs(Math.round(trend))
                  }% ${trend > 0 ? 'higher' : 'lower'} in the second half of this period.`
            }
          />
          <CardBody>
            <TrendChart data={report.monthly} currency={format.currency} locale={format.locale} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Budget performance"
            description={
              budgetedMonths.length === 0
                ? 'No budgets applied during this period.'
                : `Spend against budget across ${plural(budgetedMonths.length, 'month')} in view.`
            }
          />
          {budgetedMonths.length === 0 ? (
            <EmptyState
              compact
              title="No budgets in this period"
              description="Set monthly category budgets to track them here."
              action={
                <Button variant="secondary" size="sm" onClick={() => navigate('/budgets')}>
                  Go to budgets
                </Button>
              }
            />
          ) : (
            <CardBody className="space-y-2.5">
              {budgetedMonths.map(({ month, health }) => (
                <div key={month}>
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-ink">{formatMonthLabel(month)}</span>
                    <span className="tnum text-muted">
                      {format.money(health.spent)}
                      <span aria-hidden="true"> / </span>
                      <span className="sr-only"> of </span>
                      {format.money(health.limit)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <ProgressBar
                      value={health.utilization}
                      tone={
                        health.status === 'over'
                          ? 'negative'
                          : health.status === 'warning'
                            ? 'warning'
                            : 'accent'
                      }
                      size="sm"
                      label={`${formatMonthLabel(month)}: ${Math.round(health.utilization)} percent of budget used`}
                    />
                    <span className="tnum w-11 shrink-0 text-right text-[11px] text-muted">
                      {format.percent(health.utilization, 0)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {BUDGET_STATUS_LABELS[health.status]}
                    {health.overCount > 0
                      ? ` — ${plural(health.overCount, 'category')} over budget`
                      : ''}
                  </p>
                </div>
              ))}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Category movement"
            description="Change against the previous period of the same length — where spending is growing."
          />
          {movement.length === 0 ? (
            <EmptyState compact title="Nothing to compare yet" />
          ) : (
            <CardBody>
              <ul className="divide-y divide-line">
                {movement.map((row) => (
                  <li key={row.categoryId} className="flex items-center gap-3 py-2 first:pt-0">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: `var(--ink-${row.color})` }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{row.name}</span>
                    <span className="tnum shrink-0 text-[13px] text-muted">
                      {format.money(row.current)}
                    </span>
                    <span className="w-[7.5rem] shrink-0 text-right">
                      <DeltaTag percent={row.percent} invert suffix="" />
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Top spending categories"
          description="Ranked by total spend, with the share of all expenses in the period."
        />
        {report.byCategory.length === 0 ? (
          <EmptyState compact title="No expenses in this period" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[34rem] text-left">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-subtle">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Category
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Share
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Transactions
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Average
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.byCategory.map((row) => (
                  <tr
                    key={row.categoryId}
                    className="border-b border-line last:border-b-0 hover:bg-surface-muted/50"
                  >
                    <th scope="row" className="px-4 py-2.5 text-[13px] font-medium text-ink">
                      <button
                        type="button"
                        onClick={() => navigate(`/transactions?category=${row.categoryId}`)}
                        className="flex items-center gap-2 rounded text-left hover:underline"
                      >
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                          style={{ backgroundColor: `var(--ink-${row.color})` }}
                        />
                        {row.name}
                      </button>
                    </th>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <ProgressBar
                          value={row.share}
                          size="sm"
                          tone="neutral"
                          label={`${row.name}: ${Math.round(row.share)} percent of spending`}
                          className="max-w-[8rem]"
                        />
                        <span className="tnum text-[11px] text-muted">
                          {format.percent(row.share, 0)}
                        </span>
                      </div>
                    </td>
                    <td className="tnum px-4 py-2.5 text-right text-[13px] text-muted">
                      {row.count}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right text-[13px] text-muted">
                      {format.money(Math.round(row.amount / Math.max(row.count, 1)))}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right text-[13px] font-semibold text-ink">
                      {format.money(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {report.largestExpense ? (
        <p className="mt-4 text-xs text-muted">
          Largest single expense in this period:{' '}
          <strong className="font-medium text-ink">{report.largestExpense.description}</strong> at{' '}
          <span className="tnum font-medium text-ink">
            {format.money(report.largestExpense.amount)}
          </span>{' '}
          on {format.date(report.largestExpense.date)}.
        </p>
      ) : null}
    </>
  )
}
