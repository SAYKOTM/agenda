import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePanelServices } from '../../features/panel/usePanelServices';
import { useToast } from '../../components/Toast';
import ServiceFormModal from '../../components/panel/ServiceFormModal';
import { money, durLabel } from '../../lib/format';

export default function PanelServices() {
  const { tenant } = useOutletContext();
  const toast = useToast();
  const { loading, error, categories, services, reload } = usePanelServices(tenant.id);
  const [editing, setEditing] = useState(undefined); // undefined = cerrado, null = nuevo, objeto = editar

  const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  async function remove(svc) {
    if (!confirm(`¿Eliminar "${svc.name}"?`)) return;
    const { error } = await supabase.from('services').delete().eq('id', svc.id);
    if (error) toast('No pudimos eliminar el servicio (puede tener reservas asociadas)');
    else {
      toast('Servicio eliminado');
      reload();
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Servicios</h1>
          <p className="mt-0.5 text-[12.5px] text-[#64748B]">{services.length} servicios · {categories.length} categorías</p>
        </div>
        <button type="button" onClick={() => setEditing(null)} disabled={!categories.length} className="min-h-9 rounded-[9px] bg-[#0F172A] px-3.5 text-[12.5px] font-bold text-white disabled:opacity-50">+ Nuevo servicio</button>
      </div>

      {error && <p className="text-sm text-[#C0402B]">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-[#64748B]">Cargando…</p>}

      {!loading && !error && services.length === 0 && (
        <div className="rounded-[16px] border border-[#E2E5EC] bg-white px-5 py-13 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#F1F2F5] text-lg">✂</div>
          <div className="text-base font-extrabold tracking-tight">Aún no tienes servicios</div>
          <p className="mx-auto mt-1.5 max-w-[380px] text-[12.5px] text-[#64748B]">Crea tu primer servicio con duración y precio para que tus clientes puedan reservar desde tu link público.</p>
        </div>
      )}

      {!loading && !error && services.length > 0 && (
        <div className="overflow-hidden rounded-[16px] border border-[#E2E5EC] bg-white">
          <div className="hidden grid-cols-[2.4fr_1fr_.8fr_.8fr_.8fr_.8fr_84px] gap-2.5 border-b border-[#E2E5EC] bg-[#FAFBFC] px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[#94A3B8] @[1024px]:grid">
            <span>Servicio</span><span>Categoría</span><span>Duración</span><span>Precio</span><span>Buffer</span><span>Seña</span><span />
          </div>
          <div className="flex flex-col gap-2.5 p-3 @[1024px]:gap-0 @[1024px]:p-0">
            {services.map((s) => (
              <div key={s.id} className="flex flex-col gap-2 rounded-[14px] border border-[#E2E5EC] p-3 @[1024px]:grid @[1024px]:grid-cols-[2.4fr_1fr_.8fr_.8fr_.8fr_.8fr_84px] @[1024px]:items-center @[1024px]:gap-2.5 @[1024px]:rounded-none @[1024px]:border-0 @[1024px]:border-b @[1024px]:border-[#F1F2F5] @[1024px]:p-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-bold @[1024px]:text-[13px] @[1024px]:font-semibold">{s.name}</span>
                    <span className={'rounded-[7px] px-2 py-0.5 text-[10.5px] font-bold ' + (s.active ? 'bg-[#E7F4EC] text-[#1E6B43]' : 'bg-[#F2F4F7] text-[#64748B]')}>{s.active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  {s.description && <div className="mt-0.5 truncate text-[11.5px] text-[#64748B]">{s.description}</div>}
                </div>
                <div className="text-xs text-[#475569] @[1024px]:text-[12px]">{catName[s.category_id]}</div>
                <div className="font-mono text-xs @[1024px]:text-[12px]">{durLabel(s.duration_min)}</div>
                <div className="font-mono text-xs font-medium @[1024px]:text-[12px]">{money(s.price_clp, tenant.currency)}</div>
                <div className="font-mono text-[11px] text-[#64748B] @[1024px]:text-[11.5px]">{s.buffer_before_min}/{s.buffer_after_min} min</div>
                <div className="text-xs text-[#475569] @[1024px]:text-[12px]">{s.deposit_required ? money(s.deposit_amount_clp, tenant.currency) : '—'}</div>
                <div className="flex gap-2 @[1024px]:justify-end">
                  <button type="button" onClick={() => setEditing(s)} className="min-h-9 flex-1 rounded-[9px] border border-[#E2E5EC] px-2.5 text-[12px] font-semibold @[1024px]:min-h-7.5 @[1024px]:flex-none">Editar</button>
                  <button type="button" onClick={() => remove(s)} className="min-h-9 min-w-9 rounded-[9px] border border-[#E2E5EC] text-[13px] text-[#A33421] @[1024px]:min-h-7.5 @[1024px]:w-7.5">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing !== undefined && (
        <ServiceFormModal
          tenantId={tenant.id}
          categories={categories}
          service={editing}
          onClose={() => setEditing(undefined)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
