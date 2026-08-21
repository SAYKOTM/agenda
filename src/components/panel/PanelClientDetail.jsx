import { Temporal } from '@js-temporal/polyfill';
import { usePanelClientHistory } from '../../features/panel/usePanelClients';
import LoyaltyBadge from './LoyaltyBadge';
import { money, dateLine, capitalize } from '../../lib/format';
import { paymentMethodLabel } from '../../lib/paymentLabels';

const STATUS_LABEL = { pendiente: 'Pendiente', confirmada: 'Confirmada', completada: 'Completada', cancelada: 'Cancelada', 'no-show': 'No-show' };

// Ficha de cliente: datos de contacto, total invertido, última visita e historial de
// servicios reservados. Mismo patrón visual que AppointmentDrawer.jsx (panel lateral).
export default function PanelClientDetail({ customer, tenant, onClose }) {
  const { loading, error, bookings } = usePanelClientHistory(customer.id);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-[rgba(15,23,42,.4)]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col gap-3.5 overflow-y-auto bg-white p-4 [animation:fadeUp_.2s_ease] @[520px]:w-[420px]"
        style={{ overscrollBehavior: 'contain', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#F1F2F5] text-[13px] font-bold">
              {customer.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[15px] font-bold text-[#0F172A]">
                {customer.name}
                <LoyaltyBadge visitsCount={customer.visits_count} size="md" />
              </div>
              <div className="text-xs text-[#64748B]">{customer.phone}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-[#E2E5EC] text-sm">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[13px] border border-[#E2E5EC] p-3">
            <div className="text-[10.5px] font-semibold text-[#94A3B8]">Total invertido</div>
            <div className="mt-0.5 font-mono text-[16px] font-medium text-[#0F172A]">{money(customer.total_spent_clp, tenant.currency)}</div>
          </div>
          <div className="rounded-[13px] border border-[#E2E5EC] p-3">
            <div className="text-[10.5px] font-semibold text-[#94A3B8]">Visitas</div>
            <div className="mt-0.5 font-mono text-[16px] font-medium text-[#0F172A]">{customer.visits_count}</div>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-[16px] border border-[#E2E5EC] p-3.5 text-[13px]">
          <Row label="Teléfono" value={customer.phone} />
          <Row label="Email" value={customer.email || '—'} />
          <Row label="Última visita" value={customer.last_visit_at ? capitalize(dateLine(Temporal.Instant.from(customer.last_visit_at).toZonedDateTimeISO(tenant.timezone).toPlainDate())) : 'Sin visitas aún'} />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-bold text-[#0F172A]">Historial de servicios</div>
          {loading && <p className="text-[12.5px] text-[#64748B]">Cargando…</p>}
          {error && <p className="text-[12.5px] text-[#C0402B]">{error}</p>}
          {!loading && !error && bookings.length === 0 && <p className="text-[12.5px] text-[#64748B]">Sin reservas todavía.</p>}
          <div className="flex flex-col gap-2">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-[12px] border border-[#E2E5EC] p-2.5 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0F172A]">{capitalize(dateLine(Temporal.Instant.from(b.start_at).toZonedDateTimeISO(tenant.timezone).toPlainDate()))}</span>
                  <span className="font-mono text-xs">{money(b.total_price_clp, tenant.currency)}</span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-[#64748B]">{(b.booking_items || []).map((i) => i.name_snapshot).join(' + ')}</div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-[#94A3B8]">
                  <span>{b.professionals?.name} · {paymentMethodLabel(b.payment_method)}</span>
                  <span>{STATUS_LABEL[b.status]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
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
