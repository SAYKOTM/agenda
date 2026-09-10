import { useOutletContext } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import { usePanelPrivacyRequests } from '../../features/panel/usePanelPrivacyRequests';
import { useToast } from '../../components/Toast';
import { dateLine, capitalize } from '../../lib/format';

const TYPE_LABEL = {
  acceso: 'Acceso',
  rectificacion: 'Rectificación',
  cancelacion: 'Cancelación',
  oposicion: 'Oposición',
  portabilidad: 'Portabilidad',
  bloqueo: 'Bloqueo',
};

const STATUS_LABEL = { pendiente: 'Pendiente', en_proceso: 'En proceso', resuelta: 'Resuelta' };
const STATUS_CLASS = {
  pendiente: 'bg-[#FEF3C7] text-[#92400E]',
  en_proceso: 'bg-[#DBEAFE] text-[#1D4ED8]',
  resuelta: 'bg-[#DCFCE7] text-[#166534]',
};

export default function PanelPrivacyRequests() {
  const { tenant } = useOutletContext();
  const { loading, error, requests, updateStatus } = usePanelPrivacyRequests(tenant.id);
  const toast = useToast();

  async function onSetStatus(id, status) {
    const err = await updateStatus(id, status);
    toast(err ? 'No pudimos actualizar la solicitud' : 'Solicitud actualizada');
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Solicitudes de privacidad</h1>
        <p className="mt-0.5 text-[12.5px] text-[#64748B]">
          Pedidos de acceso, rectificación, cancelación, oposición, portabilidad o bloqueo de datos que clientes de {tenant.name} enviaron desde /solicitud-datos.
        </p>
      </div>

      {error && <p className="text-sm text-[#C0402B]">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-[#64748B]">Cargando…</p>}

      {!loading && !error && requests.length === 0 && (
        <div className="rounded-[16px] border border-[#E2E5EC] bg-white px-5 py-13 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#F1F2F5] text-lg">✓</div>
          <div className="text-base font-extrabold tracking-tight">Sin solicitudes</div>
          <p className="mx-auto mt-1.5 max-w-[380px] text-[12.5px] text-[#64748B]">Cuando alguien pida ejercer un derecho sobre sus datos indicando este salón, aparecerá aquí.</p>
        </div>
      )}

      {!loading && !error && requests.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-bold text-[#0F172A]">{TYPE_LABEL[r.request_type] || r.request_type}</span>
                  <span className={'rounded-full px-2 py-0.5 text-[10.5px] font-bold ' + STATUS_CLASS[r.status]}>{STATUS_LABEL[r.status]}</span>
                </div>
                <span className="font-mono text-[11px] text-[#94A3B8]">{capitalize(dateLine(Temporal.Instant.from(r.created_at).toZonedDateTimeISO(tenant.timezone).toPlainDate()))}</span>
              </div>
              <div className="text-[13px] text-[#334155]">
                {r.full_name} · {r.email}
                {r.phone ? ` · ${r.phone}` : ''}
              </div>
              {r.message && <p className="text-[12.5px] text-[#64748B]">{r.message}</p>}
              <div className="mt-1 flex gap-2">
                {r.status !== 'en_proceso' && (
                  <button type="button" onClick={() => onSetStatus(r.id, 'en_proceso')} className="rounded-[10px] border border-[#E2E5EC] px-3 py-1.5 text-[12px] font-semibold">
                    Marcar en proceso
                  </button>
                )}
                {r.status !== 'resuelta' && (
                  <button type="button" onClick={() => onSetStatus(r.id, 'resuelta')} className="rounded-[10px] bg-[#0F172A] px-3 py-1.5 text-[12px] font-semibold text-white">
                    Marcar resuelta
                  </button>
                )}
                {r.status !== 'pendiente' && (
                  <button type="button" onClick={() => onSetStatus(r.id, 'pendiente')} className="rounded-[10px] border border-[#E2E5EC] px-3 py-1.5 text-[12px] font-semibold text-[#64748B]">
                    Reabrir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
