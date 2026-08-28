// GET /booking-by-token?token=<publicToken>
//
// Única forma de que el cliente final vea su reserva: sin login, el token (uuid aleatorio no
// adivinable) autoriza el acceso a esa reserva y a ninguna otra.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return errorResponse('method_not_allowed', 405);

  const token = new URL(req.url).searchParams.get('token');
  if (!token) return errorResponse('falta el parámetro token', 400);

  const db = supabaseAdmin();
  const { data: booking, error } = await db
    .from('bookings')
    .select(
      'id, status, professional_id, start_at, end_at, buffer_before_min, buffer_after_min, total_price_clp, deposit_amount_clp, loyalty_discount_clp, loyalty_tier_applied, payment_method, payment_status, client_name, client_phone, client_email, notes, cancelled_at, public_token,' +
        'tenants(name, slug, timezone, address, theme, currency, google_place_id),' +
        'professionals(name, initials),' +
        'booking_items(service_id, name_snapshot, price_snapshot, duration_snapshot, sort_order),' +
        'reviews(rating, comment)'
    )
    .eq('public_token', token)
    .maybeSingle();

  if (error) return errorResponse(error.message, 500);
  if (!booking) return errorResponse('reserva no encontrada', 404);

  return jsonResponse({ booking });
});
