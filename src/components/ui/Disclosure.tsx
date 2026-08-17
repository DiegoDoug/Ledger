import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { IconChevronDown } from '../icons'

/**
 * Hides a tail of low-priority rows (dormant accounts, unused categories)
 * behind a toggle so they stop competing with the ones that actually have
 * activity, without deleting or hiding them for good.
 */
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  className,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  // A page can render more than one Disclosure (e.g. Categories' Spending and
  // Income groups), so the region id must be unique per instance, not derived
  // from the label — two groups can share the same "2 unused categories" text.
  const regionId = useId()

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={regionId}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-1 py-1.5 text-left text-xs font-medium text-subtle',
          'hover:text-muted',
        )}
      >
        <IconChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')} />
        {label}
      </button>
      {open ? <div id={regionId}>{children}</div> : null}
    </div>
  )
}
