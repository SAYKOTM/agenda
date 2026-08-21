import { useOutletContext, useNavigate } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import { usePanelMetrics } from '../../features/panel/usePanelMetrics';
import LoyaltyBadge from '../../components/panel/LoyaltyBadge';
import { money, hhmm, dateLine, capitalize } from '../../lib/format';

const STATUS_LABEL = { pendiente: 'Pendiente', confirmada: 'Confirmada', completada: 'Completada', cancelada: 'Cancelada', 'no-show': 'No-show' };
const STATUS_CLASS = {
  pendiente: 'bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-ink)]',
  confirmada: 'bg-[var(--color-status-confirmed-bg)] text-[var(--color-status-confirmed-ink)]',
  completada: 'bg-[var(--color-status-done-bg)] text-[var(--color-status-done-ink)]',
  cancelada: 'bg-[var(--color-status-cancelled-bg)] text-[var(--color-status-cancelled-ink)]',
  'no-show': 'bg-[var(--color-status-noshow-bg)] text-[var(--color-status-noshow-ink)]',
};

function delta(current, previous) {
  if (!previous) return { deltaLabel: current ? 'sin comparación' : 'sin datos', up: true };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { deltaLabel: `${pct >= 0 ? '+' : ''}${pct}% vs. período anterior`, up: pct >= 0 };
}

export default function PanelDashboard() {
  const { professional, tenant } = useOutletContext();
  const navigate = useNavigate();
  const { loading, error, data } = usePanelMetrics({ timeZone: tenant.timezone, tenantId: tenant.id, professionalId: professional.id, scopeAll: false });

  if (loading) return <p className="py-10 text-center text-sm text-[#64748B]">Cargando métricas…</p>;
  if (error) return <p className="py-10 text-center text-sm text-[#C0402B]">{error}</p>;

  const ticketWeek = data.week.paidCount ? Math.round(data.week.revenue / data.week.paidCount) : 0;
  const ticketPrevWeek = data.prevWeek.paidCount ? Math.round(data.prevWeek.revenue / data.prevWeek.paidCount) : 0;
  const cancelRate = data.week.bookingsCount ? Math.round((data.week.cancelNoShowCount / data.week.bookingsCount) * 100) : 0;
  const occupancy = data.occupancyAvailableMin ? Math.min(100, Math.round((data.occupancyBookedMin / data.occupancyAvailableMin) * 100)) : 0;
  const maxTop = Math.max(1, ...data.week.topServices.map((s) => s.count));

  const kpis = [
    { label: 'Ingresos de hoy', val: money(data.day.revenue, tenant.currency), ...delta(data.day.revenue, data.prevDay.revenue) },
    { label: 'Ingresos de la semana', val: money(data.week.revenue, tenant.currency), ...delta(data.week.revenue, data.prevWeek.revenue) },
    { label: 'Ingresos del mes', val: money(data.month.revenue, tenant.currency), ...delta(data.month.revenue, data.prevMonth.revenue) },
    { label: 'Ticket promedio (semana)', val: money(ticketWeek, tenant.currency), ...delta(ticketWeek, ticketPrevWeek) },
  ];
  const stats = [
    { label: 'Citas esta semana', val: String(data.week.bookingsCount), sub: `${data.day.bookingsCount} hoy` },
    { label: 'Clientes nuevos', val: String(data.week.newCustomers), sub: `${Math.max(0, data.week.bookingsCount - data.week.newCustomers)} recurrentes` },
    { label: 'Cancelación / no-show', val: `${cancelRate}%`, sub: 'meta: bajo 10%' },
    { label: 'Ocupación', val: `${occupancy}%`, sub: 'sobre horas disponibles' },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Hoy</h1>
        <p className="mt-0.5 text-[12.5px] text-[#64748B]">{capitalize(dateLine(data.today))}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 @[560px]:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
            <div className="text-[11.5px] font-semibold text-[#64748B]">{k.label}</div>
            <div className="my-1 font-mono text-[clamp(17px,4vw,21px)] font-medium tracking-tight text-[#0F172A]">{k.val}</div>
            <div className={'text-[11.5px] font-bold ' + (k.up ? 'text-[#1E6B43]' : 'text-[#A33421]')}>{k.deltaLabel}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 @[900px]:grid-cols-[1.4fr_1fr] @[900px]:items-start">
        <div className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[13.5px] font-bold text-[#0F172A]">Próximas citas de hoy</span>
          </div>
          {data.nextUp.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#D3D7E0] px-4 py-6.5 text-center">
              <div className="text-sm font-bold text-[#0F172A]">No quedan citas hoy</div>
              <p className="mt-1 text-xs text-[#64748B]">Aprovecha para cerrar caja o abrir más disponibilidad.</p>
            </div>
          )}
          <div className="flex flex-col">
            {data.nextUp.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/panel/agenda?booking=${a.id}`)}
                className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 text-left hover:bg-[#F7F8FA]"
              >
                <span className="w-11 flex-none font-mono text-[12.5px] font-medium">{hhmm(minutesOfDay(a.start_at, tenant.timezone))}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-[#0F172A]">
                    {a.client_name}
                    <LoyaltyBadge visitsCount={a.customers?.visits_count} />
                  </span>
                  <span className="block truncate text-[11.5px] text-[#64748B]">{(a.booking_items || []).map((i) => i.name_snapshot).join(' + ')}</span>
                </span>
                <span className={'flex-none rounded-[7px] px-2 py-0.5 text-[10.5px] font-bold ' + STATUS_CLASS[a.status]}>{STATUS_LABEL[a.status]}</span>
                <span className="w-16 flex-none text-right font-mono text-xs">{money(a.total_price_clp, tenant.currency)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
            <div className="mb-2.5 text-[13.5px] font-bold text-[#0F172A]">Servicios más solicitados</div>
            {data.week.topServices.length === 0 && <p className="text-[12.5px] text-[#64748B]">Sin datos esta semana.</p>}
            <div className="flex flex-col gap-2.5">
              {data.week.topServices.map((s) => (
                <div key={s.name}>
                  <div className="mb-1 flex justify-between text-[12.5px]"><span className="font-semibold">{s.name}</span><span className="text-[#64748B]">{s.count} citas</span></div>
                  <div className="h-1.5 rounded-full bg-[#EDEFF3]"><div className="h-full rounded-full bg-[#4F46E5]" style={{ width: `${Math.round((s.count / maxTop) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {stats.map((s) => (
              <div key={s.label} className="rounded-[14px] border border-[#E2E5EC] bg-white p-3">
                <div className="text-[11px] font-semibold text-[#64748B]">{s.label}</div>
                <div className="my-1 font-mono text-[18px] font-medium">{s.val}</div>
                <div className="text-[11px] text-[#94A3B8]">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function minutesOfDay(instant, timeZone) {
  const zdt = Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone);
  return zdt.hour * 60 + zdt.minute;
}
