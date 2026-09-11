// POST /report-error { message, stack?, url?, kind?, tenantId? }
//
// Buzón de errores del navegador. Sin JWT: la mayoría de los errores ocurren en la página pública
// de reservas, donde no hay sesión, y justamente esos son los que importan (un error ahí es una
// reserva que no se hizo).
//
// Es un endpoint público que escribe en la base, así que la defensa es la misma que usan
// create-booking y lookup_customer_tier: límite por IP sobre rate_limit_hits, más topes de tamaño.
// Un error mal manejado en un bucle de render puede disparar cientos de reportes por segundo; el
// cliente ya deduplica, pero no se confía en el cliente.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts';

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;
const MAX_URL = 500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  // 30 reportes cada 5 minutos por IP. Un usuario real con una sesión rota manda unos pocos; más
  // que eso es un bucle o alguien probando el endpoint.
  if (!(await checkRateLimit(`report_error:${clientIp(req)}`, 30, 300))) {
    // 202 y no 429 a propósito: al navegador que reporta no le sirve de nada saber que lo
    // limitamos, y no queremos que un reintento agresivo empeore la situación.
    return jsonResponse({ accepted: false }, 202);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('body inválido', 400);
  }

  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) : '';
  if (!message) return errorResponse('falta message', 400);

  const kind = ['error', 'unhandledrejection', 'render'].includes(body?.kind) ? body.kind : 'error';

  const db = supabaseAdmin();
  const { error } = await db.from('client_errors').insert({
    message,
    stack: typeof body?.stack === 'string' ? body.stack.slice(0, MAX_STACK) : null,
    // La URL puede traer parámetros con el token público de una reserva: se guarda solo la ruta.
    url: typeof body?.url === 'string' ? body.url.split('?')[0].slice(0, MAX_URL) : null,
    user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
    kind,
    tenant_id: typeof body?.tenantId === 'string' ? body.tenantId : null,
  });

  if (error) {
    console.error(`[REPORT-ERROR] no se pudo guardar: ${error.message}`);
    return jsonResponse({ accepted: false }, 202);
  }
  return jsonResponse({ accepted: true }, 202);
});
