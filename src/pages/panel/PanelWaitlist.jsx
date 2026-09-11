import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import { supabase } from '../../lib/supabaseClient';
import { usePanelWaitlist } from '../../features/panel/usePanelWaitlist';
import { useToast } from '../../components/Toast';
import { capitalize, dateLine } from '../../lib/format';
import { bookingLinkForDate, whatsappDirectUrl } from '../../lib/publicLinks';

const STATUS_META = {
  esperando: { label: 'Esperando', cls: 'bg-[#FEF2E0] text-[#96540E]' },
  avisado: { label: 'Avisado', cls: 'bg-[#E9EBFD] text-[#3730A3]' },
  reservado: { label: 'Reservó', cls: 'bg-[#E7F4EC] text-[#1E6B43]' },
  descartado: { label: 'Descartado', cls: 'bg-[#F2F4F7] text-[#64748B]' },
};

export default function PanelWaitlist() {
  const { tenant, professional } = useOutletContext();
  const toast = useToast();
  const { loading, error, entries, serviceNames, reload } = usePanelWaitlist(tenant.id);
  const [showClosed, setShowClosed] = useState(false);

  const open = entries.filter((e) => e.status === 'esperando' || e.status === 'avisado');
  const closed = entries.filter((e) => e.status === 'reservado' || e.status === 'descartado');
  const shown = showClosed ? closed : open;

  async function setStatus(entry, status) {
    const patch = { status };
    if (status === 'avisado') patch.notified_at = new Date().toISOString();
    const { error: updateError } = await supabase.from('waitlist_entries').update(patch).eq('id', entry.id);
    if (updateError) {
      toast('No pudimos actualizar la lista');
      return false;
    }
    reload();
    return true;
  }

  // Abrir WhatsApp y marcar "avisado" van juntos: si se hicieran por separado, la lista se
  // llenaría de gente a la que ya se le escribió pero que sigue figurando como pendiente.
  function notify(entry) {
    const when = capitalize(dateLine(Temporal.PlainDate.from(entry.desired_date)));
    const pro = entry.professional_id ? { public_slug: null, id: entry.professional_id } : null;
    const link = bookingLinkForDate(tenant.slug, pro, entry.desired_date);
    const firstName = entry.client_name.split(' ')[0];
    const text =
      `Hola ${firstName}, soy ${professional.name} de ${tenant.name}. ` +
      `Se liberó una hora para el ${when.toLowerCase()}. ¿La tomás? Reservá acá: ${link}`;
    window.open(whatsappDirectUrl(entry.client_phone, text), '_blank', 'noopener');
    setStatus(entry, 'avisado');
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Lista de espera</h1>
          <p className="mt-0.5 max-w-[520px] text-[12.5px] text-[#64748B]">
            Clientes que quisieron un día lleno. Cuando se cancela una cita de ese día te llega un aviso y desde acá les
            escribís por WhatsApp con el mensaje listo.
          </p>
        </div>
        <div className="flex gap-0.5 rounded-[10px] bg-[#F1F2F5] p-0.5">
          {[[false, `Esperando (${open.length})`], [true, `Cerradas (${closed.length})`]].map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setShowClosed(value)}
              className={
                'min-h-8 rounded-[8px] px-3 text-[12px] font-semibold ' +
                (showClosed === value ? 'bg-white text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,.14)]' : 'text-[#64748B]')
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-[#C0402B]">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-[#64748B]">Cargando…</p>}

      {!loading && !error && shown.length === 0 && (
        <div className="rounded-[16px] border border-[#E2E5EC] bg-white px-5 py-13 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#F1F2F5] text-lg">◷</div>
          <div className="text-base font-extrabold tracking-tight">
            {showClosed ? 'Todavía no cerraste ninguna' : 'No hay nadie esperando'}
          </div>
          <p className="mx-auto mt-1.5 max-w-[420px] text-[12.5px] text-[#64748B]">
            {showClosed
              ? 'Acá quedan las que marcaste como reservadas o descartadas.'
              : 'Cuando un cliente abra tu link y no encuentre hora ese día, va a poder anotarse acá en vez de irse.'}
          </p>
        </div>
      )}

      {!loading && !error && shown.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {shown.map((entry) => {
            const meta = STATUS_META[entry.status];
            const services = (entry.service_ids || []).map((id) => serviceNames[id]).filter(Boolean).join(' + ');
            return (
              <div key={entry.id} className="flex flex-col gap-3 rounded-[14px] border border-[#E2E5EC] bg-white p-3.5 @[760px]:flex-row @[760px]:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13.5px] font-bold text-[#0F172A]">{entry.client_name}</span>
                    <span className={'rounded-[7px] px-2 py-0.5 text-[10.5px] font-bold ' + meta.cls}>{meta.label}</span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-[#475569]">
                    {capitalize(dateLine(Temporal.PlainDate.from(entry.desired_date)))}
                    {entry.professionals?.name ? ` · con ${entry.professionals.name}` : ' · con cualquiera'}
                    {services ? ` · ${services}` : ''}
                  </div>
                  <div className="mt-0.5 font-mono text-[11.5px] text-[#94A3B8]">{entry.client_phone}</div>
                </div>

                {entry.status !== 'reservado' && entry.status !== 'descartado' && (
                  <div className="flex flex-wrap gap-2 @[760px]:flex-none">
                    <button
                      type="button"
                      onClick={() => notify(entry)}
                      className="min-h-9 flex-1 rounded-[9px] bg-[#0F172A] px-3 text-[12px] font-bold text-white @[760px]:flex-none"
                    >
                      {entry.status === 'avisado' ? 'Escribir de nuevo' : 'Avisar por WhatsApp'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus(entry, 'reservado')}
                      className="min-h-9 flex-1 rounded-[9px] border border-[#E2E5EC] px-3 text-[12px] font-semibold @[760px]:flex-none"
                    >
                      Reservó
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus(entry, 'descartado')}
                      className="min-h-9 min-w-9 rounded-[9px] border border-[#E2E5EC] text-[13px] text-[#A33421]"
                      aria-label={`Descartar a ${entry.client_name}`}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
