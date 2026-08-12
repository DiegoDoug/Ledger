import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface MenuItem {
  label: string
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

/**
 * Small actions menu. Keyboard: Enter/Space or Arrow Down opens and focuses the
 * first item, arrows move, Escape closes and returns focus to the trigger.
 */
export function Menu({
  items,
  label = 'More actions',
  trigger,
  align = 'end',
}: {
  items: MenuItem[]
  label?: string
  trigger?: ReactNode
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    // Focus the first enabled item so the menu is usable without a mouse.
    listRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus()

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const moveFocus = (delta: number) => {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])]
    if (buttons.length === 0) return
    const index = buttons.indexOf(document.activeElement as HTMLElement)
    const next = (index + delta + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted',
          'transition-colors hover:bg-surface-muted hover:text-ink',
          open && 'bg-surface-muted text-ink',
        )}
      >
        {trigger ?? (
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
            <circle cx="8" cy="3.5" r="1.3" fill="currentColor" />
            <circle cx="8" cy="8" r="1.3" fill="currentColor" />
            <circle cx="8" cy="12.5" r="1.3" fill="currentColor" />
          </svg>
        )}
      </button>

      {open ? (
        <div
          ref={listRef}
          role="menu"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              moveFocus(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              moveFocus(-1)
            }
          }}
          className={cn(
            'absolute z-30 mt-1 min-w-[9.5rem] overflow-hidden rounded-lg border border-line',
            'bg-surface p-1 shadow-pop animate-rise',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={cn(
                'block w-full rounded px-2.5 py-1.5 text-left text-[13px]',
                'transition-colors disabled:opacity-40',
                item.destructive
                  ? 'text-negative hover:bg-negative-soft'
                  : 'text-ink hover:bg-surface-muted',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
