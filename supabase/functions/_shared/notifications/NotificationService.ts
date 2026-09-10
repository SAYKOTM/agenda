// Punto único de envío: recibe un canal + contexto y delega en el provider registrado para ese
// canal. Sumar un canal es implementar NotificationProvider y registrarlo acá -- así se agregó
// 'push' (WebPushProvider, avisos al profesional) sin tocar la cola de Postgres, y así entraría
// WhatsApp con providers.whatsapp.
import type { NotificationContext, NotificationProvider, SendResult } from './types.ts';

export type NotificationChannel = 'email' | 'whatsapp' | 'push';

export class NotificationService {
  constructor(private providers: Partial<Record<NotificationChannel, NotificationProvider>>) {}

  async send(channel: NotificationChannel, ctx: NotificationContext): Promise<SendResult> {
    const provider = this.providers[channel];
    if (!provider) return { ok: false, error: `no hay un NotificationProvider configurado para "${channel}"` };
    return provider.send(ctx);
  }
}
