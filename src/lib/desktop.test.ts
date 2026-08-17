import { describe, expect, it } from 'vitest'
import { basename, isDesktop } from './desktop'

describe('isDesktop', () => {
  it('is false outside a Tauri window', () => {
    // The test environment has no `window` at all, let alone the Tauri
    // bridge global — this is exactly the "running in Node/SSR" case the
    // guard must survive without throwing.
    expect(isDesktop()).toBe(false)
  })
})

describe('basename', () => {
  it('reads the last segment of a POSIX path', () => {
    expect(basename('/home/user/ledger-backup-2026-08-17.json')).toBe(
      'ledger-backup-2026-08-17.json',
    )
  })

  it('reads the last segment of a Windows path', () => {
    expect(basename('C:\\Users\\dandr\\Documents\\ledger-backup.json')).toBe(
      'ledger-backup.json',
    )
  })

  it('falls back to the whole string when there is no separator', () => {
    expect(basename('backup.json')).toBe('backup.json')
  })

  it('ignores a trailing separator', () => {
    expect(basename('/home/user/backups/')).toBe('backups')
  })
})
