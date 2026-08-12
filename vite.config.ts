/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /*
   * A relative base means the built app works at any path a reverse proxy puts
   * it behind — `/`, `/ledger/`, or a subdomain — with no rebuild. Combined with
   * HashRouter, self-hosting needs no server rewrite rules at all.
   */
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5183,
    // Listen on all interfaces so the dev server is reachable from a LAN device.
    host: true,
  },
  preview: {
    port: 5183,
    host: true,
  },
  build: {
    // Fail the build rather than silently shipping a chunk that is too large.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
