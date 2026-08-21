import { useEffect, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { fetchAvailableSlots } from '../lib/api';
import { hhmm, dateLine, monthLabel, capitalize } from '../lib/format';

const WEEKDAYS_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

// Calendario + grilla de horas para una fecha. Reutilizado tanto en el paso "Fecha y hora" del
// flujo de reserva como en "Reagendar" desde la gestión de una reserva existente.
export default function SlotPicker({ tenantSlug, professionalId, serviceIds, timeZone, proLabel, durationLabel, date, slot, onPick, excludeBookingId }) {
  const [viewMonth, setViewMonth] = useState(() => Temporal.PlainDate.from(date).toPlainYearMonth());
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const plainDate = Temporal.PlainDate.from(date);
  const today = Temporal.Now.plainDateISO(timeZone);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    fetchAvailableSlots({ tenantSlug, serviceIds, date, professionalId, excludeBookingId })
      .then((res) => {
        if (!cancelled) setSlots(res.slots);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, date, professionalId, serviceIds.join(','), excludeBookingId]);

  async function goToNextFreeDay() {
    setSearching(true);
    setNotFound(false);
    let d = plainDate;
    for (let i = 0; i < 60; i++) {
      d = d.add({ days: 1 });
      try {
        const res = await fetchAvailableSlots({ tenantSlug, serviceIds, date: d.toString(), professionalId, excludeBookingId });
        if (res.slots.length) {
          setViewMonth(d.toPlainYearMonth());
          onPick(d.toString(), null);
          setSearching(false);
          return;
        }
      } catch {
        break;
      }
    }
    setSearching(false);
    setNotFound(true);
  }

  const daysInMonth = viewMonth.daysInMonth;
  const firstOfMonth = viewMonth.toPlainDate({ day: 1 });
  const leadingBlanks = firstOfMonth.dayOfWeek - 1; // 0=lunes
  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(viewMonth.toPlainDate({ day: d }));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[20px] border border-[var(--t-border)] bg-[var(--t-panel)] p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={() => setViewMonth(viewMonth.subtract({ months: 1 }))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--t-border)] text-sm"
            >
              ‹
            </button>
            <span className="text-sm font-bold">{monthLabel(firstOfMonth)}</span>
            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={() => setViewMonth(viewMonth.add({ months: 1 }))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--t-border)] text-sm"
            >
              ›
            </button>
          </div>
          <span className="font-mono text-[10.5px] text-[var(--t-sub)]">disponibilidad real de {proLabel}</span>
        </div>
        <div className="mb-1.5 grid grid-cols-7 gap-1">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="text-center font-mono text-[9.5px] uppercase tracking-wider text-[var(--t-sub)]">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="h-11" />;
            const iso = d.toString();
            const isPast = Temporal.PlainDate.compare(d, today) < 0;
            const isSelected = iso === date;
            return (
              <button
                key={iso}
                type="button"
                disabled={isPast}
                onClick={() => onPick(iso, null)}
                aria-pressed={isSelected}
                className={
                  'h-11 rounded-[14px] text-[13.5px] font-medium disabled:opacity-30 disabled:cursor-default ' +
                  (isSelected
                    ? 'border border-[var(--t-accent)] bg-[var(--t-accent)] font-bold text-[var(--t-accent-ink)]'
                    : 'border border-transparent text-[var(--t-ink)] hover:border-[var(--t-border)]')
                }
              >
                {d.day}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-sm font-bold">{capitalize(dateLine(plainDate))}</span>
          <span className="font-mono text-[10.5px] text-[var(--t-sub)]">
            {loading ? 'buscando cupos…' : slots.length ? `${slots.length} horas libres` : 'sin cupos'}
          </span>
        </div>

        {loading && (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-[14px] bg-[var(--t-border)]" />
            ))}
          </div>
        )}

        {!loading && slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s) => (
              <button
                key={s.startMinute}
                type="button"
                onClick={() => onPick(date, s)}
                aria-pressed={slot?.startMinute === s.startMinute}
                className={
                  'min-h-11 rounded-[14px] border font-mono text-[13px] ' +
                  (slot?.startMinute === s.startMinute
                    ? 'border-[var(--t-accent)] bg-[var(--t-accent)] text-[var(--t-accent-ink)]'
                    : 'border-[var(--t-border)] bg-transparent text-[var(--t-ink)]')
                }
              >
                {hhmm(s.startMinute)}
              </button>
            ))}
          </div>
        )}

        {!loading && slots.length === 0 && (
          <div className="rounded-[18px] border border-dashed border-[var(--t-border)] px-4 py-6 text-center">
            <div className="text-base font-bold tracking-tight">No queda cupo ese día</div>
            <p className="mt-1.5 mb-3 text-[12.5px] text-[var(--t-sub)]">
              {notFound ? 'No encontramos cupos en los próximos 60 días.' : 'Prueba otra fecha o cambia de profesional.'}
            </p>
            <button
              type="button"
              onClick={goToNextFreeDay}
              disabled={searching}
              className="min-h-11 rounded-[14px] border border-[var(--t-ink)] px-4 text-[13px] font-semibold text-[var(--t-ink)] disabled:opacity-50"
            >
              {searching ? 'Buscando…' : 'Ir al próximo día libre'}
            </button>
          </div>
        )}
      </div>

      {durationLabel && <p className="sr-only">{durationLabel}</p>}
    </div>
  );
}
