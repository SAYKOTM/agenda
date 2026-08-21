// POST /invite-professional { name, email, roleTitle, role }
// Header: Authorization: Bearer <access token del profesional que invita>
//
// A diferencia del resto de las Edge Functions (públicas, sin auth), esta la llama el panel
// autenticado: valida el JWT del caller, confirma que es 'admin' de un tenant activo, y recién
// ahí usa supabaseAdmin (service role) para invitar por email -- crea el auth.user y dispara el
// correo de invitación de Supabase Auth -- y crear la fila de `professionals` ya enlazada.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return errorResponse('falta autenticación', 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('body inválido', 400);
  }
  const { name, email, roleTitle, role } = body || {};
  if (!name?.trim() || !email?.trim()) return errorResponse('nombre y email son requeridos', 400);
  if (role !== 'admin' && role !== 'professional') return errorResponse('role debe ser admin o professional', 400);

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
    return errorResponse('solo un administrador puede invitar profesionales', 403);
  }

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() || '')
    .join('');

  const { data: invited, error: inviteErr } = await db.auth.admin.inviteUserByEmail(email.trim());
  if (inviteErr) return errorResponse(`no pudimos invitar por email: ${inviteErr.message}`, 400);

  const { data: professional, error: insertErr } = await db
    .from('professionals')
    .insert({
      tenant_id: caller.tenant_id,
      auth_user_id: invited.user.id,
      name: name.trim(),
      role_title: roleTitle || null,
      initials: initials || '??',
      role,
      email: email.trim(),
      active: true,
    })
    .select()
    .single();
  if (insertErr) return errorResponse(insertErr.message, 500);

  return jsonResponse({ professional });
});
