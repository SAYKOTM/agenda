// POST /geocode-address {}  (sin body: geocodifica tenants.address del profesional que llama)
// Header: Authorization: Bearer <access token del profesional>
//
// Usa Nominatim (OpenStreetMap), gratis y sin API key ni tarjeta -- a cambio de eso, su política
// de uso pide un User-Agent identificable y nada de golpearlo seguido, así que esto se llama
// server-side, una vez, cuando el admin aprieta "Ubicar en el mapa" en Ajustes -- no en cada
// visita de la landing pública (para eso están tenants.lat/lng, ya cacheadas).
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return errorResponse('falta autenticación', 401);

  const db = supabaseAdmin();
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return errorResponse('sesión inválida', 401);

  const { data: professional, error: profErr } = await db
    .from('professionals')
    .select('tenant_id, role, active')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (profErr) return errorResponse(profErr.message, 500);
  if (!professional || !professional.active || professional.role !== 'admin') {
    return errorResponse('solo un administrador puede actualizar la ubicación', 403);
  }

  const { data: tenant, error: tenantErr } = await db.from('tenants').select('id, address').eq('id', professional.tenant_id).maybeSingle();
  if (tenantErr) return errorResponse(tenantErr.message, 500);
  if (!tenant?.address?.trim()) return errorResponse('completá la dirección antes de ubicarla en el mapa', 400);

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(tenant.address)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'AgendaSaaS/1.0 (contacto: soporte@agenda.app)' } });
  if (!res.ok) return errorResponse('no pudimos consultar el geocodificador', 502);
  const results = await res.json();
  if (!Array.isArray(results) || !results.length) {
    return errorResponse('no encontramos esa dirección en el mapa, revisa que esté completa', 404);
  }

  const lat = Number(results[0].lat);
  const lng = Number(results[0].lon);
  const { error: updErr } = await db.from('tenants').update({ lat, lng }).eq('id', tenant.id);
  if (updErr) return errorResponse(updErr.message, 500);

  return jsonResponse({ lat, lng });
});
