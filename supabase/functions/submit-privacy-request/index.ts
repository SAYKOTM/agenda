// POST /submit-privacy-request { requestType, fullName, email, phone?, tenantSlug?, message? }
//
// Canal ARCOP público (Ley 21.719, arts. 4-9 y 11): registra la solicitud en privacy_requests y,
// si hay un salón indicado, queda visible para su admin en /panel/privacidad; si no, solo es
// visible por service_role (Supabase Studio) -- ver comentario en la migración 0041. Envía una
// confirmación simple por email al solicitante, best-effort (si Resend falla, la solicitud igual
// queda guardada: no tiene sentido perderla por un problema de envío).
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts';

const REQUEST_TYPES = new Set(['acceso', 'rectificacion', 'cancelacion', 'oposicion', 'portabilidad', 'bloqueo']);

function validate(body: any) {
  const errors: Record<string, string> = {};
  const requestType = (body.requestType || '').trim();
  const fullName = (body.fullName || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim();
  const tenantSlug = (body.tenantSlug || '').trim().toLowerCase();
  const message = (body.message || '').trim();

  if (!REQUEST_TYPES.has(requestType)) errors.requestType = 'Elige qué derecho quieres ejercer.';
  if (fullName.length < 2) errors.fullName = 'Ingresa tu nombre.';
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Ingresa un email válido.';

  return { errors, values: { requestType, fullName, email, phone, tenantSlug, message } };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendConfirmationEmail(email: string, fullName: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !fromEmail) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: 'Recibimos tu solicitud sobre tus datos personales',
        html: `<p>Hola ${escapeHtml(fullName || '')},</p><p>Recibimos tu solicitud sobre tus datos personales. La responderemos dentro de los plazos que establece la Ley 21.719 (30 días corridos, prorrogables una vez por otros 30 si es compleja).</p><p>Si no la enviaste tú, ignora este correo.</p>`,
      }),
    });
  } catch (_e) {
    // best-effort: un fallo de envío no debe hacer perder la solicitud ya guardada.
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  // 5 solicitudes por hora por IP: alcanza de sobra para uso legítimo, corta el spam del formulario.
  if (!(await checkRateLimit(`submit-privacy-request:${clientIp(req)}`, 5, 3600))) {
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
  const { requestType, fullName, email, phone, tenantSlug, message } = values;

  const db = supabaseAdmin();

  let tenantId: string | null = null;
  if (tenantSlug) {
    const { data: tenant } = await db.from('tenants').select('id').eq('slug', tenantSlug).maybeSingle();
    tenantId = tenant?.id || null;
  }

  const { data: created, error: insertErr } = await db
    .from('privacy_requests')
    .insert({
      tenant_id: tenantId,
      request_type: requestType,
      full_name: fullName,
      email,
      phone: phone || null,
      message: message || null,
    })
    .select('id')
    .single();
  if (insertErr) return errorResponse(insertErr.message, 500);

  await sendConfirmationEmail(email, fullName);

  return jsonResponse({ id: created.id }, 201);
});
