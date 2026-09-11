// POST /remove-professional { professionalId }
// Header: Authorization: Bearer <access token del admin que borra>
//
// Borrar a alguien del equipo es de dos pasos a propósito: primero se le da de baja (queda sin
// acceso pero con su historial intacto) y recién a una persona ya dada de baja se la puede
// eliminar. Así un toque mal dado no se lleva puesto a un profesional activo.
//
// Va en una Edge Function y no en un delete directo desde el panel porque además de la fila de
// `professionals` hay que borrar el usuario de auth: si queda huérfano, volver a invitar ese
// mismo correo falla con "ya registrado" y el admin no entiende por qué.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return errorResponse('falta autenticación', 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('body inválido', 400);
  }
  const professionalId = body?.professionalId;
  if (!professionalId) return errorResponse('falta professionalId', 400);

  const db = supabaseAdmin();

  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return errorResponse('sesión inválida', 401);

  const { data: caller, error: callerErr } = await db
    .from('professionals')
    .select('id, tenant_id, role, active')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (callerErr) return errorResponse(callerErr.message, 500);
  if (!caller || !caller.active || caller.role !== 'admin') {
    return errorResponse('solo un administrador puede eliminar profesionales', 403);
  }

  const { data: target, error: targetErr } = await db
    .from('professionals')
    .select('id, tenant_id, auth_user_id, active, name')
    .eq('id', professionalId)
    .maybeSingle();
  if (targetErr) return errorResponse(targetErr.message, 500);
  if (!target || target.tenant_id !== caller.tenant_id) return errorResponse('ese profesional no es de tu salón', 404);
  if (target.id === caller.id) return errorResponse('no podés eliminar tu propia cuenta', 400);
  if (target.active) return errorResponse('primero dale de baja y después eliminá su cuenta', 400);

  // bookings.professional_id es "on delete restrict": quien ya atendió tiene historial de citas y
  // borrarlo dejaría la agenda sin dueño. Se avisa con nombre y apellido en vez de devolver el
  // error crudo de Postgres.
  const { count, error: countErr } = await db
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', target.id);
  if (countErr) return errorResponse(countErr.message, 500);
  if ((count || 0) > 0) {
    return errorResponse(
      `${target.name} tiene ${count} cita${count === 1 ? '' : 's'} en la agenda, así que su cuenta no se puede borrar. Dado de baja ya no tiene acceso ni aparece en el link público.`,
      409
    );
  }

  const { error: deleteErr } = await db.from('professionals').delete().eq('id', target.id);
  if (deleteErr) return errorResponse(deleteErr.message, 500);

  // El usuario de auth se borra después de la fila: si esto falla, el equipo ya quedó limpio y lo
  // único que queda es una cuenta sin panel, que no da acceso a nada.
  if (target.auth_user_id) {
    const { error: authErr } = await db.auth.admin.deleteUser(target.auth_user_id);
    if (authErr) console.error('[remove-professional] no pudimos borrar el usuario de auth:', authErr.message);
  }

  return jsonResponse({ ok: true });
});
