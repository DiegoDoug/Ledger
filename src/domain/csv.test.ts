import { describe, expect, it } from 'vitest'
import { detectDelimiter, escapeCsvCell, indexHeaders, parseCsv, toCsv } from './csv'

describe('parseCsv', () => {
  it('splits simple rows and columns', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('keeps a delimiter inside a quoted field', () => {
    expect(parseCsv('a,b\n"Smith, John",2')).toEqual([
      ['a', 'b'],
      ['Smith, John', '2'],
    ])
  })

  it('unescapes a doubled quote', () => {
    expect(parseCsv('a\n"She said ""hi"""')).toEqual([['a'], ['She said "hi"']])
  })

  it('keeps a newline inside a quoted field', () => {
    expect(parseCsv('a,b\n"line one\nline two",2')).toEqual([
      ['a', 'b'],
      ['line one\nline two', '2'],
    ])
  })

  it('strips a UTF-8 byte order mark from the first header', () => {
    expect(parseCsv('﻿Date,Amount\n2026-01-01,5')[0]).toEqual(['Date', 'Amount'])
  })

  it('drops a single trailing blank line but keeps empty cells', () => {
    expect(parseCsv('a,b\n,\n')).toEqual([
      ['a', 'b'],
      ['', ''],
    ])
  })

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })

  it('reads semicolon-delimited files', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('detectDelimiter', () => {
  it('picks the delimiter that appears most in the header', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
  })

  it('ignores delimiters inside quoted header cells', () => {
    expect(detectDelimiter('"a;b;c;d";e\n1;2')).toBe(';')
  })

  it('defaults to a comma for a single-column file', () => {
    expect(detectDelimiter('amount\n5')).toBe(',')
  })
})

describe('toCsv and escaping', () => {
  it('quotes cells containing the delimiter, quotes or newlines', () => {
    expect(escapeCsvCell('plain')).toBe('plain')
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('neutralises a leading character a spreadsheet would run as a formula', () => {
    expect(escapeCsvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)")
    expect(escapeCsvCell('+1234')).toBe("'+1234")
    expect(escapeCsvCell('@handle')).toBe("'@handle")
    // A negative number must survive: it is quoted, not mangled beyond the guard.
    expect(escapeCsvCell('-12.50')).toBe("'-12.50")
  })

  it('round-trips through the parser', () => {
    const rows = [
      ['Date', 'Description', 'Amount'],
      ['2026-03-01', 'Café, corner of 5th', '12.50'],
      ['2026-03-02', 'He said "yes"', '4.00'],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})

describe('indexHeaders', () => {
  it('matches ignoring case, spaces, dashes and underscores', () => {
    const map = indexHeaders(['  To Account ', 'transaction_date', 'AMOUNT'])
    expect(map.get('toaccount')).toBe(0)
    expect(map.get('transactiondate')).toBe(1)
    expect(map.get('amount')).toBe(2)
  })

  it('keeps the first of two identical headers', () => {
    expect(indexHeaders(['Amount', 'amount']).get('amount')).toBe(0)
  })
})
