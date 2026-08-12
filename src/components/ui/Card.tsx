import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // `min-w-0` keeps a wide child (a chart, a table) from stretching the
        // grid track it sits in, which is what causes page-level side-scroll.
        'bg-surface border border-line rounded-lg shadow-card min-w-0',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  as: As = 'h2',
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  as?: 'h2' | 'h3'
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 px-4 py-3 border-b border-line',
        className,
      )}
    >
      <div className="min-w-0">
        <As className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{title}</As>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />
}
