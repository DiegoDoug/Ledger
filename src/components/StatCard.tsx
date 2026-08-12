import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/**
 * A single headline figure. Every value shown here comes from the calculation
 * layer — no component computes its own number.
 */
export function StatCard({
  label,
  value,
  meta,
  tone = 'default',
  footer,
  className,
}: {
  label: string
  value: string
  meta?: ReactNode
  tone?: 'default' | 'positive' | 'negative'
  footer?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col justify-between rounded-lg border border-line bg-surface p-4 shadow-card',
        'transition-colors duration-200 hover:border-line-strong',
        className,
      )}
    >
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-subtle">{label}</p>
        <p
          className={cn(
            'tnum mt-2 text-[22px] font-semibold leading-none tracking-[-0.03em]',
            tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink',
          )}
        >
          {value}
        </p>
      </div>
      {meta ? <div className="mt-2.5">{meta}</div> : null}
      {footer ? <div className="mt-3 border-t border-line pt-2.5">{footer}</div> : null}
    </div>
  )
}
