import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary'
import { AccountProvider } from './lib/AccountContext'
import { startErrorReporter } from './lib/errorReporter'
import './styles/global.css'

// erros do navegador vão para o servidor (sem dado pessoal, ver lib/errorReporter)
startErrorReporter()

// A abertura começa sempre do topo; restaurar a rolagem no meio do giro
// deixaria a página num estado sem sentido depois de um recarregamento.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AccountProvider>
          <App />
        </AccountProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
      return
    }

    // In development, remove stale SW/cache to avoid serving old bundles.
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))

    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith('mj-sneakers-') || key.startsWith('pizantt-'))
          .map((key) => caches.delete(key))
      )
    }
  })
}
