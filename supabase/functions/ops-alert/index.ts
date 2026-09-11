// POST /ops-alert { alert_id }
// Header: X-Webhook-Secret (el mismo NOTIFICATION_DISPATCH_SECRET)
//
// Manda al operador el correo de una alerta levantada por check_system_health() (migración 0048).
// La llama Postgres vía pg_net, igual que send-notification: no hay JWT de usuario porque quien
// llama es la base de datos.
//
// No reusa NotificationService a propósito: ese servicio existe para hablarle al CLIENTE de un
// salón, con plantillas de reserva. Esto es correo de operación para una sola persona, y mezclarlo
// significaría que un cambio en la plantilla de confirmación pueda romper la alarma -- exactamente
// la pieza que tiene que seguir funcionando cuando todo lo demás falla.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const expected = Deno.env.get('NOTIFICATION_DISPATCH_SECRET') || '';
  if (!expected || (req.headers.get('X-Webhook-Secret') || '') !== expected) return errorResponse('no autorizado', 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('body inválido', 400);
  }
  if (!body?.alert_id) return errorResponse('falta alert_id', 400);

  const db = supabaseAdmin();
  const { data: alert } = await db
    .from('system_alerts')
    .select('id, key, severity, title, detail, created_at, notified_at')
    .eq('id', body.alert_id)
    .maybeSingle();

  if (!alert) return jsonResponse({ skipped: true });
  if (alert.notified_at) return jsonResponse({ skipped: true, reason: 'ya notificada' });

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');
  // Si no está definido, va al mismo buzón que recibe los avisos de la plataforma.
  const to = Deno.env.get('OPS_ALERT_EMAIL');
  if (!apiKey || !from || !to) {
    console.error('[OPS] falta RESEND_API_KEY / RESEND_FROM_EMAIL / OPS_ALERT_EMAIL');
    return jsonResponse({ ok: false }, 200);
  }

  const isCritical = alert.severity === 'critical';
  const color = isCritical ? '#A62E1E' : '#92570A';
  const subject = `${isCritical ? '🔴' : '🟠'} Agenda: ${alert.title}`;
  const html = `
    <div style="font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F172A;max-width:560px;">
      <p style="margin:0 0 4px;font:600 12px/1 monospace;letter-spacing:.08em;text-transform:uppercase;color:${color};">
        ${isCritical ? 'Crítico' : 'Atención'}
      </p>
      <h1 style="margin:0 0 12px;font-size:19px;letter-spacing:-.02em;">${escapeHtml(alert.title)}</h1>
      <pre style="margin:0 0 16px;padding:12px 14px;background:#F1F2F5;border-radius:10px;font:13px/1.5 monospace;white-space:pre-wrap;">${escapeHtml(alert.detail || '')}</pre>
      <p style="margin:0;font-size:12.5px;color:#64748B;">
        Detectado ${new Date(alert.created_at).toISOString()} · alerta <code>${escapeHtml(alert.key)}</code><br>
        No se repetirá este aviso por 6 horas aunque el problema siga.
      </p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[OPS] Resend respondió ${res.status}: ${text.slice(0, 300)}`);
    return jsonResponse({ ok: false }, 200);
  }

  await db.from('system_alerts').update({ notified_at: new Date().toISOString() }).eq('id', alert.id);
  console.log(`[OPS] alerta enviada key=${alert.key}`);
  return jsonResponse({ ok: true });
});
