import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import { fetchBookingByToken, cancelBooking, rescheduleBooking, ApiError } from '../lib/api';
import { money, dateLine, capitalize } from '../lib/format';
import { useToast } from '../components/Toast';
import ClientShell from '../components/ClientShell';
import SlotPicker from '../components/SlotPicker';

const STATUS_META = {
  pendiente: { label: 'Pendiente', bg: 'var(--color-status-pending-bg)', ink: 'var(--color-status-pending-ink)' },
  confirmada: { label: 'Confirmada', bg: 'var(--color-status-confirmed-bg)', ink: 'var(--color-status-confirmed-ink)' },
  completada: { label: 'Completada', bg: 'var(--color-status-done-bg)', ink: 'var(--color-status-done-ink)' },
  cancelada: { label: 'Cancelada', bg: 'var(--color-status-cancelled-bg)', ink: 'var(--color-status-cancelled-ink)' },
  'no-show': { label: 'No-show', bg: 'var(--color-status-noshow-bg)', ink: 'var(--color-status-noshow-ink)' },
};

export default function ManageBooking() {
  const { slug, token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [state, setState] = useState({ loading: true, error: null, booking: null });
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState(null);
  const [newSlot, setNewSlot] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, booking: null });
    fetchBookingByToken(token)
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, error: null, booking: res.booking });
        setNewDate(Temporal.Now.plainDateISO(res.booking.tenants.timezone).toString());
      })
      .catch((e) => {
        if (!cancelled) setState({ loading: false, error: e.message || 'No pudimos cargar la reserva', booking: null });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.loading) return <LoadingShell />;
  if (state.error || !state.booking) return <ErrorShell />;

  const b = state.booking;
  const tenant = b.tenants;
  const zoned = Temporal.Instant.from(b.start_at).toZonedDateTimeISO(tenant.timezone);
  const whenLine = `${capitalize(dateLine(zoned.toPlainDate()))} · ${String(zoned.hour).padStart(2, '0')}:${String(zoned.minute).padStart(2, '0')} h`;
  const code = b.id.slice(0, 8).toUpperCase();
  const isActive = b.status === 'pendiente' || b.status === 'confirmada';
  const meta = STATUS_META[b.status] || STATUS_META.pendiente;
  const serviceIds = (b.booking_items || []).map((i) => i.service_id).filter(Boolean);

  async function onCancel() {
    if (!confirm('¿Seguro que quieres cancelar esta reserva?')) return;
    setBusy(true);
    try {
      const res = await cancelBooking(token);
      setState((s) => ({ ...s, booking: { ...s.booking, status: res.booking.status } }));
      toast('Reserva cancelada · avisamos al salón');
    } catch (e) {
      toast(e.message || 'No pudimos cancelar la reserva');
    } finally {
      setBusy(false);
    }
  }

  async function confirmReschedule() {
    if (!newSlot) return;
    setBusy(true);
    try {
      const res = await rescheduleBooking(token, newDate, newSlot.startMinute);
      setState((s) => ({ ...s, booking: { ...s.booking, start_at: res.booking.start_at, end_at: res.booking.end_at } }));
      setRescheduling(false);
      setNewSlot(null);
      toast('Reserva reagendada');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) toast(e.message);
      else toast(e.message || 'No pudimos reagendar la reserva');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ClientShell theme={tenant.theme}>
      <div className="flex-shrink-0 flex items-center gap-3 border-b border-[var(--t-border)] px-4.5 py-4">
        <div className="flex h-9.5 w-9.5 flex-none items-center justify-center rounded-[14px] bg-[var(--t-accent)] text-base font-extrabold text-[var(--t-accent-ink)]">
          {tenant.name?.[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold leading-tight tracking-tight">{tenant.name}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth flex flex-col gap-4 px-4.5 py-5 [animation:fadeUp_.3s_ease]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">Link único de tu reserva</div>
          <h2 className="mt-1.5 text-[23px] font-extrabold tracking-tight">Estado de la reserva</h2>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: meta.bg, color: meta.ink }}>
          {meta.label}
        </div>

        <div className="flex flex-col gap-2.5 rounded-[20px] border border-[var(--t-border)] bg-[var(--t-panel)] p-3.5 text-[13px]">
          <Row label="Código" value={<span className="font-mono">{code}</span>} />
          <Row label="Cuándo" value={whenLine} />
          <Row label="Con" value={b.professionals?.name} />
          <div className="flex items-baseline justify-between">
            <span className="text-[var(--t-sub)]">Total</span>
            <span className="font-mono text-lg font-medium">{money(b.total_price_clp, tenant.currency)}</span>
          </div>
        </div>

        {isActive && !rescheduling && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setRescheduling(true)}
              disabled={busy}
              className="min-h-12.5 rounded-[15px] border border-[var(--t-ink)] text-sm font-semibold text-[var(--t-ink)] disabled:opacity-50"
            >
              Reagendar
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="min-h-12.5 rounded-[15px] border border-[#E4C9C4] text-sm font-semibold text-[#C0402B] disabled:opacity-50"
            >
              Cancelar reserva
            </button>
          </div>
        )}

        {isActive && rescheduling && (
          <div className="flex flex-col gap-4">
            <SlotPicker
              tenantSlug={slug}
              professionalId={b.professional_id}
              serviceIds={serviceIds}
              timeZone={tenant.timezone}
              proLabel={b.professionals?.name}
              date={newDate}
              slot={newSlot}
              onPick={(d, s) => {
                setNewDate(d);
                setNewSlot(s);
              }}
              excludeBookingId={b.id}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setRescheduling(false);
                  setNewSlot(null);
                }}
                className="min-h-12.5 flex-1 rounded-[15px] border border-[var(--t-border)] text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmReschedule}
                disabled={!newSlot || busy}
                className="min-h-12.5 flex-1 rounded-[15px] text-sm font-bold disabled:cursor-not-allowed"
                style={{ background: newSlot && !busy ? 'var(--t-accent)' : 'var(--t-border)', color: newSlot && !busy ? 'var(--t-accent-ink)' : 'var(--t-sub)' }}
              >
                Confirmar nuevo horario
              </button>
            </div>
          </div>
        )}

        {b.status === 'cancelada' && (
          <div className="rounded-[18px] border border-dashed border-[var(--t-border)] p-5.5 text-center">
            <p className="mb-3 text-[13px] text-[var(--t-sub)]">Tu hora fue liberada. Si quieres, puedes volver a reservar.</p>
            <button
              type="button"
              onClick={() => navigate(`/${slug}/reservar`)}
              className="min-h-11.5 rounded-[14px] px-4.5 text-[13.5px] font-bold"
              style={{ background: 'var(--t-accent)', color: 'var(--t-accent-ink)' }}
            >
              Reservar de nuevo
            </button>
          </div>
        )}
      </div>
    </ClientShell>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--t-sub)]">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] text-sm text-slate-500" role="status" aria-live="polite">
      Cargando…
    </div>
  );
}

function ErrorShell() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#F1F2F5] px-6 text-center text-sm text-slate-500">
      <p>No encontramos esa reserva. Revisa el link que te enviamos.</p>
    </div>
  );
}
