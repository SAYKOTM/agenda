// POST /invite-professional { name, email, roleTitle, role }
// Header: Authorization: Bearer <access token del profesional que invita>
//
// A diferencia del resto de las Edge Functions (públicas, sin auth), esta la llama el panel
// autenticado: valida el JWT del caller, confirma que es 'admin' de un tenant activo, y recién
// ahí usa supabaseAdmin (service role) para crear el auth.user con su link de invitación y la
// fila de `professionals` ya enlazada.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

// El correo de invitación NO sale por el SMTP incorporado de Supabase: ese está limitado a un
// puñado de correos por hora y la propia documentación lo da como "solo para desarrollo" -- al
// segundo profesional invitado en el día contestaba "email rate limit exceeded" y no se podía
// sumar a nadie. Se genera el link con la API de admin (generateLink NO manda nada) y se envía
// con Resend, el mismo proveedor que ya usa el resto del producto para los correos al cliente.
async function sendInviteEmail(to: string, link: string, tenantName: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !fromEmail) return false;

  const safeTenant = tenantName.replace(/</g, '&lt;');
  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0F172A">
      <h1 style="font-size:20px;margin:0 0 8px">Te sumaron al equipo de ${safeTenant}</h1>
      <p style="font-size:14px;line-height:1.5;color:#475569;margin:0 0 20px">
        Desde tu panel vas a manejar tu agenda, tus servicios y tus horarios. Entrá con este botón y elegí tu
        contraseña para poder abrirlo también desde el teléfono.
      </p>
      <a href="${link}" style="display:inline-block;background:#0F172A;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:12px">
        Activar mi cuenta
      </a>
      <p style="font-size:12px;line-height:1.5;color:#94A3B8;margin:20px 0 0">
        Si el botón no funciona, copiá y pegá este link en tu navegador:<br />
        <span style="word-break:break-all">${link}</span>
      </p>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to, subject: `Tu acceso al panel de ${tenantName}`, html }),
    });
    if (!res.ok) {
      console.error('[invite] Resend respondió', res.status, (await res.text().catch(() => '')).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[invite] no pudimos enviar el correo:', e);
    return false;
  }
}

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
    .select('id, tenant_id, role, active, tenants(name)')
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

  // redirectTo: sin esto el link cae en el Site URL del proyecto (la portada pública) en vez del
  // panel, donde la persona elige su contraseña y empieza a trabajar.
  const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
  const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
    type: 'invite',
    email: email.trim(),
    options: { redirectTo: `${appUrl}/panel` },
  });
  if (linkErr) return errorResponse(`no pudimos crear la invitación: ${linkErr.message}`, 400);

  const inviteLink = linkData?.properties?.action_link;
  const invitedUserId = linkData?.user?.id;
  if (!inviteLink || !invitedUserId) return errorResponse('no pudimos crear la invitación', 500);

  const { data: professional, error: insertErr } = await db
    .from('professionals')
    .insert({
      tenant_id: caller.tenant_id,
      auth_user_id: invitedUserId,
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

  const tenantName = (caller as any).tenants?.name || 'tu salón';
  const emailSent = await sendInviteEmail(email.trim(), inviteLink, tenantName);

  // El link también vuelve al panel: si el correo no salió (o la persona no revisa el mail, que
  // es lo habitual en un salón) el admin se lo pasa por WhatsApp y listo.
  return jsonResponse({ professional, inviteLink, emailSent });
});
