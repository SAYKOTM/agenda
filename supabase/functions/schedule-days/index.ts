// GET /schedule-days?tenantSlug=roble-barberia&serviceIds=<id1,id2>&professionalId=<uuid|any>&month=2026-08
//
// Devuelve, para el mes pedido, el horario semanal recurrente y las excepciones puntuales de
// TODOS los profesionales capaces de realizar los servicios pedidos (o del profesional puntual
// si se pasa uno concreto). No expone reservas ni datos de clientes -- solo horarios, igual que
// ya hace /available-slots al calcular cupos -- así el selector de fecha del cliente (SlotPicker)
// puede deshabilitar visualmente, sin más viajes al servidor por día, los días en los que ningún
// profesional capaz trabaja.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return errorResponse('method_not_allowed', 405);

  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get('tenantSlug');
  const month = url.searchParams.get('month'); // 'YYYY-MM'
  const serviceIdsParam = url.searchParams.get('serviceIds');
  const professionalIdParam = url.searchParams.get('professionalId') || 'any';

  if (!tenantSlug || !month || !serviceIdsParam) {
    return errorResponse('faltan parámetros: tenantSlug, month, serviceIds son requeridos', 400);
  }
  if (!/^\d{4}-\d{2}$/.test(month)) return errorResponse('month debe tener formato YYYY-MM', 400);
  const serviceIds = serviceIdsParam.split(',').filter(Boolean);
  if (!serviceIds.length) return errorResponse('serviceIds no puede estar vacío', 400);

  const db = supabaseAdmin();

  const { data: tenant, error: tenantErr } = await db.from('tenants').select('id').eq('slug', tenantSlug).maybeSingle();
  if (tenantErr) return errorResponse(tenantErr.message, 500);
  if (!tenant) return errorResponse('tenant no encontrado', 404);

  const { data: services, error: svcErr } = await db
    .from('services')
    .select('id, professional_id')
    .eq('tenant_id', tenant.id)
    .eq('active', true)
    .in('id', serviceIds);
  if (svcErr) return errorResponse(svcErr.message, 500);
  if (!services || services.length !== serviceIds.length) {
    return errorResponse('uno o más servicios no existen o no están activos', 400);
  }

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
  if (!professionalIds.length) return jsonResponse({ professionalIds: [], blocks: [], exceptions: [] });

  // Cada servicio pertenece a UN solo profesional (ver 0020_professional_owned_services.sql): un
  // combo de varios servicios solo es realizable si TODOS son del mismo dueño.
  const ownerIds = new Set(services.map((s) => s.professional_id));
  const capableProfessionalIds =
    ownerIds.size === 1 ? professionalIds.filter((id) => id === [...ownerIds][0]) : [];
  if (!capableProfessionalIds.length) return jsonResponse({ professionalIds: [], blocks: [], exceptions: [] });

  const [year, monthNum] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const [{ data: blocks, error: blocksErr }, { data: exceptions, error: excErr }] = await Promise.all([
    db.from('availability_blocks').select('professional_id, weekday, start_min, end_min').in('professional_id', capableProfessionalIds),
    db
      .from('availability_exceptions')
      .select('professional_id, date, type, start_min, end_min')
      .in('professional_id', capableProfessionalIds)
      .gte('date', monthStart)
      .lte('date', monthEnd),
  ]);
  if (blocksErr) return errorResponse(blocksErr.message, 500);
  if (excErr) return errorResponse(excErr.message, 500);

  return jsonResponse({ professionalIds: capableProfessionalIds, blocks: blocks || [], exceptions: exceptions || [] });
});
