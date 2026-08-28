// POST /send-notification { notification_id }
// Header: X-Webhook-Secret: <secreto compartido, guardado en Vault y en el env de esta función>
//
// La llama exclusivamente process_notification_queue() (Postgres, vía pg_net/pg_cron -- ver
// migración 0027). No lleva JWT de usuario porque quien llama es la base de datos, no un
// navegador: la autenticación es el secreto compartido, mismo patrón que ya usaba el webhook de
// WhatsApp (X-Webhook-Secret) y que stripe-webhook usa con la firma de Stripe.
//
// Hace todo el trabajo de un solo saque: busca la reserva (con sus servicios, profesional y
// tenant ya frescos -- no confía en snapshots viejos guardados en el payload del trigger), arma
// el contexto y lo manda a NotificationService. Si falla, deja la fila en notification_queue en
// status='failed' con el error para que el siguiente tick del cron reintente (hasta el tope de
// intentos que impone el propio filtro SQL de process_notification_queue).
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { ResendEmailProvider } from '../_shared/notifications/EmailProvider.ts';
import { NotificationService } from '../_shared/notifications/NotificationService.ts';
import type { NotificationContext } from '../_shared/notifications/types.ts';

async function markFailed(db: ReturnType<typeof supabaseAdmin>, id: string, error: string) {
  await db.from('notification_queue').update({ status: 'failed', last_error: error }).eq('id', id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const expected = Deno.env.get('NOTIFICATION_DISPATCH_SECRET') || '';
  const got = req.headers.get('X-Webhook-Secret') || '';
  if (!expected || got !== expected) return errorResponse('no autorizado', 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse('body inválido', 400);
  }
  const notificationId = body?.notification_id;
  if (!notificationId) return errorResponse('falta notification_id', 400);

  const db = supabaseAdmin();

  const { data: nq, error: nqErr } = await db
    .from('notification_queue')
    .select('id, channel, booking_id, status')
    .eq('id', notificationId)
    .maybeSingle();
  if (nqErr) return errorResponse(nqErr.message, 500);
  // Puede no existir más si el booking se borró, o ya estar 'sent' si dos ticks de cron se
  // solaparon justo en el borde de la ventana -- en ambos casos no hay nada que hacer.
  if (!nq || !nq.booking_id || nq.status === 'sent') return jsonResponse({ skipped: true });

  const { data: booking, error: bErr } = await db
    .from('bookings')
    .select(
      'id, client_name, client_email, start_at, status, public_token, professionals(name), tenants(name, logo_url, address, timezone, slug)'
    )
    .eq('id', nq.booking_id)
    .maybeSingle();
  if (bErr || !booking) {
    await markFailed(db, notificationId, 'la reserva ya no existe');
    console.error(`[EMAIL] ${nq.channel === 'reminder' ? 'Reminder' : 'Confirmation'} failed: booking not found`);
    return jsonResponse({ ok: false });
  }

  // Defensa extra: si por alguna carrera la fila de recordatorio sobrevivió a una cancelación
  // (el trigger bookings_reset_reminder de 0027 ya debería haberla borrado en el camino normal),
  // no tiene sentido mandarla igual.
  if (nq.channel === 'reminder' && booking.status !== 'pendiente' && booking.status !== 'confirmada') {
    await db.from('notification_queue').delete().eq('id', notificationId);
    return jsonResponse({ skipped: true, reason: 'booking no longer active' });
  }

  const { data: items } = await db
    .from('booking_items')
    .select('name_snapshot, duration_snapshot')
    .eq('booking_id', booking.id)
    .order('sort_order');

  const tenant = booking.tenants as any;
  const professional = booking.professionals as any;
  const label = nq.channel === 'reminder' ? 'Reminder' : 'Confirmation';

  const ctx: NotificationContext = {
    type: nq.channel === 'reminder' ? 'reminder' : 'confirmation',
    clientName: booking.client_name,
    clientEmail: booking.client_email,
    tenantName: tenant?.name || '',
    tenantLogoUrl: tenant?.logo_url || null,
    tenantAddress: tenant?.address || null,
    tenantTimezone: tenant?.timezone || 'America/Santiago',
    tenantSlug: tenant?.slug || '',
    professionalName: professional?.name || '',
    serviceNames: (items || []).map((i: any) => i.name_snapshot),
    durationMin: (items || []).reduce((sum: number, i: any) => sum + (i.duration_snapshot || 0), 0),
    startAt: booking.start_at,
    status: booking.status,
    manageUrl: `${Deno.env.get('APP_URL') || 'http://localhost:5173'}/${tenant?.slug || ''}/reserva/${booking.public_token}`,
  };

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !fromEmail) {
    await markFailed(db, notificationId, 'falta configurar RESEND_API_KEY / RESEND_FROM_EMAIL');
    console.error(`[EMAIL] ${label} failed: falta configuración de Resend`);
    return jsonResponse({ ok: false });
  }

  const service = new NotificationService({ email: new ResendEmailProvider(apiKey, fromEmail) });
  const result = await service.send('email', ctx);

  if (result.ok) {
    await db
      .from('notification_queue')
      .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
      .eq('id', notificationId);
    console.log(`[EMAIL] ${label} sent booking=${booking.id}`);
    return jsonResponse({ ok: true });
  }

  await markFailed(db, notificationId, result.error || 'error desconocido al enviar el correo');
  console.error(`[EMAIL] ${label} failed booking=${booking.id}: ${result.error}`);
  return jsonResponse({ ok: false });
});
