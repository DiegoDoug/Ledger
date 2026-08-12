import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { LedgerProvider } from './data/store'
import { ToastProvider } from './components/ui/Toast'
import { registerServiceWorker } from './lib/registerServiceWorker'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

registerServiceWorker()

createRoot(container).render(
  <StrictMode>
    {/*
      HashRouter keeps deep links working when the built app is opened from a
      static host or the filesystem, with no server rewrite rules required.
    */}
    <HashRouter>
      <ToastProvider>
        <LedgerProvider>
          <App />
        </LedgerProvider>
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
)
