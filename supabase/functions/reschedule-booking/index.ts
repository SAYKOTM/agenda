// POST /reschedule-booking { token, date: 'YYYY-MM-DD', startMinute }
//
// Mueve una reserva activa a un nuevo horario con el mismo profesional y los mismos servicios
// (se reusan buffer_before_min/buffer_after_min y la duración ya guardados en la reserva).
// Revalida disponibilidad excluyendo la propia reserva de la lista de ocupados, y confía en el
// constraint de exclusión como respaldo final ante condiciones de carrera (409 si perdió la
// carrera contra otra reserva nueva).
import { Temporal } from '@js-temporal/polyfill';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { computeAvailableSlots, type WeeklyBlock, type AvailabilityException } from '../_shared/slotEngine.ts';

const EXCLUSION_VIOLATION = '23P01';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('body inválido', 400);
  }
  const { token, date, startMinute } = body || {};
  if (!token || !date || typeof startMinute !== 'number') return errorResponse('faltan campos requeridos', 400);

  const db = supabaseAdmin();
  const { data: booking, error: findErr } = await db
    .from('bookings')
    .select('id, tenant_id, professional_id, status, start_at, end_at, buffer_before_min, buffer_after_min, tenants(timezone, min_lead_time_min, slot_interval_min)')
    .eq('public_token', token)
    .maybeSingle();
  if (findErr) return errorResponse(findErr.message, 500);
  if (!booking) return errorResponse('reserva no encontrada', 404);
  if (booking.status === 'cancelada' || booking.status === 'completada') {
    return errorResponse('esta reserva ya no se puede reagendar', 409);
  }
  const tenant = booking.tenants as any;
  const coreDurationMin = Math.round((new Date(booking.end_at).getTime() - new Date(booking.start_at).getTime()) / 60000);

  const dayStart = Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: tenant.timezone }).toInstant();
  const dayEnd = Temporal.PlainDate.from(date).add({ days: 1 }).toZonedDateTime({ timeZone: tenant.timezone }).toInstant();

  const [{ data: blocks }, { data: exceptions }, { data: bookings }] = await Promise.all([
    db.from('availability_blocks').select('weekday, start_min, end_min').eq('professional_id', booking.professional_id),
    db.from('availability_exceptions').select('date, type, start_min, end_min').eq('professional_id', booking.professional_id).eq('date', date),
    db
      .from('bookings')
      .select('id, start_at, end_at, buffer_before_min, buffer_after_min, status')
      .eq('professional_id', booking.professional_id)
      .neq('status', 'cancelada')
      .neq('id', booking.id) // la propia reserva no debe contar como "ocupada" contra sí misma
      .gte('start_at', dayStart.toString())
      .lt('start_at', dayEnd.toString()),
  ]);

  const weeklyBlocks: WeeklyBlock[] = (blocks || []).map((b) => ({ weekday: b.weekday, start: b.start_min, end: b.end_min }));
  const proExceptions: AvailabilityException[] = (exceptions || []).map((e) => ({ date: e.date, type: e.type, start: e.start_min, end: e.end_min }));
  const existingBookings = (bookings || []).map((b) => ({ startInstant: b.start_at, endInstant: b.end_at, bufferBeforeMin: b.buffer_before_min, bufferAfterMin: b.buffer_after_min, status: b.status }));

  const slots = computeAvailableSlots({
    timeZone: tenant.timezone,
    date,
    services: [{ id: 'combo', durationMin: coreDurationMin, bufferBeforeMin: booking.buffer_before_min, bufferAfterMin: booking.buffer_after_min }],
    weeklyBlocks,
    exceptions: proExceptions,
    existingBookings,
    minLeadTimeMin: tenant.min_lead_time_min,
    slotIntervalMin: tenant.slot_interval_min,
  });
  const match = slots.find((s) => s.startMinute === startMinute);
  if (!match) return errorResponse('ese horario ya no está disponible, por favor elige otro', 409);

  const newEndAt = Temporal.Instant.from(match.startInstant).add({ minutes: coreDurationMin }).toString();
  const { data: updated, error: updErr } = await db
    .from('bookings')
    .update({ start_at: match.startInstant, end_at: newEndAt })
    .eq('id', booking.id)
    .select()
    .single();

  if (updErr) {
    if ((updErr as any).code === EXCLUSION_VIOLATION) return errorResponse('ese horario ya no está disponible, por favor elige otro', 409);
    return errorResponse(updErr.message, 500);
  }

  return jsonResponse({ booking: updated });
});
