// POST /submit-review { token, rating: 1-5, comment? }
//
// Único punto de escritura de "reviews": el cliente no tiene cuenta, así que el public_token de
// su reserva es lo que autoriza la calificación (mismo mecanismo sin-login que
// cancel-booking/reschedule-booking). Solo se puede calificar una reserva 'completada', y solo
// una vez (booking_id es unique en reviews).
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
  const { token, rating, comment } = body || {};
  if (!token) return errorResponse('falta el token', 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return errorResponse('la calificación debe ser un número entero entre 1 y 5', 400);

  const db = supabaseAdmin();
  const { data: booking, error: findErr } = await db
    .from('bookings')
    .select('id, tenant_id, professional_id, customer_id, status')
    .eq('public_token', token)
    .maybeSingle();
  if (findErr) return errorResponse(findErr.message, 500);
  if (!booking) return errorResponse('reserva no encontrada', 404);
  if (booking.status !== 'completada') return errorResponse('solo puedes calificar una reserva completada', 409);

  const { data: existing, error: existingErr } = await db.from('reviews').select('id').eq('booking_id', booking.id).maybeSingle();
  if (existingErr) return errorResponse(existingErr.message, 500);
  if (existing) return errorResponse('ya calificaste esta reserva', 409);

  const { data: review, error: insErr } = await db
    .from('reviews')
    .insert({
      tenant_id: booking.tenant_id,
      professional_id: booking.professional_id,
      booking_id: booking.id,
      customer_id: booking.customer_id,
      rating,
      comment: comment?.trim() || null,
    })
    .select()
    .single();
  if (insErr) return errorResponse(insErr.message, 500);

  return jsonResponse({ review }, 201);
});
