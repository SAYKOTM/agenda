// POST /send-notification { notification_id }
//
// Dos canales conviven acá: 'email'/'reminder' son los correos al CLIENTE (Resend) y 'push' es el
// aviso Web Push al PROFESIONAL cuando le tocan la agenda. Comparten cola, cron y reintentos.
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
import { WebPushProvider } from '../_shared/notifications/PushProvider.ts';
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
    .select('id, channel, booking_id, status, payload')
    .eq('id', notificationId)
    .maybeSingle();
  if (nqErr) return errorResponse(nqErr.message, 500);
  // Puede no existir más si el booking se borró, o ya estar 'sent' si dos ticks de cron se
  // solaparon justo en el borde de la ventana -- en ambos casos no hay nada que hacer.
  if (!nq || !nq.booking_id || nq.status === 'sent') return jsonResponse({ skipped: true });

  const { data: booking, error: bErr } = await db
    .from('bookings')
    .select(
      'id, professional_id, client_name, client_email, start_at, status, public_token, professionals(name), tenants(name, logo_url, address, timezone, slug)'
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
  const isPush = nq.channel === 'push';
  const label = isPush ? 'Push' : nq.channel === 'reminder' ? 'Reminder' : 'Confirmation';
  const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
  const event = (nq.payload as any)?.event as 'created' | 'cancelled' | 'rescheduled' | undefined;

  const ctx: NotificationContext = {
    type: isPush ? 'professional_alert' : nq.channel === 'reminder' ? 'reminder' : 'confirmation',
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
    manageUrl: `${appUrl}/${tenant?.slug || ''}/reserva/${booking.public_token}`,
    event,
    bookingId: booking.id,
    // Al tocar el aviso, el service worker abre directamente el día de la cita en la agenda.
    panelUrl: `/panel/agenda?date=${new Intl.DateTimeFormat('en-CA', { timeZone: tenant?.timezone || 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(booking.start_at))}`,
  };

  // ---------- canal push: aviso al profesional ----------
  if (isPush) {
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) {
      await markFailed(db, notificationId, 'falta configurar VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
      console.error('[PUSH] failed: faltan las claves VAPID');
      return jsonResponse({ ok: false });
    }

    // El destinatario puede no ser el profesional actual de la reserva: cuando una cita se
    // reasigna, al que la perdió se le manda un aviso de cancelación y su id viaja en el payload
    // (ver la migración 0046).
    const targetProfessionalId = (nq.payload as any)?.professional_id || booking.professional_id;

    const { data: subs } = await db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('professional_id', targetProfessionalId)
      .eq('enabled', true);

    const provider = new WebPushProvider(
      { publicKey, privateKey, subject: Deno.env.get('VAPID_SUBJECT') || appUrl },
      (subs || []) as any
    );
    const pushResult = await new NotificationService({ push: provider }).send('push', ctx);

    // Endpoints que ya no existen (app desinstalada, datos del sitio borrados): se borran acá y
    // no se reintentan nunca más.
    if (provider.gone.length > 0) {
      await db.from('push_subscriptions').delete().in('endpoint', provider.gone);
    }

    if (pushResult.ok) {
      await db.from('notification_queue').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', notificationId);
      console.log(`[PUSH] ${event || 'created'} sent booking=${booking.id}`);
      return jsonResponse({ ok: true });
    }

    // Sin dispositivos suscritos no hay nada que reintentar: se marca enviada para que el cron no
    // la tome cinco veces más. Cualquier otro fallo sí queda como 'failed' para reintentar.
    if (!subs || subs.length === 0) {
      await db.from('notification_queue').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: 'sin dispositivos suscritos' }).eq('id', notificationId);
      return jsonResponse({ ok: true, skipped: true });
    }
    await markFailed(db, notificationId, pushResult.error || 'error desconocido al enviar el aviso');
    console.error(`[PUSH] failed booking=${booking.id}: ${pushResult.error}`);
    return jsonResponse({ ok: false });
  }

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
