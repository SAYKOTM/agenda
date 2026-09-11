import { functionsUrl, anonKey } from './supabaseClient';

// Reporte de errores del navegador hacia la Edge Function report-error.
//
// Es propio y no un servicio externo porque todo lo que hace falta ya está en el stack: una tabla
// con RLS, una función pública con límite por IP y Postgres para consultarlo. Sumar Sentry
// implicaría otra cuenta, otro contrato de tratamiento de datos que declarar en el Anexo A y un
// SDK de ~30 kB en el bundle público.
//
// Lo que NO hace, a propósito: no manda datos del usuario, ni el contenido de los formularios, ni
// la query string (donde viaja el token público de una reserva). Solo mensaje, stack y ruta.

// Ruido conocido que no indica nada roto y que, sin filtrar, inunda la tabla.
const IGNORAR = [
  /ResizeObserver loop/i,
  /Failed to fetch dynamically imported module/i, // ya lo maneja el reload de vite:preloadError
  /Load failed/i, // Safari cuando se pierde la señal
  /NetworkError when attempting to fetch/i,
  /The operation was aborted/i,
];

// Un error dentro de un render puede repetirse cientos de veces por segundo: se manda una sola vez
// por firma y por sesión, con un tope duro.
const vistos = new Set();
const MAX_POR_SESION = 8;
let enviados = 0;

export function reportError(error, { kind = 'error' } = {}) {
  try {
    const message = String(error?.message || error || '').slice(0, 500);
    if (!message || IGNORAR.some((re) => re.test(message))) return;

    const stack = typeof error?.stack === 'string' ? error.stack.slice(0, 4000) : null;
    const firma = `${kind}:${message}`;
    if (vistos.has(firma) || enviados >= MAX_POR_SESION) return;
    vistos.add(firma);
    enviados++;

    // keepalive para que el reporte sobreviva si el error ocurre justo al navegar a otra página.
    fetch(`${functionsUrl}/report-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
      body: JSON.stringify({ message, stack, url: window.location.pathname, kind }),
      keepalive: true,
    }).catch(() => {
      // Si no se puede reportar el error, no hay nada más que hacer: reportar ese fallo sería un
      // bucle.
    });
  } catch {
    // El reportero de errores jamás puede ser la causa de un error.
  }
}

// Se engancha una sola vez, desde main.jsx.
export function installErrorReporting() {
  window.addEventListener('error', (event) => {
    reportError(event.error || event.message, { kind: 'error' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, { kind: 'unhandledrejection' });
  });
}
