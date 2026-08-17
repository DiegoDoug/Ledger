import { describe, expect, it } from 'vitest'
import { detectPaymentMethod } from './paymentMethod'

describe('detectPaymentMethod', () => {
  it('recognises a Bizum-style transaction', () => {
    expect(detectPaymentMethod('Bizum')).toBe('Bizum')
    expect(detectPaymentMethod('Bizum Tio')).toBe('Bizum')
    expect(detectPaymentMethod('Envio Bizum a Ana')).toBe('Bizum')
  })

  it('is case-insensitive', () => {
    expect(detectPaymentMethod('bizum')).toBe('Bizum')
    expect(detectPaymentMethod('BIZUM')).toBe('Bizum')
    expect(detectPaymentMethod('BiZuM transfer')).toBe('Bizum')
  })

  it('finds no method on an ordinary card transaction', () => {
    expect(detectPaymentMethod('Whole Foods Market')).toBeNull()
    expect(detectPaymentMethod('Uber')).toBeNull()
    expect(detectPaymentMethod('Sapphire Credit Card payment')).toBeNull()
  })

  it('does not false-positive on an unrelated merchant name', () => {
    expect(detectPaymentMethod('Bizumo Cafe')).toBeNull()
    expect(detectPaymentMethod('Rebizumated')).toBeNull()
  })

  it('returns null for an empty description', () => {
    expect(detectPaymentMethod('')).toBeNull()
  })
})
