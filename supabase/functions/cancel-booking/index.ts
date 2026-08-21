// POST /cancel-booking { token }
//
// Cancelar libera el horario automáticamente: el constraint de exclusión de "bookings" excluye
// las filas con status = 'cancelada', así que en cuanto este UPDATE confirma, ese horario
// vuelve a aparecer en /available-slots sin ningún paso adicional.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('body inválido', 400);
  }
  const { token } = body || {};
  if (!token) return errorResponse('falta el token', 400);

  const db = supabaseAdmin();
  const { data: booking, error: findErr } = await db.from('bookings').select('id, status').eq('public_token', token).maybeSingle();
  if (findErr) return errorResponse(findErr.message, 500);
  if (!booking) return errorResponse('reserva no encontrada', 404);
  if (booking.status === 'cancelada') return jsonResponse({ booking }, 200);
  if (booking.status === 'completada') return errorResponse('esta reserva ya fue completada, no se puede cancelar', 409);

  const { data: updated, error: updErr } = await db
    .from('bookings')
    .update({ status: 'cancelada', cancelled_at: new Date().toISOString() })
    .eq('id', booking.id)
    .select()
    .single();
  if (updErr) return errorResponse(updErr.message, 500);

  return jsonResponse({ booking: updated });
});
