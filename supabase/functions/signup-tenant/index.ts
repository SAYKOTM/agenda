// POST /signup-tenant { name, slug, ownerName, email, password }
//
// Self-signup autónomo: cualquier dueño de salón crea su propio espacio sin intervención manual.
// A diferencia de invite-professional (que exige un admin ya logueado), esta función es pública
// -- así que ella misma es la única autoridad que decide qué se crea. Usa el service role para:
// 1) crear el auth.user ya confirmado (email_confirm: true), sin depender de si el proyecto tiene
//    "Confirm email" activado -- así el auto-login del frontend funciona siempre.
// 2) invocar create_tenant_with_owner (migración 0023), que inserta tenant + professional 'admin'
//    en una sola transacción. Esa función solo tiene EXECUTE otorgado a service_role.
// Si el paso 2 falla, se borra el auth.user recién creado para no dejar una cuenta huérfana que
// bloquee un reintento con el mismo email.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts';

const UNIQUE_VIOLATION = '23505';
const RESERVED_SLUGS = new Set([
  'registro', 'crear-salon', 'panel', 'api', 'admin', 'auth', 'login', 'logout', 'app',
  'static', 'assets', 'home', 'www', 'soporte', 'ayuda', 'terminos', 'privacidad', 'signup',
  'dashboard', 'public', 'null', 'undefined', 'solicitud-datos',
]);

function validate(body: any) {
  const errors: Record<string, string> = {};
  const name = (body.name || '').trim();
  const slug = (body.slug || '').trim().toLowerCase();
  const ownerName = (body.ownerName || '').trim();
  const email = (body.email || '').trim();
  const password = body.password || '';

  if (name.length < 2) errors.name = 'Ingresa el nombre del local.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 40) {
    errors.slug = 'El link solo puede tener minúsculas, números y guiones (3 a 40 caracteres).';
  } else if (RESERVED_SLUGS.has(slug)) {
    errors.slug = 'Ese link está reservado, elige otro.';
  }
  if (ownerName.length < 2) errors.ownerName = 'Ingresa tu nombre.';
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Ingresa un email válido.';
  if (password.length < 8) errors.password = 'La contraseña debe tener al menos 8 caracteres.';

  return { errors, values: { name, slug, ownerName, email, password } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  // 5 salones nuevos por hora por IP: de sobra para alguien probando el signup a mano, corta un
  // script creando cuentas en masa.
  if (!(await checkRateLimit(`signup-tenant:${clientIp(req)}`, 5, 3600))) {
    return errorResponse('demasiadas solicitudes, intenta de nuevo más tarde', 429);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('body inválido', 400);
  }

  const { errors, values } = validate(body || {});
  if (Object.keys(errors).length) return jsonResponse({ error: 'datos inválidos', fields: errors }, 400);
  const { name, slug, ownerName, email, password } = values;

  const db = supabaseAdmin();

  const { data: existingSlug, error: slugCheckErr } = await db.from('tenants').select('id').eq('slug', slug).maybeSingle();
  if (slugCheckErr) return errorResponse(slugCheckErr.message, 500);
  if (existingSlug) return jsonResponse({ error: 'Ese link ya está en uso', fields: { slug: 'Ese link ya está en uso.' } }, 409);

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    const message = /already.*registered|already exists/i.test(createErr.message)
      ? 'Ya existe una cuenta con ese email.'
      : createErr.message;
    return jsonResponse({ error: message, fields: /already/i.test(createErr.message) ? { email: message } : undefined }, 400);
  }
  const authUserId = created.user.id;

  const { data: result, error: rpcErr } = await db.rpc('create_tenant_with_owner', {
    p_name: name,
    p_slug: slug,
    p_owner_name: ownerName,
    p_owner_email: email,
    p_auth_user_id: authUserId,
  });

  if (rpcErr) {
    await db.auth.admin.deleteUser(authUserId);
    if (rpcErr.code === UNIQUE_VIOLATION) {
      return jsonResponse({ error: 'Ese link ya está en uso', fields: { slug: 'Ese link ya está en uso.' } }, 409);
    }
    return errorResponse(rpcErr.message, 500);
  }

  return jsonResponse({ tenantId: result.tenantId, slug: result.slug }, 201);
});
