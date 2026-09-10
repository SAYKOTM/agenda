/* eslint-env serviceworker */
// Service worker único de Agenda SaaS: hace las dos cosas (avisos push y caché offline).
//
// Es UNO solo a propósito. Dos workers registrados en el scope "/" se pelean el control de la
// página y el que gana decide qué pasa con las notificaciones; por eso tampoco se usa
// vite-plugin-pwa, que generaría su propio worker en paralelo a este.
//
// Push: Web Push estándar (VAPID) contra Supabase, no FCM. La consecuencia práctica es que no
// existe el problema clásico de las notificaciones duplicadas: no hay ningún SDK que muestre un
// aviso por su cuenta antes de que corra nuestro handler, el payload lo pintamos nosotros acá.

// Subir esta versión invalida TODA la caché vieja (ver 'activate'): es la palanca para forzar a
// los teléfonos que ya tienen la app instalada a bajar el shell nuevo después de un deploy grande.
const CACHE_VERSION = 'agenda-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Máximo de imágenes guardadas (fotos de servicios, avatares del equipo, logos de salones). Sin
// tope, un salón con galería llena termina ocupando decenas de MB en el teléfono del profesional.
const MAX_IMAGES = 80;

// Plazo para la respuesta de red en una navegación. Es imprescindible: al abrir una PWA desde la
// pantalla de inicio, iOS lanza la app antes de recuperar la conexión, y un fetch sin plazo deja
// la pantalla gris para siempre en vez de mostrar la versión cacheada.
const NAV_TIMEOUT_MS = 4000;

const PRECACHE = [
  '/',
  '/panel',
  '/offline.html',
  '/manifest.json',
  '/panel.webmanifest',
  '/icon-192.png',
  '/panel-icon-192.png',
  '/favicon.svg',
];

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // De a uno con allSettled y no cache.addAll: addAll es atómico, así que un solo 404 (un
      // icono todavía no subido, por ejemplo) tiraría abajo la instalación completa del worker.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Permite que la app pida "actualizate ya" sin esperar al próximo arranque (ver src/main.jsx).
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Caché
// ---------------------------------------------------------------------------

function isImage(url) {
  return /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url.pathname);
}

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  // Las Cache API devuelven las claves en orden de inserción, así que las primeras son las más
  // viejas: se borran esas hasta volver al tope.
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), ms));
}

async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await Promise.race([fetch(request), timeout(NAV_TIMEOUT_MS)]);
    if (response && response.ok) {
      // Se guarda BAJO LA URL PEDIDA, no siempre bajo "/": /panel se sirve con otro documento
      // HTML (panel.html, el que trae el manifest de la app del trabajador). Guardar todo bajo
      // "/" haría que la agenda instalada abriera la portada del cliente al estar sin señal.
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const url = new URL(request.url);
    return (
      (await cache.match(request)) ||
      // Cualquier ruta del panel cae al documento del panel; el resto, a la portada.
      (url.pathname.startsWith('/panel') ? await cache.match('/panel') : null) ||
      (await cache.match('/')) ||
      (await cache.match('/offline.html')) ||
      Response.error()
    );
  }
}

async function handleAsset(request) {
  // Caché primero: los nombres llevan hash de Vite, así que un /assets/x-a1b2c3.js nunca cambia
  // de contenido. Por lo mismo NO se puede precachear una lista escrita a mano: el hash cambia
  // en cada build y quedaría apuntando a archivos que ya no existen.
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function handleImage(request) {
  // stale-while-revalidate: la foto se muestra al instante desde la caché y se refresca de fondo.
  const cache = await caches.open(IMAGE_CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).then(() => trimCache(IMAGE_CACHE, MAX_IMAGES));
      }
      return response;
    })
    .catch(() => hit);
  return hit || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Guardas: todo lo que caiga acá pasa directo a la red, sin respondWith y sin tocar la caché.
  if (request.method !== 'GET') return;
  // Otro origen = Supabase (REST, Realtime, Storage, Edge Functions), Stripe y Google Fonts.
  // Cachear datos de reservas sería servir agendas viejas como si fueran reales; y una respuesta
  // de la pasarela de pago cacheada es directamente peligrosa.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/functions/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleAsset(request));
    return;
  }
  if (isImage(url)) {
    event.respondWith(handleImage(request));
  }
});

// ---------------------------------------------------------------------------
// Push (Web Push / VAPID — lo manda la Edge Function send-notification)
// ---------------------------------------------------------------------------

function parsePush(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

async function showPush(data) {
  // Si el profesional ya está mirando el panel, un aviso del sistema encima sería redundante:
  // se le manda el dato a la pestaña para que muestre un toast y se omite la notificación.
  // (Los navegadores solo muestran el genérico "este sitio se actualizó en segundo plano"
  // cuando NO hay ninguna ventana visible, así que esto no dispara ese aviso.)
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const visible = clientList.find((c) => c.visibilityState === 'visible');
  if (visible) {
    visible.postMessage({ type: 'push', payload: data });
    return;
  }

  const title = data.title || 'Agenda';
  const options = {
    body: data.body || 'Tenés novedades en tu agenda.',
    // Un aviso por cita: si la misma reserva se confirma y después se reagenda, el segundo aviso
    // REEMPLAZA al primero en vez de apilar cinco tarjetas, pero con renotify igual suena y vibra.
    tag: data.bookingId || data.tag || 'agenda',
    renotify: true,
    icon: '/panel-icon-192.png',
    badge: '/panel-icon-192.png',
    vibrate: [200, 100, 200],
    timestamp: data.startAt ? Date.parse(data.startAt) || Date.now() : Date.now(),
    data: { url: data.url || '/panel/agenda', bookingId: data.bookingId || null },
  };
  await self.registration.showNotification(title, options);
}

self.addEventListener('push', (event) => {
  event.waitUntil(showPush(parsePush(event)));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/panel/agenda';
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Si el profesional ya tiene el panel abierto (o la app instalada en segundo plano), se
      // enfoca esa ventana y se la navega: abrir una pestaña nueva por cada aviso es la forma
      // más rápida de terminar con ocho copias de la agenda.
      for (const client of clientList) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && url.pathname.startsWith('/panel')) {
          await client.focus();
          if ('navigate' in client && url.pathname + url.search !== target) {
            await client.navigate(target).catch(() => {});
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
