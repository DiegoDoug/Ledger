import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  addMonthsToKey,
  addYears,
  daysBetween,
  daysInMonth,
  isValidIso,
  monthEnd,
  monthKey,
  monthRange,
  monthStart,
  parseIso,
  relativeDayLabel,
  toIso,
} from './dates'

describe('iso parsing', () => {
  it('parses to a local date with no timezone drift', () => {
    const date = parseIso('2026-03-04')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(2)
    expect(date.getDate()).toBe(4)
  })

  it('round-trips through toIso', () => {
    expect(toIso(parseIso('2026-12-31'))).toBe('2026-12-31')
    expect(toIso(parseIso('2026-01-01'))).toBe('2026-01-01')
  })

  it('validates real calendar dates', () => {
    expect(isValidIso('2026-02-28')).toBe(true)
    expect(isValidIso('2026-02-29')).toBe(false)
    expect(isValidIso('2028-02-29')).toBe(true)
    expect(isValidIso('2026-13-01')).toBe(false)
    expect(isValidIso('2026-04-31')).toBe(false)
    expect(isValidIso('not-a-date')).toBe(false)
  })
})

describe('month helpers', () => {
  it('derives keys, bounds and lengths', () => {
    expect(monthKey('2026-03-04')).toBe('2026-03')
    expect(monthStart('2026-03')).toBe('2026-03-01')
    expect(monthEnd('2026-03')).toBe('2026-03-31')
    expect(monthEnd('2026-02')).toBe('2026-02-28')
    expect(monthEnd('2028-02')).toBe('2028-02-29')
    expect(daysInMonth(2026, 3)).toBe(30)
  })

  it('shifts month keys across year boundaries', () => {
    expect(addMonthsToKey('2026-01', -1)).toBe('2025-12')
    expect(addMonthsToKey('2026-12', 1)).toBe('2027-01')
    expect(addMonthsToKey('2026-03', 0)).toBe('2026-03')
  })

  it('builds inclusive month ranges', () => {
    expect(monthRange('2026-01', '2026-04')).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
    expect(monthRange('2026-03', '2026-03')).toEqual(['2026-03'])
    expect(monthRange('2026-05', '2026-03')).toEqual([])
  })
})

describe('date arithmetic', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('clamps the day when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-03-15', -1)).toBe('2026-02-15')
    expect(addYears('2026-06-30', 1)).toBe('2027-06-30')
  })

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-03-01', '2026-03-11')).toBe(10)
    expect(daysBetween('2026-03-11', '2026-03-01')).toBe(-10)
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0)
  })
})

describe('relativeDayLabel', () => {
  it('names the days around today', () => {
    expect(relativeDayLabel('2026-03-10', '2026-03-10')).toBe('Today')
    expect(relativeDayLabel('2026-03-11', '2026-03-10')).toBe('Tomorrow')
    expect(relativeDayLabel('2026-03-09', '2026-03-10')).toBe('Yesterday')
    expect(relativeDayLabel('2026-03-14', '2026-03-10')).toBe('in 4 days')
    expect(relativeDayLabel('2026-03-07', '2026-03-10')).toBe('3 days ago')
  })
})
