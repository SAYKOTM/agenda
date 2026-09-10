// Canal 'push': el aviso que le llega al profesional al teléfono cuando le agendan, le cancelan o
// le reagendan una hora. Es el equivalente del ResendEmailProvider pero para Web Push (VAPID),
// no para correo -- la criptografía está en webpush.ts.
//
// Una diferencia con el email: un profesional puede tener varios dispositivos suscritos (el
// celular y el computador del mesón). El provider manda a todos y considera el envío exitoso si
// al menos uno aceptó; las suscripciones muertas (404/410) las reporta para que quien llama las
// borre, que es lo único que evita que la tabla se llene de endpoints fantasma.
import type { NotificationContext, NotificationProvider, SendResult } from './types.ts';
import { sendWebPush, type StoredSubscription, type VapidKeys } from './webpush.ts';

function formatWhen(iso: string, tz: string): string {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat('es-CL', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);

  // "hoy 15:30" es mucho más útil de un vistazo en la pantalla bloqueada que "lunes 3 de marzo".
  const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const target = dayKey(date);

  if (target === today) return `hoy ${time}`;
  if (target === tomorrow) return `mañana ${time}`;
  const day = new Intl.DateTimeFormat('es-CL', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  return `${day} ${time}`;
}

export function renderProfessionalPush(ctx: NotificationContext): { title: string; body: string } {
  const when = formatWhen(ctx.startAt, ctx.tenantTimezone);
  const services = ctx.serviceNames.join(' + ') || 'Cita';
  switch (ctx.event) {
    case 'cancelled':
      return { title: `Cita cancelada — ${when}`, body: `${ctx.clientName} · ${services}` };
    case 'rescheduled':
      return { title: `Cita reagendada — ${when}`, body: `${ctx.clientName} · ${services}` };
    default:
      return { title: `Nueva cita — ${when}`, body: `${ctx.clientName} · ${services}` };
  }
}

export class WebPushProvider implements NotificationProvider {
  // Endpoints que el servicio de push rechazó por inexistentes: quien construye el provider los
  // lee después de send() para borrarlos de push_subscriptions.
  readonly gone: string[] = [];

  constructor(
    private vapid: VapidKeys,
    private subscriptions: StoredSubscription[]
  ) {}

  async send(ctx: NotificationContext): Promise<SendResult> {
    if (this.subscriptions.length === 0) {
      return { ok: false, error: 'el profesional no tiene ningún dispositivo con avisos activos' };
    }

    const { title, body } = renderProfessionalPush(ctx);
    const payload = {
      title,
      body,
      bookingId: ctx.bookingId,
      startAt: ctx.startAt,
      url: ctx.panelUrl,
    };

    const results = await Promise.all(this.subscriptions.map((s) => sendWebPush(s, payload, this.vapid)));

    const errors: string[] = [];
    results.forEach((result, i) => {
      if (result.ok) return;
      if (result.gone) this.gone.push(this.subscriptions[i].endpoint);
      errors.push(result.error);
    });

    // Con un dispositivo que recibió alcanza: que el computador del mesón esté apagado no debería
    // dejar la fila en 'failed' para que el cron la reintente cinco veces.
    if (results.some((r) => r.ok)) return { ok: true };
    return { ok: false, error: errors.join(' | ') || 'no se pudo entregar a ningún dispositivo' };
  }
}
