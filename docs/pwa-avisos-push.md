# PWA del panel y avisos push

El panel del profesional (`/panel`) se instala en el teléfono como una app aparte, abre sin
conexión y recibe avisos cuando le agendan, cancelan o reagendan una hora. Este documento explica
cómo está armado, qué hay que configurar y cómo probarlo.

Todo corre sobre el stack que ya usa el proyecto: **Supabase** (Postgres + RLS + Edge Functions en
Deno) y **Vercel**. No hay Firebase ni FCM en ninguna parte: los avisos son **Web Push estándar
(VAPID, RFC 8291)**, implementado con WebCrypto en `supabase/functions/_shared/notifications/webpush.ts`.

## 1. Dos apps instalables, un solo bundle

iOS lee el `<link rel="manifest">` cuando **carga** la página, no cuando se toca "Añadir a pantalla
de inicio". Cambiarlo con JavaScript funciona en Chrome pero llega tarde en Safari, así que el
ícono agregado desde el panel abriría la portada del cliente.

Por eso hay dos documentos HTML de entrada, con el mismo `<div id="root">` y el mismo
`/src/main.jsx` (misma app React, mismo router, mismos chunks):

| Documento | Manifest | Se sirve en | Ícono |
| --- | --- | --- | --- |
| `index.html` | `public/manifest.json` | todo salvo `/panel*` | morado, rayo blanco |
| `panel.html` | `public/panel.webmanifest` | `/panel` y `/panel/*` | azul noche, rayo lila |

- `vite.config.js` declara las dos entradas en `build.rollupOptions.input`.
- `vercel.json` reescribe `/panel` y `/panel/(.*)` a `/panel.html` y el resto a `/index.html`.
- `src/components/RouteManifest.jsx` intercambia el manifest y el título en navegación SPA: es el
  respaldo para Chrome, no el mecanismo principal.

`scope` es `"/"` en **ambos** manifests a propósito: el panel manda al login, a la portada y a
Stripe Checkout, y todo lo que quede fuera del scope se abre en Safari, sacando a la persona de la
app instalada.

> En `npm run dev` Vite hace fallback a `index.html`, así que `/panel` en desarrollo carga el
> documento del cliente y el manifest lo corrige `RouteManifest`. Para probar el flujo real de
> instalación hay que usar `npm run build && npm run preview`, o abrir `/panel.html` directo.

## 2. Service worker único

`public/sw.js` hace las dos cosas: caché offline y push. Es uno solo a propósito — dos workers en
el scope `/` se pelean el control de la página. Por lo mismo **no** se usa `vite-plugin-pwa`.

- **Navegaciones**: red primero con plazo de 4 s (iOS lanza la PWA antes de recuperar la conexión;
  sin plazo la pantalla queda gris para siempre). La copia se guarda bajo la URL pedida, así
  `/panel` cae en `panel.html` y no en la portada.
- **`/assets/*`**: caché primero (llevan hash de Vite, nunca cambian de contenido).
- **Imágenes**: stale-while-revalidate con tope de 80 entradas.
- **Nunca se cachea**: cualquier cosa que no sea GET, cualquier origen que no sea el propio
  (Supabase REST/Realtime/Storage, Stripe) y `/api/*`.
- Subir `CACHE_VERSION` invalida toda la caché en el próximo arranque.

Además, los dos HTML llevan un "vigía de arranque": si a los 10 s `#root` sigue vacío (el caso
clásico de un HTML cacheado que apunta a un JS que un deploy nuevo ya borró), borra cachés,
desregistra los workers y recarga. Automatiza lo que hoy sería "borrá el ícono y volvé a
agregarlo".

## 3. Datos sin conexión

Supabase no tiene equivalente a la persistencia offline de Firestore. `src/lib/offlineStore.js`
guarda en IndexedDB la última respuesta buena de la agenda y `usePanelAppointments` la usa para
pintar la vista antes de que conteste la red y cuando la red falla (`stale: true`, que es lo que
muestra la franja "Sin conexión — viendo tu agenda guardada"). Al cerrar sesión se vacía.

## 4. Configuración necesaria

### Claves VAPID

```sh
node scripts/generate-vapid-keys.mjs
```

| Dónde | Variable |
| --- | --- |
| `.env.local` y Vercel | `VITE_VAPID_PUBLIC_KEY` |
| Secretos de Supabase | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |

```sh
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@dominio.cl
```

Si cambia la privada, todas las suscripciones existentes mueren y cada profesional tiene que
volver a activar los avisos. `APP_URL` (que ya usaba el correo) también tiene que estar puesta.

### Migraciones

- `0045_push_subscriptions.sql`: valor `'push'` del enum `notification_channel`, tabla
  `push_subscriptions` (una fila por dispositivo) con RLS por profesional, y la función
  `save_push_subscription()`.
- `0046_push_booking_alerts.sql`: trigger `bookings_enqueue_professional_push`, que encola en
  `notification_queue` — la misma cola, el mismo cron y los mismos reintentos que el correo.

### Iconos

`node scripts/generate-icons.mjs` regenera los ocho PNG de `public/` a partir del rayo de
`favicon.svg`. Incluye los maskable (con 20 % de margen de seguridad) y los `apple-touch-icon` de
180×180 **sin transparencia**, porque iOS pinta de negro cualquier píxel transparente.

## 5. Cómo se dispara un aviso

1. Alguien crea, cancela o reagenda una reserva.
2. El trigger encola una fila `channel='push'` en `notification_queue` con
   `payload = {event, professional_id}`. **No se encola si quien hizo el cambio es el propio
   profesional** (`auth.uid()` coincide con su `auth_user_id`): no tiene sentido avisarle de su
   propia acción.
3. El cron `process-notification-queue` (cada minuto, ya existía) llama a `send-notification`.
4. `send-notification` arma el aviso, busca los dispositivos suscritos y los cifra con
   `WebPushProvider`. Alcanza con que un dispositivo reciba para marcar la fila como enviada.
5. Los endpoints que responden 404/410 se borran solos: son teléfonos que desinstalaron la app.

Una diferencia importante frente a FCM: acá **no existe el problema de las notificaciones
duplicadas**. No hay ningún SDK que muestre un aviso por su cuenta antes de nuestro handler, así
que no hace falta mandar mensajes "solo de datos" — el payload es nuestro y lo pinta `sw.js`. Si
el panel está abierto y a la vista, el worker no muestra la notificación del sistema y le manda el
dato a la pestaña, que muestra un toast.

## 6. Probar

**Escritorio (Chrome)** — con `npm run build && npm run preview`:

- DevTools → Application → Manifest: debe decir "Mi Agenda" en `/panel` y "Agenda" en `/`.
- Application → Service Workers: un solo worker, activado, sobre el scope `/`.
- Network → Offline y recargar `/panel/agenda`: tiene que abrir la agenda guardada con la franja
  naranja, no la pantalla de dinosaurio ni `offline.html`.
- Application → Storage → IndexedDB → `agenda-offline`: ahí está la copia de la agenda.
- Perfil → "Activar avisos" y después, desde otro navegador o incógnito, reservar una hora con ese
  profesional: el aviso llega en menos de un minuto (lo limita el cron).

**iPhone (la prueba que importa)**:

1. Abrir `https://<dominio>/panel` en Safari, iniciar sesión.
2. Compartir → Añadir a pantalla de inicio. El nombre propuesto tiene que ser **Mi Agenda** y el
   ícono el azul noche; si aparece "Agenda" con el ícono morado, la reescritura de `/panel` no
   está funcionando.
3. Abrir desde el ícono: debe entrar directo a la agenda, sin barra de direcciones y sin pasar por
   la portada del cliente.
4. Recién ahí (iOS 16.4+, solo en la app instalada) Perfil → "Activar avisos" ofrece el permiso.
5. Modo avión y abrir la app: tiene que mostrar la agenda guardada, no una pantalla gris.
