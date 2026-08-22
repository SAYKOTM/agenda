import { useEffect, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { fetchAvailableSlots, fetchScheduleDays } from '../lib/api';
import { hhmm, dateLine, monthLabel, capitalize } from '../lib/format';
import { isWorkingDay } from '../lib/schedule';

const WEEKDAYS_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

// Calendario + grilla de horas para una fecha. Reutilizado tanto en el paso "Fecha y hora" del
// flujo de reserva como en "Reagendar" desde la gestión de una reserva existente.
export default function SlotPicker({ tenantSlug, professionalId, serviceIds, timeZone, proLabel, durationLabel, date, slot, onPick, excludeBookingId }) {
  const [viewMonth, setViewMonth] = useState(() => Temporal.PlainDate.from(date).toPlainYearMonth());
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [nonWorkingDates, setNonWorkingDates] = useState(() => new Set());

  const plainDate = Temporal.PlainDate.from(date);
  const today = Temporal.Now.plainDateISO(timeZone);

  // Días sin ningún profesional capaz trabajando: se deshabilitan en el calendario para que el
  // cliente no los vea como espacios libres/seleccionables (más allá de que, al elegirlos, la
  // grilla de horas ya mostraría "sin cupos").
  useEffect(() => {
    let cancelled = false;
    const monthStr = `${viewMonth.year}-${String(viewMonth.month).padStart(2, '0')}`;
    fetchScheduleDays({ tenantSlug, professionalId, serviceIds, month: monthStr })
      .then((res) => {
        if (cancelled) return;
        const byPro = new Map();
        for (const b of res.blocks || []) {
          if (!byPro.has(b.professional_id)) byPro.set(b.professional_id, { blocks: [], exceptions: [] });
          byPro.get(b.professional_id).blocks.push(b);
        }
        for (const e of res.exceptions || []) {
          if (!byPro.has(e.professional_id)) byPro.set(e.professional_id, { blocks: [], exceptions: [] });
          byPro.get(e.professional_id).exceptions.push(e);
        }
        const proIds = res.professionalIds?.length ? res.professionalIds : Array.from(byPro.keys());
        const nonWorking = new Set();
        for (let d = 1; d <= viewMonth.daysInMonth; d++) {
          const cellDate = viewMonth.toPlainDate({ day: d });
          const anyWorking = proIds.some((pid) => {
            const data = byPro.get(pid) || { blocks: [], exceptions: [] };
            return isWorkingDay(data.blocks, data.exceptions, cellDate);
          });
          if (!anyWorking) nonWorking.add(cellDate.toString());
        }
        setNonWorkingDates(nonWorking);
      })
      .catch(() => {
        if (!cancelled) setNonWorkingDates(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, viewMonth.toString(), professionalId, serviceIds.join(',')]);

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
            const isClosed = !isPast && nonWorkingDates.has(iso);
            const isSelected = iso === date;
            return (
              <button
                key={iso}
                type="button"
                disabled={isPast || isClosed}
                onClick={() => onPick(iso, null)}
                aria-pressed={isSelected}
                title={isClosed ? 'Día no laboral' : undefined}
                className={
                  'h-11 rounded-[14px] text-[13.5px] font-medium disabled:cursor-default ' +
                  (isPast ? 'disabled:opacity-30 ' : '') +
                  (isClosed ? 'text-[var(--t-sub)] opacity-40 line-through decoration-[var(--t-border)] ' : '') +
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
