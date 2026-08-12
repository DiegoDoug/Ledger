import { useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../lib/cn'

const CONTROL =
  'w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-subtle ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'disabled:opacity-50 disabled:bg-surface-muted'

const CONTROL_OK = 'border-line-strong hover:border-muted/60'
const CONTROL_ERROR = 'border-negative'

export interface FieldProps {
  label: string
  htmlFor: string
  error?: string
  hint?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
  /** Visually hide the label but keep it for assistive tech. */
  hideLabel?: boolean
}

/**
 * Label + control + message. The error is wired through `aria-describedby` by
 * the caller passing the same id (`${htmlFor}-error`) — see `useFieldIds`.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
  hideLabel,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className={cn(
          'text-xs font-medium text-muted',
          hideLabel && 'sr-only absolute h-px w-px overflow-hidden',
        )}
      >
        {label}
        {required ? (
          <span className="text-negative" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="flex items-start gap-1 text-xs text-negative">
          <span aria-hidden="true" className="mt-px leading-none">
            &#9888;
          </span>
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function useFieldIds(name: string) {
  const id = useId()
  return { id: `${name}-${id}`, errorId: `${name}-${id}-error`, hintId: `${name}-${id}-hint` }
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  /** Rendered inside the control on the left, e.g. a currency symbol. */
  prefix?: string
}

export function Input({ className, invalid, prefix, ...props }: InputProps) {
  if (prefix) {
    return (
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted"
        >
          {prefix}
        </span>
        <input
          className={cn(
            CONTROL,
            invalid ? CONTROL_ERROR : CONTROL_OK,
            'h-9 tnum',
            className,
          )}
          style={{ paddingLeft: `${prefix.length * 0.6 + 1.4}rem` }}
          aria-invalid={invalid || undefined}
          {...props}
        />
      </div>
    )
  }
  return (
    <input
      className={cn(CONTROL, invalid ? CONTROL_ERROR : CONTROL_OK, 'h-9', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          CONTROL,
          invalid ? CONTROL_ERROR : CONTROL_OK,
          'h-9 appearance-none pr-8',
          className,
        )}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </div>
  )
}

export function Textarea({
  className,
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(CONTROL, invalid ? CONTROL_ERROR : CONTROL_OK, 'py-2 resize-y', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}

/** Segmented control — a labelled radio group that looks like a toggle. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  name,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
  name: string
  label: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex w-full rounded-md border border-line-strong bg-surface-muted p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <label
            key={option.value}
            className={cn(
              'flex-1 cursor-pointer rounded-[5px] px-3 py-1.5 text-center text-[13px] font-medium',
              'transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2',
              'has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-offset-1',
              selected
                ? 'bg-surface text-ink shadow-card'
                : 'text-muted hover:text-ink',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only absolute h-px w-px"
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ink-accent)]"
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm text-ink select-none">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
    </div>
  )
}
