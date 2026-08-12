import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  formatMoneyShort,
  formatPercent,
  fromCents,
  parseAmountToCents,
  toCents,
} from './money'

describe('cents conversion', () => {
  it('round-trips decimal amounts without floating point drift', () => {
    expect(toCents(12.34)).toBe(1234)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(1234.005)).toBe(123401)
    expect(fromCents(1234)).toBe(12.34)
  })

  it('handles negatives symmetrically', () => {
    expect(toCents(-12.34)).toBe(-1234)
    expect(toCents(-0.005)).toBe(-1)
  })

  it('is 0 for non-finite input', () => {
    expect(toCents(Number.NaN)).toBe(0)
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('sums exactly, which floats would not', () => {
    const cents = [10_10, 20_20, 30_30].reduce((a, b) => a + b, 0)
    expect(cents).toBe(60_60)
    expect(fromCents(cents)).toBe(60.6)
  })
})

describe('parseAmountToCents', () => {
  it('accepts plain numbers and decimals', () => {
    expect(parseAmountToCents('42')).toBe(4200)
    expect(parseAmountToCents('42.5')).toBe(4250)
    expect(parseAmountToCents('42.50')).toBe(4250)
  })

  it('ignores currency symbols and spaces', () => {
    expect(parseAmountToCents(' $1,234.56 ')).toBe(123456)
    expect(parseAmountToCents('€99')).toBe(9900)
  })

  it('handles comma decimal separators', () => {
    expect(parseAmountToCents('1234,56')).toBe(123456)
    expect(parseAmountToCents('1.234,56')).toBe(123456)
  })

  it('treats grouped commas as thousands separators', () => {
    expect(parseAmountToCents('1,234')).toBe(123400)
    expect(parseAmountToCents('1,234,567')).toBe(123456700)
  })

  it('rejects anything that is not an amount', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('   ')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('$')).toBeNull()
  })

  it('preserves a negative sign', () => {
    expect(parseAmountToCents('-50.25')).toBe(-5025)
  })
})

describe('formatting', () => {
  it('formats money with the currency and locale', () => {
    expect(formatMoney(123456)).toBe('$1,234.56')
    expect(formatMoney(-5000)).toBe('-$50.00')
    expect(formatMoney(0)).toBe('$0.00')
  })

  it('adds an explicit plus only when asked', () => {
    expect(formatMoney(100, { signed: true })).toBe('+$1.00')
    expect(formatMoney(-100, { signed: true })).toBe('-$1.00')
    expect(formatMoney(0, { signed: true })).toBe('$0.00')
  })

  it('drops decimals in compact mode', () => {
    expect(formatMoney(123456, { compact: true })).toBe('$1,235')
  })

  it('never renders NaN', () => {
    expect(formatMoney(Number.NaN)).toBe('$0.00')
  })

  it('abbreviates for chart axes', () => {
    expect(formatMoneyShort(0)).toBe('$0')
    expect(formatMoneyShort(50_00)).toBe('$50')
    expect(formatMoneyShort(1_200_00)).toBe('$1.2k')
    expect(formatMoneyShort(34_000_00)).toBe('$34k')
    expect(formatMoneyShort(1_100_000_00)).toBe('$1.1M')
    expect(formatMoneyShort(-2_000_00)).toBe('-$2k')
  })

  it('formats percentages and guards against non-finite values', () => {
    expect(formatPercent(24.5)).toBe('24.5%')
    expect(formatPercent(20)).toBe('20%')
    expect(formatPercent(20, 0)).toBe('20%')
    expect(formatPercent(Number.NaN)).toBe('—')
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('—')
  })
})
