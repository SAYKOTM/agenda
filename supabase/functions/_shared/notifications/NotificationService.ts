// Punto único de envío: recibe un canal + contexto y delega en el provider registrado para ese
// canal. Agregar WhatsApp más adelante es implementar WhatsAppProvider (NotificationProvider) y
// registrarlo acá con providers.whatsapp -- nada en send-notification/index.ts ni en la cola de
// Postgres necesita cambiar.
import type { NotificationContext, NotificationProvider, SendResult } from './types.ts';

export type NotificationChannel = 'email' | 'whatsapp';

export class NotificationService {
  constructor(private providers: Partial<Record<NotificationChannel, NotificationProvider>>) {}

  async send(channel: NotificationChannel, ctx: NotificationContext): Promise<SendResult> {
    const provider = this.providers[channel];
    if (!provider) return { ok: false, error: `no hay un NotificationProvider configurado para "${channel}"` };
    return provider.send(ctx);
  }
}
