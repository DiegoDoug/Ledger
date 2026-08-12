/**
 * The persistence boundary.
 *
 * Everything above this file works with `LedgerData` and knows nothing about how
 * it is stored. Everything below implements this one interface. Swapping
 * IndexedDB for an HTTP API later means adding an implementation here, not
 * touching the domain or the UI.
 */

import type { LedgerData } from '../domain/types'

export type LoadResult =
  | { status: 'ok'; data: LedgerData }
  | { status: 'empty' }
  /**
   * `corrupt` distinguishes "the store works but what it holds is unreadable"
   * from "the store itself is unusable". The two need opposite responses:
   * an unusable store should fall back to another one, whereas a corrupt
   * document must NOT — switching stores would bypass the user's real data and
   * risk overwriting something still recoverable.
   */
  | { status: 'error'; message: string; corrupt?: boolean }

export type SaveResult = { ok: true } | { ok: false; message: string }

export interface LedgerRepository {
  /** Shown in Settings so the user can see where their data actually lives. */
  readonly kind: RepositoryKind
  /** True when writes survive a reload. */
  readonly durable: boolean
  load(): Promise<LoadResult>
  save(data: LedgerData): Promise<SaveResult>
  clear(): Promise<void>
}

export type RepositoryKind = 'indexeddb' | 'localstorage' | 'memory'

export const REPOSITORY_LABELS: Record<RepositoryKind, string> = {
  indexeddb: 'IndexedDB (this browser)',
  localstorage: 'Local storage (this browser)',
  memory: 'Memory only (this session)',
}

/** Turn any thrown value into a message worth showing a person. */
export function describeStorageError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') {
      return 'Browser storage is full, so the last change could not be saved.'
    }
    if (error.name === 'InvalidStateError' || error.name === 'SecurityError') {
      return 'This browser is blocking storage for this page, so changes will not be saved.'
    }
  }
  return error instanceof Error ? error.message : 'Unknown storage error.'
}
