/**
 * File download and file reading, kept in one place so the DOM plumbing stays
 * out of the feature components.
 */

/** Trigger a download of in-memory text as a file. */
export function downloadText(filename: string, text: string, mime: string): void {
  // A BOM keeps spreadsheet software from mis-reading UTF-8 in CSV exports.
  const payload = mime.startsWith('text/csv') ? `﻿${text}` : text
  const blob = new Blob([payload], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024

export type ReadResult = { ok: true; text: string } | { ok: false; error: string }

/** Read a picked file as text, with a size guard so the tab cannot be hung. */
export async function readFileAsText(file: File): Promise<ReadResult> {
  if (file.size > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_IMPORT_BYTES)}.`,
    }
  }
  if (file.size === 0) return { ok: false, error: 'That file is empty.' }

  try {
    return { ok: true, text: await file.text() }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The file could not be read.',
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
