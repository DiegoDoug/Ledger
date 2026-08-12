import { APP_VERSION } from './version'

/**
 * Register the service worker so Ledger opens offline.
 *
 * Only in production: a worker caching the dev server's module graph makes
 * hot-reload behave unpredictably. Registration is best-effort — the app is
 * fully functional without it, since the data lives in IndexedDB either way.
 *
 * Service workers require a secure context, so this quietly does nothing when
 * the app is served over plain HTTP from anything other than localhost.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (!window.isSecureContext) return

  window.addEventListener('load', () => {
    // The version in the URL is what names the cache and triggers an update.
    const url = new URL(`sw.js?v=${encodeURIComponent(APP_VERSION)}`, document.baseURI)
    void navigator.serviceWorker.register(url, { scope: './' }).catch(() => {
      /* An unavailable worker only costs offline support, so there is nothing to report. */
    })
  })
}
