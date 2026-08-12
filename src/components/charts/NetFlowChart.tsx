import { useState } from 'react'
import { useMeasure } from '../../lib/useMeasure'
import { formatMoney, formatMoneyShort } from '../../domain/money'
import type { MonthlySummary } from '../../domain/analytics'
import { clamp, niceTicks } from './scale'
import { VisuallyHiddenTable } from './ChartTable'
import { cn } from '../../lib/cn'

/**
 * Diverging bars around a zero baseline: surplus above, deficit below. Deficit
 * bars are hatched as well as coloured so the two read apart in monochrome.
 */
export function NetFlowChart({
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

  const padding = { top: 12, right: 8, bottom: 26, left: 48 }
  const innerWidth = Math.max(width - padding.left - padding.right, 10)
  const innerHeight = height - padding.top - padding.bottom

  const magnitude = Math.max(...data.map((d) => Math.abs(d.net)), 1)
  const ticks = niceTicks(magnitude, 2)
  const bound = ticks[ticks.length - 1] || 1
  const zeroY = padding.top + innerHeight / 2
  const y = (value: number) => zeroY - (value / bound) * (innerHeight / 2)

  const slot = innerWidth / Math.max(data.length, 1)
  const barWidth = Math.max(Math.min(slot * 0.5, 30), 4)
  const active = hover !== null ? data[hover] : null

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Net cash flow by month">
          <defs>
            <pattern id="deficit-hatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="5" height="5" fill="var(--ink-viz-3)" />
              <line x1="0" y1="0" x2="0" y2="5" stroke="var(--ink-surface)" strokeWidth="2" />
            </pattern>
          </defs>

          {[bound, 0, -bound].map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? 'var(--ink-border-strong)' : 'var(--ink-border)'}
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
            const top = d.net >= 0 ? y(d.net) : zeroY
            const barHeight = Math.max(Math.abs(y(d.net) - zeroY), 1)
            return (
              <g key={d.month}>
                <rect
                  x={padding.left + slot * i}
                  y={padding.top}
                  width={slot}
                  height={innerHeight}
                  fill={hover === i ? 'var(--ink-surface-muted)' : 'transparent'}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
                <rect
                  x={centre - barWidth / 2}
                  y={top}
                  width={barWidth}
                  height={barHeight}
                  rx={2}
                  fill={d.net >= 0 ? 'var(--ink-viz-1)' : 'url(#deficit-hatch)'}
                  stroke={d.net >= 0 ? 'none' : 'var(--ink-viz-3)'}
                  strokeWidth={d.net >= 0 ? 0 : 1}
                  pointerEvents="none"
                />
                <text
                  x={centre}
                  y={height - 8}
                  textAnchor="middle"
                  className={cn(
                    'text-[10px]',
                    hover === i ? 'fill-[var(--ink-text)] font-medium' : 'fill-[var(--ink-text-subtle)]',
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
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface px-3 py-2 shadow-pop"
          style={{
            left: clamp(padding.left + slot * (hover ?? 0) + slot / 2 - 60, 0, Math.max(width - 130, 0)),
          }}
        >
          <p className="text-[11px] font-semibold text-ink">{active.label}</p>
          <p className="tnum mt-0.5 text-[13px] font-semibold text-ink">
            {formatMoney(active.net, { currency, locale })}
          </p>
          <p className="text-[11px] text-muted">{active.net >= 0 ? 'Surplus' : 'Deficit'}</p>
        </div>
      ) : null}

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-[2px]"
            style={{ backgroundColor: 'var(--ink-viz-1)' }}
          />
          Surplus
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-[2px] border border-[var(--ink-viz-3)]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--ink-viz-3) 0 2px, transparent 2px 4px)',
            }}
          />
          Deficit (hatched)
        </li>
      </ul>

      <VisuallyHiddenTable
        caption="Net cash flow by month"
        headers={['Month', 'Net']}
        rows={data.map((d) => [d.label, formatMoney(d.net, { currency, locale })])}
      />
    </div>
  )
}
