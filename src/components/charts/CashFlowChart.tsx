import { useState } from 'react'
import { useMeasure } from '../../lib/useMeasure'
import { formatMoney, formatMoneyShort } from '../../domain/money'
import type { MonthlySummary } from '../../domain/analytics'
import { cn } from '../../lib/cn'
import { clamp, niceTicks } from './scale'
import { VisuallyHiddenTable } from './ChartTable'

interface Props {
  data: MonthlySummary[]
  currency: string
  locale: string
  height?: number
}

/**
 * Grouped income/expense bars.
 *
 * Drawn with plain SVG at a measured pixel width: no chart dependency, and the
 * type stays at its designed size at every breakpoint.
 */
export function CashFlowChart({ data, currency, locale, height = 250 }: Props) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const padding = { top: 12, right: 8, bottom: 26, left: 48 }
  const innerWidth = Math.max(width - padding.left - padding.right, 10)
  const innerHeight = height - padding.top - padding.bottom

  const max = Math.max(...data.map((d) => Math.max(d.income, d.expenses)), 1)
  const ticks = niceTicks(max, 4)
  const scaleMax = ticks[ticks.length - 1] || 1
  const y = (value: number) => padding.top + innerHeight - (value / scaleMax) * innerHeight

  const slot = innerWidth / Math.max(data.length, 1)
  const barWidth = Math.max(Math.min(slot * 0.28, 20), 3)
  const gap = Math.min(3, barWidth * 0.3)

  const active = hover !== null ? data[hover] : null

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Income and expenses by month across ${data.length} months`}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--ink-border)"
                strokeDasharray={tick === 0 ? undefined : '2 4'}
              />
              <text
                x={padding.left - 8}
                y={y(tick) + 3.5}
                textAnchor="end"
                className="fill-[var(--ink-text-subtle)] text-[10px] tnum"
              >
                {formatMoneyShort(tick, currency, locale)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const centre = padding.left + slot * i + slot / 2
            const isActive = hover === i
            return (
              <g key={d.month}>
                <rect
                  x={padding.left + slot * i}
                  y={padding.top}
                  width={slot}
                  height={innerHeight}
                  fill={isActive ? 'var(--ink-surface-muted)' : 'transparent'}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
                <rect
                  x={centre - barWidth - gap / 2}
                  y={y(d.income)}
                  width={barWidth}
                  height={Math.max(padding.top + innerHeight - y(d.income), 0)}
                  rx={2}
                  fill="var(--ink-viz-1)"
                  pointerEvents="none"
                />
                <rect
                  x={centre + gap / 2}
                  y={y(d.expenses)}
                  width={barWidth}
                  height={Math.max(padding.top + innerHeight - y(d.expenses), 0)}
                  rx={2}
                  fill="var(--ink-viz-3)"
                  pointerEvents="none"
                />
                <text
                  x={centre}
                  y={height - 8}
                  textAnchor="middle"
                  className={cn(
                    'text-[10px]',
                    isActive ? 'fill-[var(--ink-text)] font-medium' : 'fill-[var(--ink-text-subtle)]',
                  )}
                  pointerEvents="none"
                >
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>
      ) : (
        <div style={{ height }} />
      )}

      {active ? (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[10rem] rounded-lg border border-line bg-surface p-2.5 shadow-pop"
          style={{
            left: clamp(padding.left + slot * (hover ?? 0) + slot / 2 - 80, 0, Math.max(width - 165, 0)),
          }}
        >
          <p className="text-[11px] font-semibold text-ink">{active.label}</p>
          <dl className="mt-1.5 space-y-1 text-[11px]">
            <TooltipRow
              label="Income"
              value={formatMoney(active.income, { currency, locale })}
              swatch="viz-1"
            />
            <TooltipRow
              label="Expenses"
              value={formatMoney(active.expenses, { currency, locale })}
              swatch="viz-3"
            />
            <TooltipRow
              label="Net"
              value={formatMoney(active.net, { currency, locale })}
              swatch="text-muted"
              emphasis
            />
          </dl>
        </div>
      ) : null}

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
        <LegendItem color="viz-1" label="Income" />
        <LegendItem color="viz-3" label="Expenses" />
      </ul>

      <VisuallyHiddenTable
        caption="Income and expenses by month"
        rows={data.map((d) => [
          d.label,
          formatMoney(d.income, { currency, locale }),
          formatMoney(d.expenses, { currency, locale }),
          formatMoney(d.net, { currency, locale }),
        ])}
        headers={['Month', 'Income', 'Expenses', 'Net']}
      />
    </div>
  )
}

export function TooltipRow({
  label,
  value,
  swatch,
  emphasis,
}: {
  label: string
  value: string
  swatch: string
  emphasis?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-1.5 text-muted">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-[2px]"
          style={{ backgroundColor: `var(--ink-${swatch})` }}
        />
        {label}
      </dt>
      <dd className={cn('tnum text-ink', emphasis && 'font-semibold')}>{value}</dd>
    </div>
  )
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-[2px]"
        style={{ backgroundColor: `var(--ink-${color})` }}
      />
      {label}
    </li>
  )
}
