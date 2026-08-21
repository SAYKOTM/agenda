// GET /available-slots?tenantSlug=roble-barberia&serviceIds=<id1,id2>&date=2026-08-19&professionalId=<uuid|any>
//
// Devuelve los horarios disponibles para uno o varios servicios (combo) en una fecha dada.
// Si professionalId es 'any' (o se omite), se calculan los cupos de todos los profesionales
// capaces de realizar TODOS los servicios pedidos y se devuelve la unión, indicando en cada
// slot qué profesionales concretos lo tienen libre (create-booking vuelve a resolverlo al
// momento de reservar, para evitar condiciones de carrera).
import { Temporal } from '@js-temporal/polyfill';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { computeAvailableSlots, type WeeklyBlock, type AvailabilityException } from '../_shared/slotEngine.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return errorResponse('method_not_allowed', 405);

  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get('tenantSlug');
  const date = url.searchParams.get('date');
  const serviceIdsParam = url.searchParams.get('serviceIds');
  const professionalIdParam = url.searchParams.get('professionalId') || 'any';
  const excludeBookingId = url.searchParams.get('excludeBookingId'); // reagendar: no contar la propia reserva como ocupada

  if (!tenantSlug || !date || !serviceIdsParam) {
    return errorResponse('faltan parámetros: tenantSlug, date, serviceIds son requeridos', 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorResponse('date debe tener formato YYYY-MM-DD', 400);
  const serviceIds = serviceIdsParam.split(',').filter(Boolean);
  if (!serviceIds.length) return errorResponse('serviceIds no puede estar vacío', 400);

  const db = supabaseAdmin();

  const { data: tenant, error: tenantErr } = await db
    .from('tenants')
    .select('id, timezone, min_lead_time_min, slot_interval_min')
    .eq('slug', tenantSlug)
    .maybeSingle();
  if (tenantErr) return errorResponse(tenantErr.message, 500);
  if (!tenant) return errorResponse('tenant no encontrado', 404);

  const { data: services, error: svcErr } = await db
    .from('services')
    .select('id, duration_min, buffer_before_min, buffer_after_min')
    .eq('tenant_id', tenant.id)
    .eq('active', true)
    .in('id', serviceIds);
  if (svcErr) return errorResponse(svcErr.message, 500);
  if (!services || services.length !== serviceIds.length) {
    return errorResponse('uno o más servicios no existen o no están activos', 400);
  }
  // se preserva el orden en que el cliente los eligió (afecta a qué extremo del combo se le
  // aplica el buffer_before del primero y el buffer_after del último)
  const orderedServices = serviceIds.map((id) => services.find((s) => s.id === id)!);

  // ---------- candidatos: profesionales capaces de hacer TODOS los servicios pedidos ----------
  let professionalIds: string[];
  if (professionalIdParam !== 'any') {
    const { data: pro, error: proErr } = await db
      .from('professionals')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('id', professionalIdParam)
      .eq('active', true)
      .maybeSingle();
    if (proErr) return errorResponse(proErr.message, 500);
    if (!pro) return errorResponse('profesional no encontrado', 404);
    professionalIds = [pro.id];
  } else {
    const { data: pros, error: prosErr } = await db
      .from('professionals')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('active', true);
    if (prosErr) return errorResponse(prosErr.message, 500);
    professionalIds = (pros || []).map((p) => p.id);
  }
  if (!professionalIds.length) return jsonResponse({ slots: [] });

  const { data: proSvcRows, error: psErr } = await db
    .from('professional_services')
    .select('professional_id, service_id')
    .in('professional_id', professionalIds)
    .in('service_id', serviceIds);
  if (psErr) return errorResponse(psErr.message, 500);
  const capableCount = new Map<string, number>();
  for (const row of proSvcRows || []) {
    capableCount.set(row.professional_id, (capableCount.get(row.professional_id) || 0) + 1);
  }
  const capableProfessionalIds = professionalIds.filter((id) => capableCount.get(id) === serviceIds.length);
  if (!capableProfessionalIds.length) return jsonResponse({ slots: [] });

  // ---------- ventana del día local, para acotar la consulta de bloques/excepciones/reservas ----------
  const dayStart = Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: tenant.timezone }).toInstant();
  const dayEnd = Temporal.PlainDate.from(date)
    .add({ days: 1 })
    .toZonedDateTime({ timeZone: tenant.timezone })
    .toInstant();

  let bookingsQuery = db
    .from('bookings')
    .select('professional_id, start_at, end_at, buffer_before_min, buffer_after_min, status')
    .in('professional_id', capableProfessionalIds)
    .neq('status', 'cancelada')
    .gte('start_at', dayStart.toString())
    .lt('start_at', dayEnd.toString());
  if (excludeBookingId) bookingsQuery = bookingsQuery.neq('id', excludeBookingId);

  const [{ data: blocks, error: blocksErr }, { data: exceptions, error: excErr }, { data: bookings, error: bkErr }] = await Promise.all([
    db.from('availability_blocks').select('professional_id, weekday, start_min, end_min').in('professional_id', capableProfessionalIds),
    db.from('availability_exceptions').select('professional_id, date, type, start_min, end_min').in('professional_id', capableProfessionalIds).eq('date', date),
    bookingsQuery,
  ]);
  if (blocksErr) return errorResponse(blocksErr.message, 500);
  if (excErr) return errorResponse(excErr.message, 500);
  if (bkErr) return errorResponse(bkErr.message, 500);

  const slotsByStart = new Map<number, { startMinute: number; startInstant: string; endInstant: string; professionalIds: string[] }>();

  for (const professionalId of capableProfessionalIds) {
    const weeklyBlocks: WeeklyBlock[] = (blocks || [])
      .filter((b) => b.professional_id === professionalId)
      .map((b) => ({ weekday: b.weekday, start: b.start_min, end: b.end_min }));
    const proExceptions: AvailabilityException[] = (exceptions || [])
      .filter((e) => e.professional_id === professionalId)
      .map((e) => ({ date: e.date, type: e.type, start: e.start_min, end: e.end_min }));
    const existingBookings = (bookings || [])
      .filter((b) => b.professional_id === professionalId)
      .map((b) => ({
        startInstant: b.start_at,
        endInstant: b.end_at,
        bufferBeforeMin: b.buffer_before_min,
        bufferAfterMin: b.buffer_after_min,
        status: b.status,
      }));

    const result = computeAvailableSlots({
      timeZone: tenant.timezone,
      date,
      services: orderedServices.map((s) => ({
        id: s.id,
        durationMin: s.duration_min,
        bufferBeforeMin: s.buffer_before_min,
        bufferAfterMin: s.buffer_after_min,
      })),
      weeklyBlocks,
      exceptions: proExceptions,
      existingBookings,
      minLeadTimeMin: tenant.min_lead_time_min,
      slotIntervalMin: tenant.slot_interval_min,
    });

    for (const slot of result) {
      const existing = slotsByStart.get(slot.startMinute);
      if (existing) existing.professionalIds.push(professionalId);
      else
        slotsByStart.set(slot.startMinute, {
          startMinute: slot.startMinute,
          startInstant: slot.startInstant,
          endInstant: slot.endInstant,
          professionalIds: [professionalId],
        });
    }
  }

  const slots = Array.from(slotsByStart.values()).sort((a, b) => a.startMinute - b.startMinute);
  return jsonResponse({ slots });
});
