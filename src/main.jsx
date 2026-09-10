import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppRouter from './AppRouter.jsx'

// La app montó bien: se suelta el candado del vigía de arranque de index.html / panel.html para
// que un problema futuro pueda volver a dispararlo. En try/catch porque en modo privado de Safari
// tocar sessionStorage puede tirar excepción.
try {
  sessionStorage.removeItem('agenda-rescate')
} catch {
  // sin sessionStorage no hay candado que soltar
}

// Después de un deploy, los chunks que la pestaña abierta todavía no cargó dejan de existir en el
// servidor y el import dinámico falla dejando la vista en blanco. Recargar trae el index nuevo.
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

// Un único service worker para todo (avisos push + caché offline), ver public/sw.js.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Que no haya service worker degrada la app (sin offline, sin push) pero no la rompe:
      // nunca debe impedir que el panel arranque.
      console.warn('No se pudo registrar el service worker:', err)
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
