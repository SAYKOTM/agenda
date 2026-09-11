import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { usePanelMetrics } from '../../features/panel/usePanelMetrics';
import { usePanelTeamRanking } from '../../features/panel/usePanelTeamRanking';
import { usePanelMonthSummary } from '../../features/panel/usePanelMonthSummary';
import BarChart from '../../components/charts/BarChart';
import DonutChart from '../../components/charts/DonutChart';
import { money } from '../../lib/format';

const PAYMENT_SHORT_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', online: 'Online' };
const PAYMENT_COLOR = { efectivo: '#4F46E5', transferencia: '#2C8B58', online: '#E0891B' };
const SCOPES = [['day', 'Hoy'], ['week', 'Esta semana'], ['month', 'Mes actual']];

export default function PanelOverview() {
  const { professional, tenant } = useOutletContext();
  const [scope, setScope] = useState('week');
  const { loading, error, data } = usePanelMetrics({ timeZone: tenant.timezone, tenantId: tenant.id, professionalId: professional.id, scopeAll: true });
  const { loading: rankLoading, error: rankError, ranking } = usePanelTeamRanking(tenant.timezone, scope);
  const { loading: monthLoading, error: monthError, data: month } = usePanelMonthSummary({ timeZone: tenant.timezone, professionalId: professional.id, scopeAll: true });

  if (loading) return <p className="py-10 text-center text-sm text-[#64748B]">Cargando…</p>;
  if (error) return <p className="py-10 text-center text-sm text-[#C0402B]">{error}</p>;

  const scoped = data[scope]; // { revenue, bookingsCount, paidCount, topServices, ... }
  const ticket = scoped.paidCount ? Math.round(scoped.revenue / scoped.paidCount) : 0;
  const occupancy = data.occupancyAvailableMin ? Math.min(100, Math.round((data.occupancyBookedMin / data.occupancyAvailableMin) * 100)) : 0;

  const totalCommission = ranking.reduce((a, r) => a + Number(r.commission_clp), 0);
  const netSalon = scoped.revenue - totalCommission;
  const maxRevenue = Math.max(1, ...ranking.map((r) => Number(r.revenue)));
  const maxTop = Math.max(1, ...scoped.topServices.map((s) => s.count));

  const kpis = [
    { label: 'Ingresos totales del salón', val: money(scoped.revenue, tenant.currency) },
    { label: 'Ganancia neta del salón', val: money(netSalon, tenant.currency), sub: `- ${money(totalCommission, tenant.currency)} en comisiones` },
    { label: 'Citas realizadas', val: String(scoped.bookingsCount) },
    { label: 'Ticket promedio', val: money(ticket, tenant.currency) },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Resumen financiero</h1>
          <p className="mt-0.5 text-[12.5px] text-[#64748B]">Ingresos, ganancia neta y comisiones del equipo · solo visible para Admin/Owner</p>
        </div>
        <div className="flex gap-0.5 rounded-[10px] bg-[#F1F2F5] p-0.5">
          {SCOPES.map(([k, label]) => (
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

      <div className="grid grid-cols-2 gap-2.5 @[560px]:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
            <div className="text-[11.5px] font-semibold text-[#64748B]">{k.label}</div>
            <div className="my-1 font-mono text-[clamp(17px,4vw,21px)] font-medium tracking-tight text-[#0F172A]">{k.val}</div>
            {k.sub && <div className="text-[11px] text-[#94A3B8]">{k.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 @[900px]:grid-cols-2 @[900px]:items-start">
        <div className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[13.5px] font-bold text-[#0F172A]">Rendimiento por profesional</span>
            <span className="text-[10.5px] text-[#94A3B8]">citas · ingresos · comisión</span>
          </div>
          {rankLoading && <p className="text-[12.5px] text-[#64748B]">Cargando…</p>}
          {rankError && <p className="text-[12.5px] text-[#C0402B]">{rankError}</p>}
          {!rankLoading && !rankError && ranking.length === 0 && <p className="text-[12.5px] text-[#64748B]">Sin datos en este período.</p>}
          <div className="flex flex-col gap-3">
            {ranking.map((r, i) => (
              <div key={r.professional_id}>
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-[#94A3B8]">#{i + 1}</span>
                  <span className="flex-1 truncate text-[12.5px] font-semibold">{r.name}</span>
                  <span className="text-[11.5px] text-[#64748B]">{r.bookings_count} citas</span>
                  <span className="font-mono text-xs font-medium">{money(r.revenue, tenant.currency)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#EDEFF3]"><div className="h-full rounded-full bg-[#0F172A]" style={{ width: `${Math.round((Number(r.revenue) / maxRevenue) * 100)}%` }} /></div>
                <div className="mt-1 text-right text-[10.5px] text-[#94A3B8]">
                  comisión {r.commission_pct}% · <span className="font-mono">{money(Number(r.commission_clp), tenant.currency)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
          <div className="text-[13.5px] font-bold text-[#0F172A]">Servicios más solicitados</div>
          <p className="mb-3 mt-0.5 text-[11.5px] text-[#94A3B8]">Cuenta solo citas confirmadas o completadas: una reserva cancelada no suma.</p>
          {scoped.topServices.length === 0 && <p className="text-[12.5px] text-[#64748B]">Sin datos en este período.</p>}
          <div className="flex flex-col gap-2.5">
            {scoped.topServices.map((s) => (
              <div key={s.name}>
                <div className="mb-1 flex justify-between text-[12.5px]"><span className="font-semibold">{s.name}</span><span className="text-[#64748B]">{s.count} citas</span></div>
                <div className="h-1.5 rounded-full bg-[#EDEFF3]"><div className="h-full rounded-full bg-[#4F46E5]" style={{ width: `${Math.round((s.count / maxTop) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-[#F1F2F5] pt-3 text-[12px] text-[#64748B]">Ocupación del local (semana): <span className="font-mono font-medium text-[#0F172A]">{occupancy}%</span></div>
        </div>
      </div>

      <div>
        <h2 className="text-[15px] font-extrabold tracking-tight text-[#0F172A]">Cierre de mes</h2>
        <p className="mt-0.5 text-[12px] text-[#64748B]">Mes en curso</p>
      </div>

      {monthLoading && <p className="py-6 text-center text-sm text-[#64748B]">Cargando cierre de mes…</p>}
      {monthError && <p className="text-sm text-[#C0402B]">{monthError}</p>}

      {!monthLoading && !monthError && month && (
        <>
          <div className="grid grid-cols-2 gap-2.5 @[560px]:grid-cols-4">
            <div className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
              <div className="text-[11.5px] font-semibold text-[#64748B]">Tasa de conversión</div>
              <div className="my-1 font-mono text-[clamp(17px,4vw,21px)] font-medium tracking-tight text-[#0F172A]">
                {month.views ? Math.round((month.bookingsCreated / month.views) * 100) : 0}%
              </div>
              <div className="text-[11px] text-[#94A3B8]">{month.bookingsCreated} reservas / {month.views} vistas</div>
            </div>
            <div className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
              <div className="text-[11.5px] font-semibold text-[#64748B]">Clientes atendidos</div>
              <div className="my-1 font-mono text-[clamp(17px,4vw,21px)] font-medium tracking-tight text-[#0F172A]">{month.customersServed}</div>
              <div className="text-[11px] text-[#94A3B8]">este mes</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 @[900px]:grid-cols-[1.4fr_1fr] @[900px]:items-start">
            <div className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
              <div className="mb-3 text-[13.5px] font-bold text-[#0F172A]">Ingresos diarios</div>
              <BarChart data={month.revenueByDay} formatValue={(v) => money(v, tenant.currency)} labelEvery={5} />
            </div>
            <div className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
              <div className="mb-3 text-[13.5px] font-bold text-[#0F172A]">Ingresos por método de pago</div>
              <DonutChart
                data={month.paymentBreakdown.map((p) => ({ label: PAYMENT_SHORT_LABEL[p.method] || p.method, value: p.revenue, color: PAYMENT_COLOR[p.method] || '#94A3B8' }))}
                formatValue={(v) => money(v, tenant.currency)}
              />
            </div>
          </div>

          <div className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
            <div className="mb-3 text-[13.5px] font-bold text-[#0F172A]">Servicios más vendidos (por ingresos)</div>
            {month.topServices.length === 0 && <p className="text-[12.5px] text-[#64748B]">Sin datos este mes.</p>}
            <div className="flex flex-col gap-2.5">
              {month.topServices.map((s) => {
                const maxMonthRevenue = Math.max(1, ...month.topServices.map((x) => x.revenue));
                return (
                  <div key={s.name}>
                    <div className="mb-1 flex justify-between text-[12.5px]"><span className="font-semibold">{s.name}</span><span className="font-mono text-[#64748B]">{money(s.revenue, tenant.currency)}</span></div>
                    <div className="h-1.5 rounded-full bg-[#EDEFF3]"><div className="h-full rounded-full bg-[#4F46E5]" style={{ width: `${Math.round((s.revenue / maxMonthRevenue) * 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
