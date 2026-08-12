import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

export type ToastTone = 'neutral' | 'success' | 'error'

export interface ToastOptions {
  message: string
  tone?: ToastTone
  /** Adds a single inline action, typically Undo. */
  action?: { label: string; onClick: () => void }
  durationMs?: number
}

interface ToastItem extends Required<Omit<ToastOptions, 'action'>> {
  id: number
  action?: ToastOptions['action']
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    ({ message, tone = 'neutral', action, durationMs = action ? 8000 : 4500 }: ToastOptions) => {
      const id = nextId.current
      nextId.current += 1
      setToasts((current) => [...current.slice(-2), { id, message, tone, durationMs, action }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const active = timers.current
    return () => {
      active.forEach(clearTimeout)
      active.clear()
    }
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
          role="region"
          aria-label="Notifications"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              aria-live="polite"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border px-3.5 py-3',
                'bg-surface shadow-pop animate-slide-up',
                toast.tone === 'error'
                  ? 'border-negative/40'
                  : toast.tone === 'success'
                    ? 'border-accent/40'
                    : 'border-line-strong',
              )}
            >
              <ToneMark tone={toast.tone} />
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{toast.message}</p>
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick()
                    dismiss(toast.id)
                  }}
                  className="shrink-0 rounded px-1.5 py-1 text-[13px] font-semibold text-accent-text hover:bg-accent-soft"
                >
                  {toast.action.label}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-1 text-subtle hover:bg-surface-muted hover:text-ink"
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                  <path
                    d="M2.5 2.5l7 7M9.5 2.5l-7 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

function ToneMark({ tone }: { tone: ToastTone }) {
  const label = tone === 'error' ? 'Error' : tone === 'success' ? 'Success' : 'Notice'
  return (
    <span
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
        tone === 'error'
          ? 'bg-negative-soft text-negative'
          : tone === 'success'
            ? 'bg-accent-soft text-accent-text'
            : 'bg-surface-muted text-muted',
      )}
    >
      <span className="sr-only">{label}: </span>
      <span aria-hidden="true">{tone === 'error' ? '!' : tone === 'success' ? '✓' : 'i'}</span>
    </span>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
