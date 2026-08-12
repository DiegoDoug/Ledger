import { useState } from 'react'
import { formatMoney, formatPercent } from '../../domain/money'
import type { CategoryTotal } from '../../domain/calculations'
import { cn } from '../../lib/cn'
import { VisuallyHiddenTable } from './ChartTable'

interface Props {
  data: CategoryTotal[]
  currency: string
  locale: string
  size?: number
  /** Text shown in the middle; defaults to the total. */
  centerLabel?: string
  onSelect?: (categoryId: string) => void
}

const MAX_SLICES = 7

/**
 * Category composition. Slices beyond the seventh are folded into "Other" so
 * the ring stays readable, and every slice is also listed with its value —
 * colour is never the only way to read the chart.
 */
export function Donut({ data, currency, locale, size = 168, centerLabel, onSelect }: Props) {
  const [hover, setHover] = useState<string | null>(null)

  const total = data.reduce((sum, d) => sum + d.amount, 0)
  const slices = foldTail(data, MAX_SLICES)

  const radius = size / 2
  const thickness = Math.max(size * 0.17, 18)
  const inner = radius - thickness

  let angle = -Math.PI / 2
  const arcs = slices.map((slice) => {
    const share = total > 0 ? slice.amount / total : 0
    const start = angle
    const end = angle + share * Math.PI * 2
    angle = end
    return { slice, path: arcPath(radius, inner, start, end, radius) }
  })

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border-[16px] border-line/60 text-xs text-subtle"
        style={{ width: size, height: size }}
      >
        No spending
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label="Spending by category">
          {arcs.map(({ slice, path }) => (
            <path
              key={slice.categoryId}
              d={path}
              fill={`var(--ink-${slice.color})`}
              stroke="var(--ink-surface)"
              strokeWidth={1.5}
              opacity={hover && hover !== slice.categoryId ? 0.35 : 1}
              className="transition-opacity duration-150"
              onMouseEnter={() => setHover(slice.categoryId)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-subtle">
            {centerLabel ?? 'Total'}
          </span>
          <span className="tnum text-[15px] font-semibold text-ink">
            {formatMoney(total, { currency, locale, compact: true })}
          </span>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-1.5">
        {slices.map((slice) => {
          const interactive = Boolean(onSelect) && slice.categoryId !== '__other__'
          const className = cn(
            'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[13px]',
            interactive && 'hover:bg-surface-muted',
            hover === slice.categoryId && 'bg-surface-muted',
          )
          const content = (
            <>
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: `var(--ink-${slice.color})` }}
              />
              <span className="min-w-0 flex-1 truncate text-ink">{slice.name}</span>
              <span className="tnum shrink-0 text-xs text-subtle">
                {formatPercent(slice.share, 0)}
              </span>
              <span className="tnum shrink-0 font-medium text-ink">
                {formatMoney(slice.amount, { currency, locale, compact: true })}
              </span>
            </>
          )
          return (
            <li
              key={slice.categoryId}
              onMouseEnter={() => setHover(slice.categoryId)}
              onMouseLeave={() => setHover(null)}
            >
              {interactive ? (
                <button
                  type="button"
                  className={className}
                  onClick={() => onSelect?.(slice.categoryId)}
                  title={`Show ${slice.name} transactions`}
                >
                  {content}
                </button>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          )
        })}
      </ul>

      <VisuallyHiddenTable
        caption="Spending by category"
        headers={['Category', 'Amount', 'Share']}
        rows={slices.map((s) => [
          s.name,
          formatMoney(s.amount, { currency, locale }),
          formatPercent(s.share, 0),
        ])}
      />
    </div>
  )
}

/** Keep the largest slices and roll everything else into a single "Other". */
function foldTail(data: CategoryTotal[], limit: number): CategoryTotal[] {
  if (data.length <= limit) return data
  const head = data.slice(0, limit - 1)
  const tail = data.slice(limit - 1)
  const amount = tail.reduce((sum, d) => sum + d.amount, 0)
  const share = tail.reduce((sum, d) => sum + d.share, 0)
  return [
    ...head,
    {
      categoryId: '__other__',
      name: `${tail.length} smaller categories`,
      color: 'viz-neutral',
      amount,
      share,
      count: tail.reduce((sum, d) => sum + d.count, 0),
    },
  ]
}

/** SVG path for a donut segment. */
function arcPath(
  outerRadius: number,
  innerRadius: number,
  start: number,
  end: number,
  centre: number,
): string {
  // A full circle cannot be drawn with a single arc — nudge it closed.
  const sweep = end - start
  const safeEnd = sweep >= Math.PI * 2 ? start + Math.PI * 2 - 0.0001 : end
  const large = safeEnd - start > Math.PI ? 1 : 0

  const p = (radius: number, angle: number) => [
    centre + radius * Math.cos(angle),
    centre + radius * Math.sin(angle),
  ]

  const [x1, y1] = p(outerRadius, start)
  const [x2, y2] = p(outerRadius, safeEnd)
  const [x3, y3] = p(innerRadius, safeEnd)
  const [x4, y4] = p(innerRadius, start)

  return [
    `M ${x1} ${y1}`,
    `A ${outerRadius} ${outerRadius} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerRadius} ${innerRadius} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ')
}
