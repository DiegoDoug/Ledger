/**
 * Money helpers. Everything internal is integer cents; these functions are the
 * only place where cents become a display string or a user string becomes cents.
 */

/** Round half-away-from-zero, so -0.5 -> -1 rather than JS's -0. */
export function roundCents(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** Convert a decimal currency amount (e.g. 12.34) to cents (1234). */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return roundCents(amount * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

export interface FormatOptions {
  currency?: string
  locale?: string
  /** Drop the decimals — used for axis labels and other dense surfaces. */
  compact?: boolean
  /** Force a leading + on positive values. */
  signed?: boolean
}

export function formatMoney(cents: number, options: FormatOptions = {}): string {
  const { currency = 'USD', locale = 'en-US', compact = false, signed = false } = options
  const safe = Number.isFinite(cents) ? cents : 0
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 0 : 2,
  }).format(fromCents(compact ? roundCents(safe / 100) * 100 : safe))

  if (signed && safe > 0) return `+${formatted}`
  return formatted
}

/** Short form for chart axes: $1.2k, $34k, $1.1M. */
export function formatMoneyShort(cents: number, currency = 'USD', locale = 'en-US'): string {
  const value = Math.abs(fromCents(cents))
  const sign = cents < 0 ? '-' : ''
  const symbol = currencySymbol(currency, locale)
  if (value >= 1_000_000) return `${sign}${symbol}${trim(value / 1_000_000)}M`
  if (value >= 1_000) return `${sign}${symbol}${trim(value / 1_000)}k`
  return `${sign}${symbol}${Math.round(value)}`
}

function trim(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function currencySymbol(currency = 'USD', locale = 'en-US'): string {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).formatToParts(0)
  return parts.find((p) => p.type === 'currency')?.value ?? '$'
}

/** Format a ratio already expressed in percent, e.g. 24.5 -> "24.5%". */
export function formatPercent(percent: number, fractionDigits = 1): string {
  if (!Number.isFinite(percent)) return '—'
  const rounded = Number(percent.toFixed(fractionDigits))
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(fractionDigits)}%`
}

/**
 * Parse user input into cents. Accepts "1,234.56", "$1234.56", "1234,56" and
 * bare numbers. Returns null when the string is not a usable amount.
 */
export function parseAmountToCents(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null
  // Strip currency symbols, spaces and thousands separators.
  let cleaned = raw.replace(/[^\d.,-]/g, '')
  if (!cleaned) return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal separator.
    const decimalSep = lastComma > lastDot ? ',' : '.'
    const thousandsSep = decimalSep === ',' ? '.' : ','
    cleaned = cleaned.split(thousandsSep).join('')
    cleaned = cleaned.replace(decimalSep, '.')
  } else if (lastComma > -1) {
    // A single comma is a decimal separator only when it looks like one.
    const decimals = cleaned.length - lastComma - 1
    cleaned = decimals > 0 && decimals <= 2 ? cleaned.replace(',', '.') : cleaned.split(',').join('')
  }

  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return toCents(value)
}
