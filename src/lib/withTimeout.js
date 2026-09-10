// Promesa que se rinde sola pasado un plazo.
//
// Existe por un comportamiento concreto y verificado en Chrome: sin conexión, ni
// supabase.auth.getSession() ni una consulta de PostgREST rechazan la promesa -- se quedan
// colgadas. Sin plazo, el panel instalado se queda en "Cargando…" para siempre justo cuando la
// persona más necesita ver su agenda guardada.
//
// Resuelve con { timedOut: true } en vez de rechazar para que quien llama pueda tratarlo igual
// que a un `{ data, error }` de Supabase, sin un try/catch aparte.
export function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), ms))]);
}
