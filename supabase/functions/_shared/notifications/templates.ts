// Plantillas HTML de los correos. Tablas + estilos inline a propósito (nada de <style> en el
// <head> ni flexbox/grid): es lo único que Outlook desktop renderiza de forma confiable.
import type { NotificationContext } from './types.ts';

const STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente de confirmación',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  'no-show': 'No asistió',
};

const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function formatDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('es-CL', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('es-CL', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function row(label: string, value: string): string {
  return `
    <tr><td style="padding:10px 0 0;font:12px ${FONT};color:#64748B;text-transform:uppercase;letter-spacing:.04em;">${label}</td></tr>
    <tr><td style="padding:0 0 12px;border-bottom:1px solid #F1F2F5;font:15px ${FONT};color:#0F172A;font-weight:600;">${value}</td></tr>`;
}

function buildRows(ctx: NotificationContext): string {
  const parts: string[] = [];
  parts.push(row('Servicio', escapeHtml(ctx.serviceNames.join(', ') || '—')));
  parts.push(row('Profesional', escapeHtml(ctx.professionalName || '—')));
  parts.push(row('Fecha', escapeHtml(formatDate(ctx.startAt, ctx.tenantTimezone))));
  parts.push(row('Hora', escapeHtml(formatTime(ctx.startAt, ctx.tenantTimezone))));
  if (ctx.durationMin > 0) parts.push(row('Duración', `${ctx.durationMin} min`));
  parts.push(row('Negocio', escapeHtml(ctx.tenantName)));
  if (ctx.tenantAddress) parts.push(row('Dirección', escapeHtml(ctx.tenantAddress)));
  parts.push(row('Estado', escapeHtml(STATUS_LABEL[ctx.status] || ctx.status)));
  return parts.join('');
}

function layout(opts: { preheader: string; heading: string; intro: string; rowsHtml: string; ctaUrl: string; tenantName: string; tenantLogoUrl: string | null }): string {
  const brandHtml = opts.tenantLogoUrl
    ? `<img src="${escapeHtml(opts.tenantLogoUrl)}" alt="${escapeHtml(opts.tenantName)}" height="28" style="height:28px;max-height:28px;width:auto;display:block;border:0;" />`
    : `<span style="font:700 15px ${FONT};color:#FFFFFF;">${escapeHtml(opts.tenantName)}</span>`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(opts.tenantName)}</title>
</head>
<body style="margin:0;padding:0;background:#F1F2F5;">
<span style="display:none;font-size:1px;color:#F1F2F5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F2F5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;border:1px solid #E2E5EC;">
<tr><td style="background:#0F172A;padding:20px 28px;border-radius:16px 16px 0 0;">
${brandHtml}
</td></tr>
<tr><td style="padding:28px;">
<p style="margin:0 0 6px;font:700 19px ${FONT};color:#0F172A;">${escapeHtml(opts.heading)}</p>
<p style="margin:0 0 18px;font:14px ${FONT};color:#475569;line-height:1.5;">${escapeHtml(opts.intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.rowsHtml}</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;">
<tr><td style="border-radius:10px;background:#0F172A;">
<a href="${opts.ctaUrl}" style="display:inline-block;padding:12px 22px;font:700 13.5px ${FONT};color:#FFFFFF;text-decoration:none;">Ver mi cita</a>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:16px 28px;background:#F8FAFC;border-top:1px solid #E2E5EC;border-radius:0 0 16px 16px;">
<p style="margin:0;font:11.5px ${FONT};color:#94A3B8;">Te esperamos. Este correo se generó automáticamente, no respondas a esta dirección.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderConfirmationEmail(ctx: NotificationContext): { subject: string; html: string } {
  const html = layout({
    preheader: `Tu cita en ${ctx.tenantName} quedó agendada`,
    heading: `Hola, ${ctx.clientName}`,
    intro: 'Tu cita ha sido agendada correctamente.',
    rowsHtml: buildRows(ctx),
    ctaUrl: ctx.manageUrl,
    tenantName: ctx.tenantName,
    tenantLogoUrl: ctx.tenantLogoUrl,
  });
  return { subject: `Confirmación de tu cita en ${ctx.tenantName}`, html };
}

export function renderReminderEmail(ctx: NotificationContext): { subject: string; html: string } {
  const html = layout({
    preheader: `Tu cita en ${ctx.tenantName} es en aproximadamente 2 horas`,
    heading: `Hola, ${ctx.clientName}`,
    intro: 'Te recordamos que tienes una cita en aproximadamente 2 horas.',
    rowsHtml: buildRows(ctx),
    ctaUrl: ctx.manageUrl,
    tenantName: ctx.tenantName,
    tenantLogoUrl: ctx.tenantLogoUrl,
  });
  return { subject: 'Recordatorio: tu cita es en 2 horas', html };
}
