/**
 * CSV reading and writing.
 *
 * A small RFC 4180 parser rather than a dependency: it handles quoted fields
 * with embedded delimiters, newlines and escaped quotes, plus the two things
 * real-world bank exports actually do — a UTF-8 BOM and semicolon delimiters.
 */

export const DEFAULT_DELIMITER = ','

/** Guess the delimiter from the header line by counting candidates outside quotes. */
export function detectDelimiter(text: string): string {
  const firstLine = stripBom(text).split(/\r?\n/, 1)[0] ?? ''
  const candidates = [',', ';', '\t']
  let best = DEFAULT_DELIMITER
  let bestCount = 0

  for (const candidate of candidates) {
    let count = 0
    let inQuotes = false
    for (let i = 0; i < firstLine.length; i += 1) {
      const char = firstLine[i]
      if (char === '"') inQuotes = !inQuotes
      else if (char === candidate && !inQuotes) count += 1
    }
    if (count > bestCount) {
      bestCount = count
      best = candidate
    }
  }

  return best
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Parse CSV into rows of raw string cells. Empty trailing lines are dropped;
 * blank lines inside the file are kept as empty rows so line numbers stay
 * truthful when reporting an error back to the user.
 */
export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = stripBom(input)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"' && field === '') {
      inQuotes = true
      i += 1
      continue
    }

    if (char === delimiter) {
      row.push(field)
      field = ''
      i += 1
      continue
    }

    if (char === '\r') {
      i += 1
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }

    field += char
    i += 1
  }

  // Flush whatever the last line left behind.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Drop a single trailing empty row produced by a final newline.
  while (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last.length === 1 && last[0].trim() === '') rows.pop()
    else break
  }

  return rows
}

/**
 * Quote a cell when it could otherwise break the file. A leading `=`, `+`, `-`
 * or `@` is prefixed with a single quote so spreadsheet software treats the cell
 * as text instead of executing it as a formula.
 */
export function escapeCsvCell(value: string, delimiter = DEFAULT_DELIMITER): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  const needsQuotes =
    guarded.includes(delimiter) ||
    guarded.includes('"') ||
    guarded.includes('\n') ||
    guarded.includes('\r') ||
    guarded !== guarded.trim()
  if (!needsQuotes) return guarded
  return `"${guarded.replace(/"/g, '""')}"`
}

export function toCsv(rows: Array<Array<string | number>>, delimiter = DEFAULT_DELIMITER): string {
  return rows
    .map((row) => row.map((cell) => escapeCsvCell(String(cell), delimiter)).join(delimiter))
    .join('\r\n')
}

/**
 * Map a header row to column indexes, matching case-insensitively and ignoring
 * spaces and underscores, so `To Account`, `to_account` and `toaccount` all hit.
 */
export function indexHeaders(header: string[]): Map<string, number> {
  const map = new Map<string, number>()
  header.forEach((name, index) => {
    const key = normaliseHeader(name)
    if (key && !map.has(key)) map.set(key, index)
  })
  return map
}

export function normaliseHeader(name: string): string {
  return name
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}
