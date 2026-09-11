// POST /join-waitlist { tenantSlug, professionalId?, date, serviceIds?, name, phone, note? }
//
// Alta pública en la lista de espera: el cliente quiso un día que ya estaba lleno y deja su
// nombre y su WhatsApp para que lo avisen si se libera una hora (ver la migración 0052).
//
// Entra por una Edge Function y no por un insert directo con anon, por lo mismo que create-booking:
// la tabla guarda nombre y teléfono de personas, así que el alta necesita validar el salón, limitar
// por IP y no exponer la tabla a escrituras desde el navegador.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts';

const MAX_ESPERANDO_POR_TELEFONO = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  if (!(await checkRateLimit(`join-waitlist:${clientIp(req)}`, 10, 600))) {
    return errorResponse('demasiadas solicitudes, intenta de nuevo en unos minutos', 429);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('body inválido', 400);
  }

  const tenantSlug = (body.tenantSlug || '').trim().toLowerCase();
  const date = (body.date || '').trim();
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const note = (body.note || '').trim();
  const professionalId = body.professionalId && body.professionalId !== 'any' ? body.professionalId : null;
  const serviceIds = Array.isArray(body.serviceIds) ? body.serviceIds.filter((id: unknown) => typeof id === 'string') : [];

  if (!tenantSlug) return errorResponse('falta el salón', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorResponse('fecha inválida', 400);
  if (name.length < 2) return errorResponse('ingresa tu nombre', 400);
  if (phone.replace(/\D/g, '').length < 8) return errorResponse('ingresa un teléfono válido', 400);

  const db = supabaseAdmin();

  const { data: tenant, error: tenantErr } = await db.from('tenants').select('id').eq('slug', tenantSlug).maybeSingle();
  if (tenantErr) return errorResponse(tenantErr.message, 500);
  if (!tenant) return errorResponse('no encontramos el salón', 404);

  if (professionalId) {
    const { data: pro } = await db
      .from('professionals')
      .select('id')
      .eq('id', professionalId)
      .eq('tenant_id', tenant.id)
      .eq('active', true)
      .maybeSingle();
    if (!pro) return errorResponse('ese profesional no atiende en este salón', 400);
  }

  // Mismo teléfono, mismo día, misma espera: si vuelve a apretar el botón no se duplica la fila.
  const { data: existing } = await db
    .from('waitlist_entries')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('client_phone', phone)
    .eq('desired_date', date)
    .eq('status', 'esperando')
    .maybeSingle();
  if (existing) return jsonResponse({ ok: true, alreadyWaiting: true });

  // Tope por teléfono: anotarse en cinco días distintos es razonable, en cincuenta es spam.
  const { count } = await db
    .from('waitlist_entries')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('client_phone', phone)
    .eq('status', 'esperando');
  if ((count || 0) >= MAX_ESPERANDO_POR_TELEFONO) {
    return errorResponse('ya estás anotado en varios días de este salón', 429);
  }

  const { error: insertErr } = await db.from('waitlist_entries').insert({
    tenant_id: tenant.id,
    professional_id: professionalId,
    client_name: name,
    client_phone: phone,
    desired_date: date,
    service_ids: serviceIds,
    note: note || null,
  });
  if (insertErr) return errorResponse(insertErr.message, 500);

  return jsonResponse({ ok: true, alreadyWaiting: false });
});
