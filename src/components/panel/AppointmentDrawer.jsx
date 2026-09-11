import { useEffect, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { supabase } from '../../lib/supabaseClient';
import { rescheduleBooking, ApiError } from '../../lib/api';
import { money, durLabel, hhmm, dateLine, capitalize } from '../../lib/format';
import { paymentMethodLabel } from '../../lib/paymentLabels';
import { useToast } from '../Toast';
import SlotPicker from '../SlotPicker';
import ModalPortal from './ModalPortal';

const STATUS_LABEL = { pendiente: 'Pendiente', confirmada: 'Confirmada', completada: 'Completada', cancelada: 'Cancelada', 'no-show': 'No-show' };
const STATUS_CLASS = {
  pendiente: 'bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-ink)]',
  confirmada: 'bg-[var(--color-status-confirmed-bg)] text-[var(--color-status-confirmed-ink)]',
  completada: 'bg-[var(--color-status-done-bg)] text-[var(--color-status-done-ink)]',
  cancelada: 'bg-[var(--color-status-cancelled-bg)] text-[var(--color-status-cancelled-ink)]',
  'no-show': 'bg-[var(--color-status-noshow-bg)] text-[var(--color-status-noshow-ink)]',
};

// Panel lateral de detalle de cita (392px en desktop, pantalla completa en móvil vía la propia
// posición fixed + inset-0). Reusa SlotPicker y la Edge Function reschedule-booking -- el mismo
// mecanismo que usa el cliente en /reserva/:token -- para "Reagendar" desde el panel.
export default function AppointmentDrawer({ booking, tenant, onClose, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [note, setNote] = useState(booking.internal_note || '');
  const [newDate, setNewDate] = useState(() => Temporal.Instant.from(booking.start_at).toZonedDateTimeISO(tenant.timezone).toPlainDate().toString());
  const [newSlot, setNewSlot] = useState(null);
  const [notifications, setNotifications] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('notification_queue')
      .select('channel, status, attempts, sent_at, last_error')
      .eq('booking_id', booking.id)
      .then(({ data }) => { if (!cancelled) setNotifications(data || []); });
    return () => { cancelled = true; };
  }, [booking.id]);

  const zoned = Temporal.Instant.from(booking.start_at).toZonedDateTimeISO(tenant.timezone);
  const zonedEnd = Temporal.Instant.from(booking.end_at).toZonedDateTimeISO(tenant.timezone);
  const durationMin = Math.round((new Date(booking.end_at) - new Date(booking.start_at)) / 60000);
  const serviceIds = (booking.booking_items || []).map((i) => i.service_id).filter(Boolean);
  const isActive = booking.status === 'pendiente' || booking.status === 'confirmada';
  const canComplete = booking.status === 'confirmada';
  const canConfirm = booking.status === 'pendiente';
  const canNoShow = booking.status === 'confirmada' && Temporal.Instant.compare(Temporal.Instant.from(booking.start_at), Temporal.Now.instant()) < 0;

  async function setStatus(status) {
    setBusy(true);
    const { error } = await supabase.from('bookings').update({ status, cancelled_at: status === 'cancelada' ? new Date().toISOString() : null }).eq('id', booking.id);
    setBusy(false);
    if (error) {
      toast('No pudimos actualizar la cita');
      return;
    }
    const messages = { confirmada: 'Cita confirmada · se avisó al cliente', completada: 'Cita marcada como completada', cancelada: 'Cita cancelada · hora liberada', 'no-show': 'Cita marcada como no-show' };
    toast(messages[status] || 'Cita actualizada');
    onChanged();
    onClose();
  }

  async function saveNote() {
    setBusy(true);
    const { error } = await supabase.from('bookings').update({ internal_note: note }).eq('id', booking.id);
    setBusy(false);
    if (error) toast('No pudimos guardar la nota');
    else {
      toast('Nota interna guardada');
      onChanged();
    }
  }

  async function confirmReschedule() {
    if (!newSlot) return;
    setBusy(true);
    try {
      await rescheduleBooking(booking.public_token, newDate, newSlot.startMinute);
      toast('Cita reagendada');
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'No pudimos reagendar la cita');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal onClose={onClose} align="end">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-full w-full flex-col gap-3.5 overflow-y-auto bg-white p-4 [animation:fadeUp_.2s_ease] min-[520px]:w-[392px]"
        style={{ overscrollBehavior: 'contain', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#F1F2F5] text-[13px] font-bold">
              {booking.client_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </div>
            <div>
              <div className="text-[15px] font-bold text-[#0F172A]">{booking.client_name}</div>
              <span className={'mt-0.5 inline-block rounded-[8px] px-2 py-0.5 text-[11px] font-bold ' + STATUS_CLASS[booking.status]}>{STATUS_LABEL[booking.status]}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-[#E2E5EC] text-sm">✕</button>
        </div>

        {!rescheduling && (
          <>
            <div className="flex flex-col gap-2 rounded-[16px] border border-[#E2E5EC] p-3.5 text-[13px]">
              <Row label="Servicio" value={(booking.booking_items || []).map((i) => i.name_snapshot).join(' + ')} />
              <Row label="Cuándo" value={`${capitalize(dateLine(zoned.toPlainDate()))} · ${hhmm(zoned.hour * 60 + zoned.minute)} – ${hhmm(zonedEnd.hour * 60 + zonedEnd.minute)}`} />
              <Row label="Duración" value={durLabel(durationMin)} />
              <Row label="Profesional" value={booking.professionals?.name} />
              <Row label="Pago" value={paymentMethodLabel(booking.payment_method)} />
              <Row label="Teléfono" value={booking.client_phone} />
              <Row label="Email" value={booking.client_email} />
              {booking.notes && <Row label="Nota del cliente" value={booking.notes} />}
              <div className="mt-1 flex items-baseline justify-between border-t border-[#F1F2F5] pt-2">
                <span className="text-[#64748B]">Total</span>
                <span className="font-mono text-lg font-medium">{money(booking.total_price_clp, tenant.currency)}</span>
              </div>
            </div>

            {notifications?.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-[16px] border border-[#E2E5EC] p-3.5 text-[13px]">
                <span className="text-[11.5px] font-bold text-[#475569]">Notificaciones por correo</span>
                {notifications.map((n) => <NotificationRow key={n.channel} n={n} />)}
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-bold text-[#475569]">Nota interna</span>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full resize-y rounded-[11px] border border-[#D3D7E0] px-3 py-2.5 text-[13px] text-[#0F172A]"
              />
              <button type="button" onClick={saveNote} disabled={busy} className="self-start rounded-[9px] border border-[#E2E5EC] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50">Guardar nota</button>
            </label>

            <div className="mt-auto flex flex-col gap-2 border-t border-[#E2E5EC] pt-3.5">
              {canConfirm && <ActionButton onClick={() => setStatus('confirmada')} disabled={busy}>Confirmar</ActionButton>}
              {canComplete && <ActionButton onClick={() => setStatus('completada')} disabled={busy}>Marcar completada</ActionButton>}
              {canNoShow && <ActionButton onClick={() => setStatus('no-show')} disabled={busy} variant="warn">Marcar no-show</ActionButton>}
              {isActive && <ActionButton onClick={() => setRescheduling(true)} disabled={busy} variant="ghost">Reagendar</ActionButton>}
              {isActive && <ActionButton onClick={() => setStatus('cancelada')} disabled={busy} variant="danger">Cancelar cita</ActionButton>}
            </div>
          </>
        )}

        {rescheduling && (
          <div className="flex flex-col gap-4">
            <SlotPicker
              tenantSlug={tenant.slug}
              professionalId={booking.professional_id}
              serviceIds={serviceIds}
              timeZone={tenant.timezone}
              proLabel={booking.professionals?.name}
              date={newDate}
              slot={newSlot}
              onPick={(d, s) => { setNewDate(d); setNewSlot(s); }}
              excludeBookingId={booking.id}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setRescheduling(false); setNewSlot(null); }} className="min-h-11 flex-1 rounded-[13px] border border-[#E2E5EC] text-[13px] font-semibold">Volver</button>
              <button type="button" onClick={confirmReschedule} disabled={!newSlot || busy} className="min-h-11 flex-1 rounded-[13px] bg-[#0F172A] text-[13px] font-bold text-white disabled:opacity-40">Confirmar nuevo horario</button>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}

const NOTIF_LABEL = { email: 'Confirmación', reminder: 'Recordatorio 2h', whatsapp: 'WhatsApp', ics: 'Calendario' };

function NotificationRow({ n }) {
  const label = NOTIF_LABEL[n.channel] || n.channel;
  if (n.status === 'sent') {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-[#64748B]">{label}</span>
        <span className="font-semibold text-emerald-700">✓ Enviado {n.sent_at ? new Date(n.sent_at).toLocaleString('es-CL') : ''}</span>
      </div>
    );
  }
  if (n.status === 'failed') {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[#64748B]">{label}</span>
          <span className="font-semibold text-[#C0402B]">✗ Error (intento {n.attempts})</span>
        </div>
        {n.last_error && <span className="text-[11.5px] text-[#94A3B8]">{n.last_error}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#64748B]">{label}</span>
      <span className="font-semibold text-[#94A3B8]">⏳ Pendiente</span>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="flex-none text-[#64748B]">{label}</span>
      <span className="text-right font-semibold text-[#0F172A]">{value}</span>
    </div>
  );
}

function ActionButton({ children, onClick, disabled, variant }) {
  const cls =
    variant === 'danger' ? 'border border-[#E4C9C4] text-[#C0402B]' :
    variant === 'warn' ? 'border border-[#EAD2A6] text-[#96540E]' :
    variant === 'ghost' ? 'border border-[#E2E5EC] text-[#0F172A]' :
    'bg-[#0F172A] text-white';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={'min-h-11 rounded-[13px] text-[13.5px] font-bold disabled:opacity-50 ' + cls}>
      {children}
    </button>
  );
}
