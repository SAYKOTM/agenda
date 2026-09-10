import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Replica local de las reescrituras de vercel.json: /panel y /panel/* se sirven con panel.html.
// Sin esto, tanto `vite dev` como `vite preview` caen al fallback de SPA y devuelven index.html
// para /panel -- o sea, el manifest del cliente. La app se ve igual (React Router resuelve la
// ruta), pero es justo lo que NO se puede probar así: qué app instala el teléfono. Con este
// plugin, "añadir a pantalla de inicio" desde /panel se comporta en local igual que en producción.
function panelEntryRewrite() {
  const rewrite = (req, _res, next) => {
    const path = (req.url || '').split('?')[0]
    if (path === '/panel' || path.startsWith('/panel/')) {
      req.url = '/panel.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')
    }
    next()
  }
  // Se registra ANTES de los middlewares internos (nada de devolver una función, que los pondría
  // después): si el fallback de SPA corre primero, /panel/agenda ya salió respondido con
  // index.html y la reescritura nunca llega a aplicarse.
  return {
    name: 'panel-entry-rewrite',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), panelEntryRewrite()],
  build: {
    rollupOptions: {
      // Dos documentos HTML de entrada, una sola app: index.html es la PWA del cliente y
      // panel.html la del profesional. Ambos cargan el mismo /src/main.jsx y comparten todos los
      // chunks -- lo único que difiere es el <link rel="manifest">, que es lo que iOS lee al
      // cargar la página para decidir qué app se instala en la pantalla de inicio.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        panel: fileURLToPath(new URL('./panel.html', import.meta.url)),
      },
    },
  },
})
