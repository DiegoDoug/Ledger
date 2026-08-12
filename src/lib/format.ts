import { useMemo } from 'react'
import { useLedger } from '../data/store'
import { formatDate, formatDateShort } from '../domain/dates'
import { currencySymbol, formatMoney, formatMoneyShort, formatPercent } from '../domain/money'
import type { IsoDate } from '../domain/types'

/**
 * Formatting bound to the user's currency/locale settings, so every number in
 * the app is rendered the same way from one place.
 */
export function useFormat() {
  const { data } = useLedger()
  const { currency, locale } = data.settings

  return useMemo(
    () => ({
      currency,
      locale,
      symbol: currencySymbol(currency, locale),
      money: (cents: number, options?: { signed?: boolean; compact?: boolean }) =>
        formatMoney(cents, { currency, locale, ...options }),
      moneyShort: (cents: number) => formatMoneyShort(cents, currency, locale),
      percent: (value: number, digits?: number) => formatPercent(value, digits),
      date: (date: IsoDate) => formatDate(date, locale),
      dateShort: (date: IsoDate) => formatDateShort(date, locale),
    }),
    [currency, locale],
  )
}
