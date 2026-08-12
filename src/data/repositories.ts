/**
 * Repository implementations and the selection logic that picks one.
 *
 * IndexedDB is the primary store: it is asynchronous, has a far larger quota
 * than localStorage, and never blocks the main thread while writing. The other
 * two exist so the app degrades instead of breaking — a browser with IndexedDB
 * disabled falls back to localStorage, and one with no storage at all still runs
 * for the session with an honest warning in the UI.
 */

import { isLedgerData, migrateDocument } from './migrate'
import { describeStorageError } from './repository'
import type { LedgerRepository, LoadResult, SaveResult } from './repository'
import type { LedgerData } from '../domain/types'

const DB_NAME = 'ledger'
const DB_VERSION = 1
const STORE_NAME = 'documents'
const DOCUMENT_KEY = 'current'

/** Legacy localStorage key, kept so existing data migrates rather than vanishing. */
export const STORAGE_KEY = 'ledger.data.v1'
export const THEME_KEY = 'ledger.theme'

/* ------------------------------------------------------------------ */
/* IndexedDB                                                           */
/* ------------------------------------------------------------------ */

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(error)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open the database.'))
    // Another tab holding an old version open would otherwise hang forever.
    request.onblocked = () => reject(new Error('Another tab is upgrading Ledger’s database.'))
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Storage request failed.'))
  })
}

class IndexedDbRepository implements LedgerRepository {
  readonly kind = 'indexeddb' as const
  readonly durable = true

  async load(): Promise<LoadResult> {
    try {
      const db = await openDatabase()
      try {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const raw = await requestToPromise<unknown>(tx.objectStore(STORE_NAME).get(DOCUMENT_KEY))
        if (raw === undefined || raw === null) return { status: 'empty' }
        if (!isLedgerData(raw)) {
          return {
            status: 'error',
            message: 'The saved ledger is not in a recognised format.',
            corrupt: true,
          }
        }
        return { status: 'ok', data: migrateDocument(raw) }
      } finally {
        db.close()
      }
    } catch (error) {
      return { status: 'error', message: describeStorageError(error) }
    }
  }

  async save(data: LedgerData): Promise<SaveResult> {
    try {
      const db = await openDatabase()
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        // Structured clone rejects functions and proxies; the document is plain
        // JSON, so a round trip guarantees a cloneable value.
        tx.objectStore(STORE_NAME).put(JSON.parse(JSON.stringify(data)), DOCUMENT_KEY)
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onabort = () => reject(tx.error ?? new Error('The write was aborted.'))
          tx.onerror = () => reject(tx.error ?? new Error('The write failed.'))
        })
        return { ok: true }
      } finally {
        db.close()
      }
    } catch (error) {
      return { ok: false, message: describeStorageError(error) }
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await openDatabase()
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(DOCUMENT_KEY)
        await new Promise<void>((resolve) => {
          tx.oncomplete = () => resolve()
          tx.onabort = () => resolve()
          tx.onerror = () => resolve()
        })
      } finally {
        db.close()
      }
    } catch {
      /* nothing useful to do — the caller reseeds in memory regardless */
    }
  }
}

/* ------------------------------------------------------------------ */
/* localStorage                                                        */
/* ------------------------------------------------------------------ */

class LocalStorageRepository implements LedgerRepository {
  readonly kind = 'localstorage' as const
  readonly durable = true

  async load(): Promise<LoadResult> {
    let raw: string | null
    try {
      raw = window.localStorage.getItem(STORAGE_KEY)
    } catch (error) {
      return { status: 'error', message: describeStorageError(error) }
    }
    if (!raw) return { status: 'empty' }

    // A parse failure is corruption of the document, not of the store.
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isLedgerData(parsed)) {
        return {
          status: 'error',
          message: 'The saved ledger is not in a recognised format.',
          corrupt: true,
        }
      }
      return { status: 'ok', data: migrateDocument(parsed) }
    } catch (error) {
      return { status: 'error', message: describeStorageError(error), corrupt: true }
    }
  }

  async save(data: LedgerData): Promise<SaveResult> {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      return { ok: true }
    } catch (error) {
      return { ok: false, message: describeStorageError(error) }
    }
  }

  async clear(): Promise<void> {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* nothing useful to do */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Memory                                                             */
/* ------------------------------------------------------------------ */

class MemoryRepository implements LedgerRepository {
  readonly kind = 'memory' as const
  readonly durable = false
  private document: LedgerData | null = null

  async load(): Promise<LoadResult> {
    return this.document ? { status: 'ok', data: this.document } : { status: 'empty' }
  }

  async save(data: LedgerData): Promise<SaveResult> {
    this.document = data
    return { ok: true }
  }

  async clear(): Promise<void> {
    this.document = null
  }
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function localStorageAvailable(): boolean {
  try {
    const probe = '__ledger_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export interface OpenedRepository {
  repository: LedgerRepository
  /** The initial read, already performed while choosing the implementation. */
  initial: LoadResult
  /** Set when data was carried over from the pre-IndexedDB localStorage store. */
  migratedFrom?: 'localstorage'
  /** Set when the chosen store is not the preferred one. */
  degraded?: string
}

/**
 * Pick a repository, read it, and carry forward any older localStorage document.
 *
 * The load happens here rather than in the caller because the choice of store
 * depends on whether the preferred one actually works — a browser can expose
 * `indexedDB` and still refuse to open a database (Firefox private windows
 * historically did exactly that).
 */
export async function openRepository(): Promise<OpenedRepository> {
  if (indexedDbAvailable()) {
    const repository = new IndexedDbRepository()
    const initial = await repository.load()

    /*
     * The database opened but its contents are unreadable. Staying here is the
     * only safe move: falling back to localStorage would report the wrong cause,
     * hide the real document, and start writing somewhere else. The caller runs
     * in memory for this session so the corrupt document is left intact and can
     * still be inspected or cleared deliberately.
     */
    if (initial.status === 'error' && initial.corrupt) {
      return { repository, initial }
    }

    if (initial.status !== 'error') {
      // Nothing in IndexedDB yet — adopt a legacy localStorage document if one
      // is there, so upgrading the app never looks like losing your data.
      if (initial.status === 'empty' && localStorageAvailable()) {
        const legacy = new LocalStorageRepository()
        const previous = await legacy.load()
        if (previous.status === 'ok') {
          const written = await repository.save(previous.data)
          if (written.ok) {
            return { repository, initial: previous, migratedFrom: 'localstorage' }
          }
        }
      }
      return { repository, initial }
    }
  }

  if (localStorageAvailable()) {
    const repository = new LocalStorageRepository()
    return {
      repository,
      initial: await repository.load(),
      degraded: 'IndexedDB is unavailable, so Ledger is using local storage instead.',
    }
  }

  const repository = new MemoryRepository()
  return {
    repository,
    initial: { status: 'empty' },
    degraded: 'This browser is blocking storage, so changes will only last until you reload.',
  }
}

/* ------------------------------------------------------------------ */
/* Theme (deliberately synchronous)                                    */
/* ------------------------------------------------------------------ */

/**
 * The theme is read by an inline script before first paint to avoid a flash, so
 * it stays in localStorage where a synchronous read is possible.
 */
export function readTheme(): 'light' | 'dark' | null {
  try {
    const value = window.localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function writeTheme(theme: 'light' | 'dark' | 'system'): void {
  try {
    if (theme === 'system') window.localStorage.removeItem(THEME_KEY)
    else window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* theme preference is non-critical */
  }
}
