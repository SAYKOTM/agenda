// Implementación de NotificationProvider para email vía Resend (free tier: 3000 emails/mes,
// 100/día, sin tarjeta -- ver README de la migración 0027 para el resto de las opciones evaluadas).
import type { NotificationContext, NotificationProvider, SendResult } from './types.ts';
import { renderConfirmationEmail, renderReminderEmail } from './templates.ts';

export class ResendEmailProvider implements NotificationProvider {
  constructor(private apiKey: string, private fromEmail: string) {}

  async send(ctx: NotificationContext): Promise<SendResult> {
    const { subject, html } = ctx.type === 'reminder' ? renderReminderEmail(ctx) : renderConfirmationEmail(ctx);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.fromEmail, to: ctx.clientEmail, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Resend respondió ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  }
}
