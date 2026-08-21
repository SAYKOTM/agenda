import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import { usePanelClients } from '../../features/panel/usePanelClients';
import PanelClientDetail from '../../components/panel/PanelClientDetail';
import LoyaltyBadge from '../../components/panel/LoyaltyBadge';
import { money, dateLine, capitalize } from '../../lib/format';

export default function PanelClients() {
  const { tenant } = useOutletContext();
  const { loading, error, customers } = usePanelClients(tenant.id);
  const [selected, setSelected] = useState(null);

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Clientes</h1>
        <p className="mt-0.5 text-[12.5px] text-[#64748B]">{customers.length} clientes en {tenant.name}</p>
      </div>

      {error && <p className="text-sm text-[#C0402B]">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-[#64748B]">Cargando…</p>}

      {!loading && !error && customers.length === 0 && (
        <div className="rounded-[16px] border border-[#E2E5EC] bg-white px-5 py-13 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#F1F2F5] text-lg">◐</div>
          <div className="text-base font-extrabold tracking-tight">Aún no hay clientes</div>
          <p className="mx-auto mt-1.5 max-w-[380px] text-[12.5px] text-[#64748B]">En cuanto se confirme la primera reserva, la ficha del cliente aparece aquí automáticamente.</p>
        </div>
      )}

      {!loading && !error && customers.length > 0 && (
        <div className="overflow-hidden rounded-[16px] border border-[#E2E5EC] bg-white">
          <div className="hidden grid-cols-[2fr_1.2fr_1fr_1fr_.7fr] gap-2.5 border-b border-[#E2E5EC] bg-[#FAFBFC] px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[#94A3B8] @[768px]:grid">
            <span>Cliente</span><span>Teléfono</span><span>Total invertido</span><span>Última visita</span><span>Visitas</span>
          </div>
          <div className="flex flex-col gap-2.5 p-3 @[768px]:gap-0 @[768px]:p-0">
            {customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                className="flex flex-col gap-2 rounded-[14px] border border-[#E2E5EC] p-3 text-left @[768px]:grid @[768px]:grid-cols-[2fr_1.2fr_1fr_1fr_.7fr] @[768px]:items-center @[768px]:gap-2.5 @[768px]:rounded-none @[768px]:border-0 @[768px]:border-b @[768px]:border-[#F1F2F5] @[768px]:p-3.5"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-bold text-[#0F172A]">{c.name}</span>
                  <LoyaltyBadge visitsCount={c.visits_count} />
                </span>
                <span className="text-xs text-[#475569]">{c.phone}</span>
                <span className="font-mono text-xs font-medium">{money(c.total_spent_clp, tenant.currency)}</span>
                <span className="text-xs text-[#64748B]">{c.last_visit_at ? capitalize(dateLine(Temporal.Instant.from(c.last_visit_at).toZonedDateTimeISO(tenant.timezone).toPlainDate())) : 'Sin visitas'}</span>
                <span className="font-mono text-xs text-[#64748B]">{c.visits_count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && <PanelClientDetail customer={selected} tenant={tenant} onClose={() => setSelected(null)} />}
    </div>
  );
}
