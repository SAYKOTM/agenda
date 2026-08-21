import { useOutletContext } from 'react-router-dom';
import { usePanelMetrics } from '../../features/panel/usePanelMetrics';
import { usePanelTeamRanking } from '../../features/panel/usePanelTeamRanking';
import { money } from '../../lib/format';

export default function PanelOverview() {
  const { professional, tenant } = useOutletContext();
  const { loading, error, data } = usePanelMetrics({ timeZone: tenant.timezone, tenantId: tenant.id, professionalId: professional.id, scopeAll: true });
  const { loading: rankLoading, error: rankError, ranking } = usePanelTeamRanking(tenant.timezone);

  if (loading) return <p className="py-10 text-center text-sm text-[#64748B]">Cargando…</p>;
  if (error) return <p className="py-10 text-center text-sm text-[#C0402B]">{error}</p>;

  const ticketWeek = data.week.paidCount ? Math.round(data.week.revenue / data.week.paidCount) : 0;
  const occupancy = data.occupancyAvailableMin ? Math.min(100, Math.round((data.occupancyBookedMin / data.occupancyAvailableMin) * 100)) : 0;
  const maxRevenue = Math.max(1, ...ranking.map((r) => Number(r.revenue)));
  const maxTop = Math.max(1, ...data.week.topServices.map((s) => s.count));

  const kpis = [
    { label: 'Ingresos del salón (semana)', val: money(data.week.revenue, tenant.currency) },
    { label: 'Citas de la semana', val: String(data.week.bookingsCount) },
    { label: 'Ocupación del local', val: `${occupancy}%` },
    { label: 'Ticket promedio', val: money(ticketWeek, tenant.currency) },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Resumen del salón</h1>
        <p className="mt-0.5 text-[12.5px] text-[#64748B]">Semana actual</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 @[560px]:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
            <div className="text-[11.5px] font-semibold text-[#64748B]">{k.label}</div>
            <div className="my-1 font-mono text-[clamp(17px,4vw,21px)] font-medium tracking-tight text-[#0F172A]">{k.val}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 @[900px]:grid-cols-2 @[900px]:items-start">
        <div className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
          <div className="mb-3 text-[13.5px] font-bold text-[#0F172A]">Ranking de profesionales</div>
          {rankLoading && <p className="text-[12.5px] text-[#64748B]">Cargando…</p>}
          {rankError && <p className="text-[12.5px] text-[#C0402B]">{rankError}</p>}
          <div className="flex flex-col gap-3">
            {ranking.map((r, i) => (
              <div key={r.professional_id}>
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-[#94A3B8]">#{i + 1}</span>
                  <span className="flex-1 text-[12.5px] font-semibold">{r.name}</span>
                  <span className="text-[11.5px] text-[#64748B]">{r.bookings_count} citas</span>
                  <span className="font-mono text-xs font-medium">{money(r.revenue, tenant.currency)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#EDEFF3]"><div className="h-full rounded-full bg-[#0F172A]" style={{ width: `${Math.round((Number(r.revenue) / maxRevenue) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
          <div className="mb-3 text-[13.5px] font-bold text-[#0F172A]">Servicios más solicitados</div>
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
      </div>
    </div>
  );
}
