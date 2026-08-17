import { cn } from '../../lib/cn'

/** A small, secondary tag — never louder than the category it sits beside. */
export function PaymentMethodBadge({ method, className }: { method: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none',
        'bg-method-badge-bg text-method-badge-text',
        className,
      )}
    >
      {method}
    </span>
  )
}
