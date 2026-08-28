// Contrato compartido por cualquier canal de notificación (hoy solo email; WhatsApp puede sumarse
// después implementando NotificationProvider sin tocar send-notification/index.ts ni la cola).
export type NotificationType = 'confirmation' | 'reminder';

export interface NotificationContext {
  type: NotificationType;
  clientName: string;
  clientEmail: string;
  tenantName: string;
  tenantLogoUrl: string | null;
  tenantAddress: string | null;
  tenantTimezone: string;
  tenantSlug: string;
  professionalName: string;
  serviceNames: string[];
  durationMin: number;
  startAt: string; // ISO, UTC
  status: string; // booking_status crudo (pendiente | confirmada | completada | cancelada | no-show)
  manageUrl: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export interface NotificationProvider {
  send(ctx: NotificationContext): Promise<SendResult>;
}
