/**
 * The desktop capability boundary.
 *
 * Everything in this file is the *only* place that knows Ledger might be
 * running inside a Tauri window instead of a browser tab. Pages call
 * `isDesktop()` to choose between this module's native dialogs and the
 * existing browser download/upload flow in `lib/download.ts` — they never
 * import Tauri APIs directly.
 *
 * The native command surface is deliberately narrow: save or read a text
 * file at a path the user just chose through an OS-native dialog, reveal the
 * app's data directory, and report the app version. There is no generic
 * "read this arbitrary path" exposed here or in the Rust commands it calls —
 * every path handed to Rust originates from a native picker the user just
 * interacted with, never from data or arguments the frontend invents itself.
 */

export type DesktopWriteResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string }

export type DesktopReadResult =
  | { ok: true; text: string; filename: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string }

/** True when running inside the Tauri desktop shell rather than a browser. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** The last path segment, working for both `/` and `\` separators. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Loaded lazily so the browser bundle never has to evaluate Tauri's bridge. */
async function tauriModules() {
  const [{ invoke }, dialog] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/plugin-dialog'),
  ])
  return { invoke, dialog }
}

async function saveTextFile(
  contents: string,
  defaultPath: string,
  filterName: string,
  extensions: string[],
): Promise<DesktopWriteResult> {
  const { invoke, dialog } = await tauriModules()
  let target: string | null
  try {
    target = await dialog.save({ defaultPath, filters: [{ name: filterName, extensions }] })
  } catch (error) {
    return { ok: false, cancelled: false, message: messageOf(error) }
  }
  if (!target) return { ok: false, cancelled: true }

  try {
    await invoke('save_text_file', { path: target, contents })
    return { ok: true }
  } catch (error) {
    return { ok: false, cancelled: false, message: messageOf(error) }
  }
}

async function readTextFile(
  filterName: string,
  extensions: string[],
): Promise<DesktopReadResult> {
  const { invoke, dialog } = await tauriModules()
  let selected: string | string[] | null
  try {
    selected = await dialog.open({ multiple: false, filters: [{ name: filterName, extensions }] })
  } catch (error) {
    return { ok: false, cancelled: false, message: messageOf(error) }
  }
  const target = Array.isArray(selected) ? (selected[0] ?? null) : selected
  if (!target) return { ok: false, cancelled: true }

  try {
    const text = await invoke<string>('read_text_file', { path: target })
    return { ok: true, text, filename: basename(target) }
  } catch (error) {
    return { ok: false, cancelled: false, message: messageOf(error) }
  }
}

/** Save a full JSON backup via the native "Save As" dialog. */
export function saveJsonBackup(contents: string, filename: string): Promise<DesktopWriteResult> {
  return saveTextFile(contents, filename, 'Ledger backup', ['json'])
}

/** Pick a JSON backup via the native "Open" dialog and read it. */
export function restoreJsonBackup(): Promise<DesktopReadResult> {
  return readTextFile('Ledger backup', ['json'])
}

/** Save a CSV export via the native "Save As" dialog. */
export function saveCsvExport(contents: string, filename: string): Promise<DesktopWriteResult> {
  return saveTextFile(contents, filename, 'CSV', ['csv'])
}

/** Pick a CSV file via the native "Open" dialog and read it. */
export function importCsvFile(): Promise<DesktopReadResult> {
  return readTextFile('CSV', ['csv'])
}

/** Reveal the app's data directory in the OS file manager. */
export async function openDataDirectory(): Promise<void> {
  const { invoke } = await tauriModules()
  await invoke('open_data_directory')
}

/** The directory Ledger's own data (not the WebView's IndexedDB store) lives in. */
export async function getAppDataDirectory(): Promise<string> {
  const { invoke } = await tauriModules()
  return invoke<string>('get_app_data_dir')
}

/** The desktop app's version, read from the Tauri bundle rather than the web build. */
export async function getApplicationVersion(): Promise<string> {
  const { invoke } = await tauriModules()
  return invoke<string>('get_app_version')
}
