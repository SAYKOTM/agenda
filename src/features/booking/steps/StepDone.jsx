import { Temporal } from '@js-temporal/polyfill';
import { money, durLabel, capitalize, dateLine } from '../../../lib/format';
import { paymentMethodLabel } from '../../../lib/paymentLabels';
import { buildIcs, downloadIcs, googleCalendarUrl } from '../../../lib/calendarLinks';

export default function StepDone({ booking, items, proLabel, tenant, form, currency, gateway, onManage, onBackHome }) {
  const zoned = Temporal.Instant.from(booking.startAt).toZonedDateTimeISO(tenant.timezone);
  const whenLine = `${capitalize(dateLine(zoned.toPlainDate()))} · ${String(zoned.hour).padStart(2, '0')}:${String(zoned.minute).padStart(2, '0')} h`;
  const code = booking.id.slice(0, 8).toUpperCase();
  const totalDurationMin = items.reduce((a, s) => a + s.duration_min, 0);

  const serviceNames = items.map((s) => s.name).join(' + ');
  const calendarEvent = {
    uid: `${booking.id}@agenda`,
    title: `${serviceNames} · ${tenant.name}`,
    details: `Reserva ${code} con ${proLabel}.\nDuración: ${durLabel(totalDurationMin)}.`,
    location: tenant.address || tenant.name,
    startAt: booking.startAt,
    // endAt lo devuelve create-booking; si faltara, se calcula con la duración de los servicios.
    endAt: booking.endAt || Temporal.Instant.from(booking.startAt).add({ minutes: totalDurationMin }).toString(),
  };

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth flex flex-col gap-4 px-4.5 py-5 [animation:fadeUp_.3s_ease]">
      <div className="pb-1 pt-2 text-center">
        <div
          className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-full text-[22px]"
          style={{ background: 'var(--t-accent)', color: 'var(--t-accent-ink)' }}
        >
          ✓
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight">Reserva confirmada</h2>
        <p className="mt-1.5 text-[12.5px] text-[var(--t-sub)]">
          Enviamos el detalle a {form.email} y por WhatsApp al {form.phone}.
        </p>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-[var(--t-border)] bg-[var(--t-panel)]">
        <div className="flex items-center justify-between border-b border-dashed border-[var(--t-border)] px-3.5 py-3.5">
          <span className="font-mono text-[11px] tracking-wider text-[var(--t-sub)]">CÓDIGO</span>
          <span className="font-mono text-[15px] font-medium">{code}</span>
        </div>
        <div className="flex flex-col gap-2.5 px-3.5 py-3.5 text-[13px]">
          <Row label="Cuándo" value={whenLine} />
          <Row label="Con" value={proLabel} />
          <Row label="Servicios" value={items.map((s) => s.name).join(' + ')} />
          <Row label="Duración" value={durLabel(totalDurationMin)} />
          <Row label="Pago" value={paymentMethodLabel(booking.paymentMethod, gateway)} />
          {booking.loyaltyDiscountClp > 0 && (
            <Row label={`Descuento fidelidad${booking.loyaltyTierApplied ? ' · ' + booking.loyaltyTierApplied : ''}`} value={`-${money(booking.loyaltyDiscountClp, currency)}`} />
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-[var(--t-sub)]">Total</span>
            <span className="font-mono text-lg font-medium">{money(booking.totalPriceClp, currency)}</span>
          </div>
        </div>
        <div className="px-3.5 pb-3.5 text-xs text-[var(--t-sub)]">{tenant.address}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <a
          href={googleCalendarUrl(calendarEvent)}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-12 items-center justify-center rounded-[15px] border border-[var(--t-ink)] text-[13px] font-semibold text-[var(--t-ink)]"
        >
          Google Calendar
        </a>
        <button
          type="button"
          onClick={() => downloadIcs(buildIcs(calendarEvent), `reserva-${code}.ics`)}
          className="flex min-h-12 items-center justify-center rounded-[15px] border border-[var(--t-ink)] text-[13px] font-semibold text-[var(--t-ink)]"
        >
          Apple Calendar
        </button>
      </div>
      <button
        type="button"
        onClick={onManage}
        className="min-h-12 rounded-[15px] text-sm font-bold"
        style={{ background: 'var(--t-accent)', color: 'var(--t-accent-ink)' }}
      >
        Ver o modificar mi reserva
      </button>
      <button type="button" onClick={onBackHome} className="min-h-10 text-center text-[12.5px] text-[var(--t-sub)] underline">
        Volver al inicio del salón
      </button>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--t-sub)]">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
