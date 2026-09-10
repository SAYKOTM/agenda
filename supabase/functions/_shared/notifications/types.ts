// Contrato compartido por cualquier canal de notificación (email al cliente y push al profesional;
// WhatsApp puede sumarse después implementando NotificationProvider sin tocar
// send-notification/index.ts ni la cola).
//
// 'professional_alert' es el aviso que recibe el trabajador en su teléfono cuando le tocan la
// agenda; los otros dos son los correos al cliente.
export type NotificationType = 'confirmation' | 'reminder' | 'professional_alert';

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

  // Solo los usa el canal push (aviso al profesional): qué pasó con la cita, cuál es y a dónde
  // llevar al tocar la notificación.
  event?: 'created' | 'cancelled' | 'rescheduled';
  bookingId?: string;
  panelUrl?: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export interface NotificationProvider {
  send(ctx: NotificationContext): Promise<SendResult>;
}
