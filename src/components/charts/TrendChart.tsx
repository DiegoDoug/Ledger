import { useState } from 'react'
import { useMeasure } from '../../lib/useMeasure'
import { formatMoney, formatMoneyShort } from '../../domain/money'
import type { MonthlySummary } from '../../domain/analytics'
import { clamp, niceTicks } from './scale'
import { VisuallyHiddenTable } from './ChartTable'

/** Monthly spending as a line with an area fill, plus a mean reference line. */
export function TrendChart({
  data,
  currency,
  locale,
  height = 220,
}: {
  data: MonthlySummary[]
  currency: string
  locale: string
  height?: number
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const padding = { top: 14, right: 12, bottom: 26, left: 48 }
  const innerWidth = Math.max(width - padding.left - padding.right, 10)
  const innerHeight = height - padding.top - padding.bottom

  const max = Math.max(...data.map((d) => d.expenses), 1)
  const ticks = niceTicks(max, 3)
  const scaleMax = ticks[ticks.length - 1] || 1
  const y = (value: number) => padding.top + innerHeight - (value / scaleMax) * innerHeight
  const x = (index: number) =>
    data.length === 1
      ? padding.left + innerWidth / 2
      : padding.left + (innerWidth * index) / (data.length - 1)

  const mean = data.length ? data.reduce((s, d) => s + d.expenses, 0) / data.length : 0
  const points = data.map((d, i) => `${x(i)},${y(d.expenses)}`)
  const area =
    data.length > 0
      ? `M ${x(0)},${padding.top + innerHeight} L ${points.join(' L ')} L ${x(data.length - 1)},${
          padding.top + innerHeight
        } Z`
      : ''

  const active = hover !== null ? data[hover] : null

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Monthly spending trend">
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink-viz-3)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--ink-viz-3)" stopOpacity="0" />
            </linearGradient>
          </defs>

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

          {mean > 0 ? (
            <>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y(mean)}
                y2={y(mean)}
                stroke="var(--ink-text-subtle)"
                strokeDasharray="5 3"
                strokeWidth={1}
              />
              <text
                x={width - padding.right}
                y={y(mean) - 5}
                textAnchor="end"
                className="fill-[var(--ink-text-subtle)] text-[10px]"
              >
                Average
              </text>
            </>
          ) : null}

          {area ? <path d={area} fill="url(#trend-fill)" /> : null}
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke="var(--ink-viz-3)"
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {data.map((d, i) => (
            <g key={d.month}>
              <circle
                cx={x(i)}
                cy={y(d.expenses)}
                r={hover === i ? 4 : 2.75}
                fill="var(--ink-surface)"
                stroke="var(--ink-viz-3)"
                strokeWidth={1.75}
                pointerEvents="none"
              />
              <rect
                x={x(i) - innerWidth / Math.max(data.length * 2, 1)}
                y={padding.top}
                width={innerWidth / Math.max(data.length, 1)}
                height={innerHeight}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              <text
                x={x(i)}
                y={height - 8}
                textAnchor="middle"
                className="fill-[var(--ink-text-subtle)] text-[10px]"
                pointerEvents="none"
              >
                {d.label}
              </text>
            </g>
          ))}
        </svg>
      ) : (
        <div style={{ height }} />
      )}

      {active ? (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface px-3 py-2 shadow-pop"
          style={{ left: clamp(x(hover ?? 0) - 55, 0, Math.max(width - 120, 0)) }}
        >
          <p className="text-[11px] font-semibold text-ink">{active.label}</p>
          <p className="tnum mt-0.5 text-[13px] font-semibold text-ink">
            {formatMoney(active.expenses, { currency, locale })}
          </p>
          <p className="text-[11px] text-muted">{active.count} transactions</p>
        </div>
      ) : null}

      <VisuallyHiddenTable
        caption="Monthly spending trend"
        headers={['Month', 'Spending']}
        rows={data.map((d) => [d.label, formatMoney(d.expenses, { currency, locale })])}
      />
    </div>
  )
}
