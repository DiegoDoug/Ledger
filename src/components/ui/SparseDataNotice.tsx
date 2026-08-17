import { cn } from '../../lib/cn'
import { IconInfo } from '../icons'

/**
 * Replaces a computed figure (a rate, a trend) when there isn't enough data
 * behind it to be meaningful — e.g. a savings rate from three days of
 * history. Never used for a genuinely zero value; that renders as "—" with
 * its own caption instead, since zero is not misleading.
 */
export function SparseDataNotice({ message, className }: { message: string; className?: string }) {
  return (
    <p
      className={cn(
        'inline-flex items-start gap-1.5 text-xs leading-snug text-info-text',
        className,
      )}
    >
      <IconInfo className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{message}</span>
    </p>
  )
}
