import { useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import { usePanelAppointments } from '../../features/panel/usePanelAppointments';
import { usePanelTeam } from '../../features/panel/usePanelTeam';
import { usePanelTeamAvailability } from '../../features/panel/usePanelAvailability';
import AppointmentDrawer from '../../components/panel/AppointmentDrawer';
import LoyaltyBadge from '../../components/panel/LoyaltyBadge';
import { money, hhmm, hhmmRange12, capitalize, dateLine } from '../../lib/format';
import { isWorkingDay, closedRangesWithin } from '../../lib/schedule';

const G0 = 540; // 09:00
const G1 = 1260; // 21:00
const HH = 76; // alto de cada fila de hora, en px
const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const STATUS_META = {
  pendiente: { label: 'Pendiente', bg: 'var(--color-status-pending-bg)', ink: 'var(--color-status-pending-ink)', bar: 'var(--color-status-pending-bar)' },
  confirmada: { label: 'Confirmada', bg: 'var(--color-status-confirmed-bg)', ink: 'var(--color-status-confirmed-ink)', bar: 'var(--color-status-confirmed-bar)' },
  completada: { label: 'Completada', bg: 'var(--color-status-done-bg)', ink: 'var(--color-status-done-ink)', bar: 'var(--color-status-done-bar)' },
  cancelada: { label: 'Cancelada', bg: 'var(--color-status-cancelled-bg)', ink: 'var(--color-status-cancelled-ink)', bar: 'var(--color-status-cancelled-bar)' },
  'no-show': { label: 'No-show', bg: 'var(--color-status-noshow-bg)', ink: 'var(--color-status-noshow-ink)', bar: 'var(--color-status-noshow-bar)' },
};

function minutesOf(instant, timeZone) {
  const z = Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone);
  return z.hour * 60 + z.minute;
}
function weekStartOf(plainDate) {
  return plainDate.subtract({ days: plainDate.dayOfWeek - 1 });
}

export default function PanelAgenda() {
  const { professional, tenant } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const team = usePanelTeam(tenant.id);
  const [scope, setScope] = useState('day');
  const [gDate, setGDate] = useState(() => Temporal.Now.plainDateISO(tenant.timezone));
  const [scopeAll, setScopeAll] = useState(false);
  const [openId, setOpenId] = useState(searchParams.get('booking'));

  // Ver la agenda (y por lo tanto los ingresos) de todo el equipo es admin-only, igual que el
  // resto de las vistas consolidadas del panel (Resumen, ranking de Equipo). El backend ya lo
  // exige por RLS (0017_professional_financial_isolation.sql) -- esto es además la UI correcta,
  // no una segunda barrera de seguridad.
  const canSeeTeam = professional.role === 'admin';
  const effectiveScopeAll = canSeeTeam && scopeAll;

  const weekStart = weekStartOf(gDate);
  const monthStart = gDate.with({ day: 1 });
  const range = scope === 'month'
    ? [monthStart, monthStart.add({ months: 1 })]
    : scope === 'week'
      ? [weekStart, weekStart.add({ days: 7 })]
      : [gDate, gDate.add({ days: 1 })];

  const { loading, error, bookings, reload } = usePanelAppointments({
    tenantId: tenant.id, timeZone: tenant.timezone, professionalId: professional.id, scopeAll: effectiveScopeAll,
    from: range[0].toString(), to: range[1].toString(),
  });

  const openBooking = bookings.find((b) => b.id === openId) || null;

  function closeDrawer() {
    setOpenId(null);
    searchParams.delete('booking');
    setSearchParams(searchParams, { replace: true });
  }

  const teamShown = effectiveScopeAll ? team : team.filter((p) => p.id === professional.id);
  const { blocksByPro, exceptionsByPro } = usePanelTeamAvailability(teamShown.map((p) => p.id));
  const ownBlocks = blocksByPro.get(professional.id) || [];
  const ownExceptions = exceptionsByPro.get(professional.id) || [];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="mr-auto text-[21px] font-extrabold tracking-tight text-[#0F172A]">Agenda</h1>
        {canSeeTeam && team.length > 1 && (
          <button
            type="button"
            onClick={() => setScopeAll((v) => !v)}
            className={'min-h-8 rounded-[9px] border px-3 text-[12px] font-semibold ' + (scopeAll ? 'border-[#0F172A] bg-[#0F172A] text-white' : 'border-[#E2E5EC] bg-white text-[#0F172A]')}
          >
            {scopeAll ? 'Todo el equipo' : 'Solo yo'}
          </button>
        )}
        <div className="flex gap-0.5 rounded-[10px] bg-[#F1F2F5] p-0.5">
          {[['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setScope(k)}
              className={'min-h-8 rounded-[8px] px-3 text-[12px] font-semibold ' + (scope === k ? 'bg-white text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,.14)]' : 'text-[#64748B]')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setGDate((d) => d.subtract({ [scope === 'month' ? 'months' : 'days']: scope === 'week' ? 7 : 1 }))} className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[#E2E5EC] bg-white text-[13px]">←</button>
        <button type="button" onClick={() => setGDate((d) => d.add({ [scope === 'month' ? 'months' : 'days']: scope === 'week' ? 7 : 1 }))} className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[#E2E5EC] bg-white text-[13px]">→</button>
        <button type="button" onClick={() => setGDate(Temporal.Now.plainDateISO(tenant.timezone))} className="min-h-8 rounded-[9px] border border-[#E2E5EC] bg-white px-3 text-[12px] font-semibold">Hoy</button>
        <div className="ml-1 text-sm font-bold tracking-tight text-[#0F172A]">
          {scope === 'month' && capitalize(monthLabel(monthStart))}
          {scope === 'week' && `Semana del ${weekStart.day} al ${weekStart.add({ days: 6 }).day} de ${monthLabel(weekStart)}`}
          {scope === 'day' && capitalize(dateLine(gDate))}
        </div>
      </div>

      {error && <p className="text-sm text-[#C0402B]">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-[#64748B]">Cargando agenda…</p>}

      {!loading && !error && scope !== 'month' && (
        <AgendaGrid
          tenant={tenant}
          columns={
            scope === 'week'
              ? Array.from({ length: 7 }).map((_, i) => {
                  const d = weekStart.add({ days: i });
                  return {
                    head: `${WEEKDAYS_SHORT[i]} ${d.day}`,
                    sub: d.toString() === Temporal.Now.plainDateISO(tenant.timezone).toString() ? 'hoy' : '',
                    events: bookings.filter((b) => Temporal.Instant.from(b.start_at).toZonedDateTimeISO(tenant.timezone).toPlainDate().toString() === d.toString()),
                    isWorking: isWorkingDay(ownBlocks, ownExceptions, d),
                    closedRanges: closedRangesWithin(ownBlocks, ownExceptions, d, G0, G1),
                  };
                })
              : teamShown.map((p) => {
                  const blocks = blocksByPro.get(p.id) || [];
                  const exceptions = exceptionsByPro.get(p.id) || [];
                  return {
                    head: p.name,
                    sub: p.role_title,
                    events: bookings.filter((b) => b.professional_id === p.id),
                    isWorking: isWorkingDay(blocks, exceptions, gDate),
                    closedRanges: closedRangesWithin(blocks, exceptions, gDate, G0, G1),
                  };
                })
          }
          onOpen={(id) => { setOpenId(id); searchParams.set('booking', id); setSearchParams(searchParams, { replace: true }); }}
        />
      )}

      {!loading && !error && scope === 'month' && (
        <MonthGrid
          tenant={tenant}
          monthStart={monthStart}
          bookings={bookings}
          onPickDay={(d) => { setGDate(d); setScope('day'); }}
          blocks={ownBlocks}
          exceptions={ownExceptions}
          showClosed={!effectiveScopeAll}
        />
      )}

      {openBooking && <AppointmentDrawer booking={openBooking} tenant={tenant} onClose={closeDrawer} onChanged={reload} />}
    </div>
  );
}

function monthLabel(plainDate) {
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${MONTHS[plainDate.month - 1]} ${plainDate.year}`;
}

function AgendaGrid({ tenant, columns, onOpen }) {
  const hours = [];
  for (let m = G0; m <= G1; m += 60) hours.push(m);

  return (
    <div className="flex flex-col gap-2.5">
      {/* < 768px: lista cronológica, sin grilla horaria (ver README: "agenda como lista de citas por hora") */}
      <div className="flex flex-col gap-2 @[768px]:hidden">
        {columns.flatMap((c) => c.events).length === 0 && <EmptyAgenda />}
        {columns.map((col, ci) => (
          col.events.length > 0 && (
            <div key={ci} className="flex flex-col gap-1.5">
              {columns.length > 1 && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
                  {col.head}
                  {col.isWorking === false && <span className="rounded-[5px] bg-[#F1F2F5] px-1 py-0.5 text-[9px] font-bold normal-case text-[#94A3B8]">Cerrado</span>}
                </div>
              )}
              {[...col.events].sort((a, b) => a.start_at.localeCompare(b.start_at)).map((ev) => (
                <AppointmentCard key={ev.id} booking={ev} tenant={tenant} onClick={() => onOpen(ev.id)} />
              ))}
            </div>
          )
        ))}
      </div>

      {/* >= 768px: grilla horaria con columnas */}
      <div className="hidden overflow-x-auto rounded-[16px] border border-[#E2E5EC] bg-white @[768px]:block">
        <div className="flex min-w-[520px]">
          <div className="sticky left-0 z-[2] w-13 flex-none bg-white pt-11">
            {hours.map((m) => (
              <div key={m} className="-translate-y-1.5 pr-2 text-right font-mono text-[10.5px] text-[#94A3B8]" style={{ height: HH }}>{hhmm(m)}</div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1">
            {columns.map((col, ci) => (
              <div key={ci} className="min-w-[130px] flex-1 border-l border-[#EDEFF3]">
                <div className="sticky top-0 z-[1] h-11 border-b border-[#E2E5EC] bg-white px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <div className={'truncate text-xs font-bold ' + (col.isWorking === false ? 'text-[#B6BAC6]' : 'text-[#0F172A]')}>{col.head}</div>
                    {col.isWorking === false && <span className="flex-none rounded-[5px] bg-[#F1F2F5] px-1 py-0.5 text-[9px] font-bold uppercase text-[#94A3B8]">Cerrado</span>}
                  </div>
                  <div className="truncate text-[10.5px] text-[#94A3B8]">{col.sub}</div>
                </div>
                <div className="relative" style={{ height: ((G1 - G0) / 60) * HH, backgroundImage: `repeating-linear-gradient(#EDEFF3 0 1px, transparent 1px ${HH}px)` }}>
                  {col.closedRanges?.map((r, ri) => (
                    <div
                      key={`closed-${ri}`}
                      className="pointer-events-none absolute inset-x-0"
                      style={{
                        top: ((r.start - G0) / 60) * HH,
                        height: ((r.end - r.start) / 60) * HH,
                        background: 'repeating-linear-gradient(135deg, #F4F5F7, #F4F5F7 7px, #EAECF0 7px, #EAECF0 14px)',
                      }}
                    />
                  ))}
                  {col.events.map((ev) => {
                    const start = minutesOf(ev.start_at, tenant.timezone);
                    const dur = Math.max(1, Math.round((new Date(ev.end_at) - new Date(ev.start_at)) / 60000));
                    const h = Math.max((dur / 60) * HH - 3, 26);
                    const meta = STATUS_META[ev.status];
                    const serviceColor = ev.booking_items?.[0]?.services?.color || meta.bar;
                    const serviceNames = (ev.booking_items || []).map((i) => i.name_snapshot).join(' + ');
                    const tight = h < 52;
                    return (
                      <div key={ev.id} className="absolute left-0.5 right-0.5" style={{ top: ((start - G0) / 60) * HH, height: h }}>
                        <button
                          type="button"
                          onClick={() => onOpen(ev.id)}
                          className={'h-full w-full overflow-hidden rounded-[9px] border-l-[3px] text-left text-[#0F172A] ' + (tight ? 'flex items-center gap-1.5 px-1.5' : 'px-1.5 py-1')}
                          style={{ background: `color-mix(in srgb, ${serviceColor} 16%, white)`, borderColor: meta.bar }}
                        >
                          <span className={'font-mono text-[10px] opacity-70 ' + (tight ? 'flex-none' : 'block')}>{hhmm(start)}</span>
                          {tight ? (
                            <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-[11.5px]">
                              <span className="font-bold">{ev.client_name}</span>
                              <LoyaltyBadge visitsCount={ev.customers?.visits_count} />
                              {serviceNames && <span className="min-w-0 truncate font-normal opacity-70">· {serviceNames}</span>}
                            </span>
                          ) : (
                            <>
                              <span className="flex min-w-0 items-center gap-1 truncate text-[11.5px] font-bold">
                                <span className="truncate">{ev.client_name}</span>
                                <LoyaltyBadge visitsCount={ev.customers?.visits_count} />
                              </span>
                              {serviceNames && <span className="block truncate text-[10.5px] font-normal opacity-70">{serviceNames}</span>}
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3.5 border-t border-[#E2E5EC] px-3 py-2.5 text-[11px] text-[#64748B]">
          {Object.values(STATUS_META).map((m) => (
            <span key={m.label} className="flex items-center gap-1.5"><span className="h-3 w-1 rounded-full" style={{ background: m.bar }} />{m.label}</span>
          ))}
          <span className="ml-auto text-[10.5px] text-[#94A3B8]">El color de fondo de cada bloque indica el servicio</span>
        </div>
      </div>
    </div>
  );
}

function AppointmentCard({ booking, tenant, onClick }) {
  const meta = STATUS_META[booking.status];
  const start = minutesOf(booking.start_at, tenant.timezone);
  const end = minutesOf(booking.end_at, tenant.timezone);
  const serviceColor = booking.booking_items?.[0]?.services?.color || '#94A3B8';
  const serviceNames = (booking.booking_items || []).map((i) => i.name_snapshot).join(' + ');
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1.5 rounded-[13px] border-y border-r border-l-[3px] border-[#E2E5EC] px-3 py-2.5 text-left"
      style={{ background: `color-mix(in srgb, ${serviceColor} 8%, white)`, borderLeftColor: serviceColor }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="truncate text-[13.5px] font-bold text-[#0F172A]">{booking.client_name}</span>
          <LoyaltyBadge visitsCount={booking.customers?.visits_count} />
          {serviceNames && <span className="truncate text-[12px] font-medium text-[#64748B]">· {serviceNames}</span>}
        </span>
        <span className="flex-none rounded-[7px] px-2 py-0.5 text-[10.5px] font-bold" style={{ background: meta.bg, color: meta.ink }}>{meta.label}</span>
      </div>
      <span className="font-mono text-[11.5px] text-[#64748B]">{hhmmRange12(start, end)}</span>
    </button>
  );
}

function EmptyAgenda() {
  return (
    <div className="rounded-[16px] border border-dashed border-[#D3D7E0] px-4 py-8 text-center">
      <div className="text-sm font-bold text-[#0F172A]">Sin citas en este período</div>
      <p className="mt-1 text-xs text-[#64748B]">Cambia de fecha o de alcance para ver otras citas.</p>
    </div>
  );
}

function MonthGrid({ tenant, monthStart, bookings, onPickDay, blocks, exceptions, showClosed }) {
  const daysInMonth = monthStart.daysInMonth;
  const leading = monthStart.dayOfWeek - 1;
  const byDay = useMemo(() => {
    const map = new Map();
    for (const b of bookings) {
      const d = Temporal.Instant.from(b.start_at).toZonedDateTimeISO(tenant.timezone).toPlainDate().day;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(b);
    }
    return map;
  }, [bookings, tenant.timezone]);

  const cells = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-3">
      <div className="mb-1 grid grid-cols-7 gap-1.5">
        {WEEKDAYS_SHORT.map((w) => <div key={w} className="pl-0.5 font-mono text-[10px] uppercase tracking-wider text-[#94A3B8]">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[56px] @[768px]:min-h-[78px]" />;
          const plainDate = monthStart.with({ day: d });
          const list = byDay.get(d) || [];
          const revenue = list.filter((b) => b.status === 'confirmada' || b.status === 'completada').reduce((a, b) => a + b.total_price_clp, 0);
          const isClosed = showClosed && !isWorkingDay(blocks, exceptions, plainDate);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPickDay(plainDate)}
              className={
                'flex min-h-[56px] flex-col gap-0.5 rounded-[10px] border p-1.5 text-left @[768px]:min-h-[78px] @[768px]:p-2 ' +
                (isClosed ? 'border-[#EDEFF3] bg-[#F7F8FA]' : 'border-[#E2E5EC]')
              }
            >
              <span className={'font-mono text-xs font-medium ' + (isClosed ? 'text-[#B6BAC6]' : '')}>{d}</span>
              {isClosed && list.length === 0 && <span className="text-[9.5px] font-semibold uppercase tracking-wide text-[#C7CAD4]">Cerrado</span>}
              {list.length > 0 && <span className="text-[10.5px] text-[#64748B]">{list.length} citas</span>}
              {revenue > 0 && <span className="hidden font-mono text-[10.5px] text-[#3730A3] @[768px]:block">{money(revenue, tenant.currency)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
