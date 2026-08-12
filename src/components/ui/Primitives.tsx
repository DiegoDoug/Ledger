import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/* ---------------------------------------------------------------- */
/* Badge                                                             */
/* ---------------------------------------------------------------- */

export type BadgeTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-muted border-line',
  positive: 'bg-positive-soft text-positive border-positive/25',
  negative: 'bg-negative-soft text-negative border-negative/25',
  warning: 'bg-warning-soft text-warning border-warning/25',
  accent: 'bg-accent-soft text-accent-text border-accent/25',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5',
        'text-[11px] font-medium leading-4 whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A small colour chip that always sits next to a text label, never alone. */
export function CategoryDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-2 w-2 shrink-0 rounded-[2px]', className)}
      style={{ backgroundColor: `var(--ink-${color})` }}
    />
  )
}

/* ---------------------------------------------------------------- */
/* Progress                                                          */
/* ---------------------------------------------------------------- */

export type ProgressTone = 'accent' | 'warning' | 'negative' | 'neutral'

const PROGRESS_FILL: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  warning: 'bg-warning',
  negative: 'bg-negative',
  neutral: 'bg-muted',
}

/**
 * Determinate meter. Over-budget bars render a hatched overflow segment so the
 * state is legible without relying on colour.
 */
export function ProgressBar({
  value,
  tone = 'accent',
  label,
  className,
  size = 'md',
}: {
  /** Percentage 0–n; anything over 100 renders an overflow segment. */
  value: number
  tone?: ProgressTone
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  const safe = Number.isFinite(value) ? Math.max(value, 0) : 0
  const filled = Math.min(safe, 100)
  const overflow = Math.min(Math.max(safe - 100, 0), 100)

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(safe)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${Math.round(safe)} percent`}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-surface-muted',
        size === 'sm' ? 'h-1.5' : 'h-2',
        'border border-line',
        className,
      )}
    >
      <div
        className={cn('absolute inset-y-0 left-0 transition-[width] duration-500', PROGRESS_FILL[tone])}
        style={{ width: `${filled}%` }}
      />
      {overflow > 0 ? (
        <div
          className="absolute inset-y-0 left-0 opacity-90"
          style={{
            width: `${overflow}%`,
            backgroundImage:
              'repeating-linear-gradient(135deg, var(--ink-surface) 0 3px, transparent 3px 6px)',
          }}
        />
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------- */
/* Empty state                                                       */
/* ---------------------------------------------------------------- */

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  compact = false,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-4 py-8' : 'px-6 py-14',
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-muted text-muted">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- */
/* Loading                                                           */
/* ---------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded bg-surface-muted', className)}
      aria-hidden="true"
    />
  )
}

export function LoadingPanel({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only absolute h-px w-px overflow-hidden">{label}</span>
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

/* ---------------------------------------------------------------- */
/* Misc                                                              */
/* ---------------------------------------------------------------- */

export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle',
        className,
      )}
    >
      {children}
    </h2>
  )
}

/**
 * Directional delta. The arrow carries the direction so the meaning survives
 * without colour, and `unit` distinguishes a relative change (%) from a change
 * in an already-percentage figure (percentage points).
 */
export function DeltaTag({
  percent,
  invert = false,
  suffix = 'vs prior period',
  unit = '%',
}: {
  percent: number | null
  /** For expenses, an increase is unfavourable. */
  invert?: boolean
  suffix?: string
  unit?: '%' | 'pts'
}) {
  if (percent === null || !Number.isFinite(percent)) {
    return <span className="text-xs text-subtle">No prior data</span>
  }
  const rounded = Math.round(percent * 10) / 10
  const up = rounded > 0
  const flat = rounded === 0
  const good = flat ? null : invert ? !up : up

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium tnum',
        good === null ? 'text-muted' : good ? 'text-positive' : 'text-negative',
      )}
    >
      <span aria-hidden="true">{flat ? '→' : up ? '↑' : '↓'}</span>
      <span className="sr-only">{flat ? 'unchanged' : up ? 'up' : 'down'} </span>
      {Math.abs(rounded)}
      {unit === 'pts' ? ' pts' : '%'}
      <span className="font-normal text-subtle">{suffix}</span>
    </span>
  )
}
