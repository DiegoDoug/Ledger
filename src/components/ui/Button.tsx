import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:brightness-110 active:brightness-95 shadow-[0_1px_2px_rgb(0_0_0/0.08)]',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-surface-muted active:bg-surface-muted',
  ghost: 'text-muted hover:bg-surface-muted hover:text-ink',
  subtle: 'bg-surface-muted text-ink hover:bg-line',
  danger: 'bg-negative text-white hover:brightness-110 active:brightness-95',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
  icon: 'h-8 w-8 justify-center',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center rounded-md font-medium whitespace-nowrap',
        'transition-[background-color,color,filter,box-shadow] duration-150',
        'disabled:opacity-45 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
