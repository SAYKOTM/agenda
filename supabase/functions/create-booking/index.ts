// POST /create-booking
// body: { tenantSlug, professionalId: uuid|'any', serviceIds: string[], date: 'YYYY-MM-DD',
//         startMinute: number, client: { name, phone, email, notes }, paymentMethod }
//
// Revalida disponibilidad justo antes de insertar (contra datos frescos) y además confía en el
// constraint de exclusión de la base como última garantía: si el slot se lo llevó otra reserva
// entre el chequeo y el insert, la función responde 409 y el frontend debe recargar los slots.
import { Temporal } from '@js-temporal/polyfill';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { computeAvailableSlots, type WeeklyBlock, type AvailabilityException } from '../_shared/slotEngine.ts';

const EXCLUSION_VIOLATION = '23P01';

function validateClient(client: { name?: string; phone?: string; email?: string }) {
  const errors: Record<string, string> = {};
  if (!client.name || !client.name.trim()) errors.name = 'Necesitamos tu nombre para la reserva.';
  if (!client.phone || !/^[0-9+\s()-]{8,}$/.test(client.phone.trim())) errors.phone = 'Ingresa un teléfono válido.';
  if (!client.email || !/^\S+@\S+\.\S+$/.test(client.email.trim())) errors.email = 'Ingresa un email válido.';
  return errors;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('body inválido', 400);
  }

  const { tenantSlug, professionalId = 'any', serviceIds, date, startMinute, client, paymentMethod } = body || {};
  if (!tenantSlug || !Array.isArray(serviceIds) || !serviceIds.length || !date || typeof startMinute !== 'number' || !client || !paymentMethod) {
    return errorResponse('faltan campos requeridos', 400);
  }
  const clientErrors = validateClient(client);
  if (Object.keys(clientErrors).length) return jsonResponse({ error: 'datos de cliente inválidos', fields: clientErrors }, 400);

  const db = supabaseAdmin();

  const { data: tenant, error: tenantErr } = await db
    .from('tenants')
    .select('id, timezone, min_lead_time_min, slot_interval_min')
    .eq('slug', tenantSlug)
    .maybeSingle();
  if (tenantErr) return errorResponse(tenantErr.message, 500);
  if (!tenant) return errorResponse('tenant no encontrado', 404);

  const { data: payMethods, error: payErr } = await db
    .from('tenant_payment_methods')
    .select('method')
    .eq('tenant_id', tenant.id)
    .eq('enabled', true);
  if (payErr) return errorResponse(payErr.message, 500);
  if (!(payMethods || []).some((m) => m.method === paymentMethod)) {
    return errorResponse('método de pago no disponible para este salón', 400);
  }

  const { data: services, error: svcErr } = await db
    .from('services')
    .select('id, name, price_clp, duration_min, buffer_before_min, buffer_after_min, deposit_amount_clp')
    .eq('tenant_id', tenant.id)
    .eq('active', true)
    .in('id', serviceIds);
  if (svcErr) return errorResponse(svcErr.message, 500);
  if (!services || services.length !== serviceIds.length) {
    return errorResponse('uno o más servicios no existen o no están activos', 400);
  }
  const orderedServices = serviceIds.map((id: string) => services.find((s) => s.id === id)!);

  let candidateIds: string[];
  if (professionalId !== 'any') {
    const { data: pro, error: proErr } = await db
      .from('professionals')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('id', professionalId)
      .eq('active', true)
      .maybeSingle();
    if (proErr) return errorResponse(proErr.message, 500);
    if (!pro) return errorResponse('profesional no encontrado', 404);
    candidateIds = [pro.id];
  } else {
    const { data: pros, error: prosErr } = await db.from('professionals').select('id').eq('tenant_id', tenant.id).eq('active', true).order('id');
    if (prosErr) return errorResponse(prosErr.message, 500);
    candidateIds = (pros || []).map((p) => p.id);
  }
  if (!candidateIds.length) return errorResponse('no hay profesionales disponibles', 404);

  const { data: proSvcRows, error: psErr } = await db
    .from('professional_services')
    .select('professional_id, service_id')
    .in('professional_id', candidateIds)
    .in('service_id', serviceIds);
  if (psErr) return errorResponse(psErr.message, 500);
  const capableCount = new Map<string, number>();
  for (const row of proSvcRows || []) capableCount.set(row.professional_id, (capableCount.get(row.professional_id) || 0) + 1);
  candidateIds = candidateIds.filter((id) => capableCount.get(id) === serviceIds.length);
  if (!candidateIds.length) return errorResponse('ningún profesional puede realizar esta combinación de servicios', 409);

  const dayStart = Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: tenant.timezone }).toInstant();
  const dayEnd = Temporal.PlainDate.from(date).add({ days: 1 }).toZonedDateTime({ timeZone: tenant.timezone }).toInstant();

  const [{ data: blocks }, { data: exceptions }, { data: bookings }] = await Promise.all([
    db.from('availability_blocks').select('professional_id, weekday, start_min, end_min').in('professional_id', candidateIds),
    db.from('availability_exceptions').select('professional_id, date, type, start_min, end_min').in('professional_id', candidateIds).eq('date', date),
    db
      .from('bookings')
      .select('professional_id, start_at, end_at, buffer_before_min, buffer_after_min, status')
      .in('professional_id', candidateIds)
      .neq('status', 'cancelada')
      .gte('start_at', dayStart.toString())
      .lt('start_at', dayEnd.toString()),
  ]);

  const itemsPayload = orderedServices.map((s: any) => ({
    service_id: s.id,
    name: s.name,
    price: s.price_clp,
    duration_min: s.duration_min,
    buffer_before_min: s.buffer_before_min,
    buffer_after_min: s.buffer_after_min,
    deposit_amount_clp: s.deposit_amount_clp,
  }));

  for (const professionalIdCandidate of candidateIds) {
    const weeklyBlocks: WeeklyBlock[] = (blocks || [])
      .filter((b) => b.professional_id === professionalIdCandidate)
      .map((b) => ({ weekday: b.weekday, start: b.start_min, end: b.end_min }));
    const proExceptions: AvailabilityException[] = (exceptions || [])
      .filter((e) => e.professional_id === professionalIdCandidate)
      .map((e) => ({ date: e.date, type: e.type, start: e.start_min, end: e.end_min }));
    const existingBookings = (bookings || [])
      .filter((b) => b.professional_id === professionalIdCandidate)
      .map((b) => ({ startInstant: b.start_at, endInstant: b.end_at, bufferBeforeMin: b.buffer_before_min, bufferAfterMin: b.buffer_after_min, status: b.status }));

    const slots = computeAvailableSlots({
      timeZone: tenant.timezone,
      date,
      services: orderedServices.map((s: any) => ({ id: s.id, durationMin: s.duration_min, bufferBeforeMin: s.buffer_before_min, bufferAfterMin: s.buffer_after_min })),
      weeklyBlocks,
      exceptions: proExceptions,
      existingBookings,
      minLeadTimeMin: tenant.min_lead_time_min,
      slotIntervalMin: tenant.slot_interval_min,
    });
    const match = slots.find((s) => s.startMinute === startMinute);
    if (!match) continue; // ya no está libre para este profesional, probar el siguiente candidato

    const { data: booking, error: rpcErr } = await db.rpc('create_booking', {
      p_tenant_id: tenant.id,
      p_professional_id: professionalIdCandidate,
      p_client_name: client.name.trim(),
      p_client_phone: client.phone.trim(),
      p_client_email: client.email.trim(),
      p_notes: client.notes || null,
      p_start_at: match.startInstant,
      p_items: itemsPayload,
      p_payment_method: paymentMethod,
      p_source: 'public',
    });

    if (!rpcErr) {
      return jsonResponse(
        {
          booking: {
            id: booking.id,
            publicToken: booking.public_token,
            status: booking.status,
            startAt: booking.start_at,
            endAt: booking.end_at,
            totalPriceClp: booking.total_price_clp,
            depositAmountClp: booking.deposit_amount_clp,
            loyaltyDiscountClp: booking.loyalty_discount_clp,
            loyaltyTierApplied: booking.loyalty_tier_applied,
            paymentMethod: booking.payment_method,
            manageUrl: `/${tenantSlug}/reserva/${booking.public_token}`,
          },
        },
        201
      );
    }
    if (rpcErr.code !== EXCLUSION_VIOLATION) return errorResponse(rpcErr.message, 500);
    // exclusion_violation: otra reserva ganó la carrera para este profesional, probar el siguiente
  }

  return errorResponse('el horario ya no está disponible, por favor elige otro', 409);
});
