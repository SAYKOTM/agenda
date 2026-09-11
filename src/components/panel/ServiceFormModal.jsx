import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../Toast';
import ModalPortal from './ModalPortal';
import { SERVICE_COLORS, serviceColorName, nextServiceColor } from '../../lib/serviceColors';

const inputCls = 'min-h-11 w-full rounded-[10px] border border-[#D3D7E0] bg-white px-3 text-[15px] text-[#0F172A]';

const emptyDraft = (tenantId, categoryId, usedColors) => ({
  tenant_id: tenantId, category_id: categoryId, name: '', description: '',
  duration_min: 30, price_clp: 12000, buffer_before_min: 0, buffer_after_min: 10,
  deposit_required: false, deposit_amount_clp: null, active: true, color: nextServiceColor(usedColors),
});

export default function ServiceFormModal({ tenantId, professionalId, categories, service, usedColors = [], onClose, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState(service ? { ...service } : emptyDraft(tenantId, categories[0]?.id, usedColors));
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function save() {
    if (!draft.name.trim()) {
      toast('Ponle un nombre al servicio');
      return;
    }
    setSaving(true);
    const payload = {
      tenant_id: tenantId, professional_id: professionalId, category_id: draft.category_id, name: draft.name.trim(), description: draft.description || null,
      duration_min: Number(draft.duration_min) || 1, price_clp: Number(draft.price_clp) || 0,
      buffer_before_min: Number(draft.buffer_before_min) || 0, buffer_after_min: Number(draft.buffer_after_min) || 0,
      deposit_required: !!draft.deposit_required, deposit_amount_clp: draft.deposit_required ? Number(draft.deposit_amount_clp) || 0 : null,
      active: !!draft.active, color: draft.color || SERVICE_COLORS[0].hex,
    };
    const { error } = service
      ? await supabase.from('services').update(payload).eq('id', service.id)
      : await supabase.from('services').insert(payload);
    setSaving(false);
    if (error) {
      toast('No pudimos guardar el servicio');
      return;
    }
    toast(service ? 'Servicio actualizado' : 'Servicio creado');
    onSaved();
    onClose();
  }

  return (
    <ModalPortal onClose={onClose} z={75}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-full w-full flex-col gap-3 overflow-y-auto bg-white p-4.5 [animation:fadeUp_.2s_ease] min-[520px]:h-auto min-[520px]:max-h-[90dvh] min-[520px]:w-full min-[520px]:max-w-[520px] min-[520px]:rounded-[20px]"
        style={{ overscrollBehavior: 'contain', paddingBottom: 'calc(18px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold tracking-tight text-[#0F172A]">{service ? 'Editar servicio' : 'Nuevo servicio'}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E5EC] text-sm">✕</button>
        </div>

        <Field label="Nombre"><input value={draft.name} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
        <Field label="Descripción"><input value={draft.description || ''} onChange={(e) => set('description', e.target.value)} className={inputCls} /></Field>
        <Field label="Categoría">
          <select value={draft.category_id || ''} onChange={(e) => set('category_id', e.target.value)} className={inputCls}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Duración (min)"><input type="number" min={5} value={draft.duration_min} onChange={(e) => set('duration_min', e.target.value)} className={inputCls} /></Field>
          <Field label="Precio (CLP)"><input type="number" min={0} value={draft.price_clp} onChange={(e) => set('price_clp', e.target.value)} className={inputCls} /></Field>
          <Field label="Buffer antes (min)"><input type="number" min={0} value={draft.buffer_before_min} onChange={(e) => set('buffer_before_min', e.target.value)} className={inputCls} /></Field>
          <Field label="Buffer después (min)"><input type="number" min={0} value={draft.buffer_after_min} onChange={(e) => set('buffer_after_min', e.target.value)} className={inputCls} /></Field>
        </div>

        {/* Un div, no <Field>: adentro hay un <label> propio (el selector "Otro") y anidar
            labels es HTML inválido. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Color en la agenda · {serviceColorName(draft.color)}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {SERVICE_COLORS.map((c) => {
              const taken = usedColors.some((u) => String(u).toLowerCase() === c.hex.toLowerCase()) && draft.color !== c.hex;
              return (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => set('color', c.hex)}
                  title={taken ? `${c.name} · ya lo usa otro servicio tuyo` : c.name}
                  aria-label={`Usar color ${c.name}`}
                  aria-pressed={draft.color === c.hex}
                  className={
                    'relative flex h-10 w-10 flex-none items-center justify-center rounded-full border-2 text-[13px] font-bold text-white ' +
                    (draft.color === c.hex ? 'border-[#0F172A]' : 'border-transparent')
                  }
                  style={{ background: c.hex }}
                >
                  {draft.color === c.hex ? '✓' : taken ? <span className="h-1.5 w-1.5 rounded-full bg-white/85" /> : ''}
                </button>
              );
            })}
            <label className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[10px] border border-[#D3D7E0] px-2 text-[11.5px] font-semibold text-[#475569]">
              Otro
              <input
                type="color"
                value={draft.color || SERVICE_COLORS[0].hex}
                onChange={(e) => set('color', e.target.value)}
                className="h-7 w-8 cursor-pointer rounded-[6px] border-0 bg-white p-0"
                aria-label="Color personalizado"
              />
            </label>
          </div>
          <span className="text-[11px] text-[#94A3B8]">El punto blanco marca los colores que ya usás en otro servicio.</span>
        </div>

        <div className="flex items-center justify-between rounded-[11px] border border-[#E2E5EC] px-3 py-2.5">
          <span className="text-[13px] font-semibold">Requiere seña</span>
          <Switch on={!!draft.deposit_required} onToggle={() => set('deposit_required', !draft.deposit_required)} />
        </div>
        {draft.deposit_required && (
          <Field label="Monto de la seña (CLP)"><input type="number" min={0} value={draft.deposit_amount_clp || 0} onChange={(e) => set('deposit_amount_clp', e.target.value)} className={inputCls} /></Field>
        )}
        <div className="flex items-center justify-between rounded-[11px] border border-[#E2E5EC] px-3 py-2.5">
          <span className="text-[13px] font-semibold">Activo</span>
          <Switch on={!!draft.active} onToggle={() => set('active', !draft.active)} />
        </div>

        <button type="button" onClick={save} disabled={saving} className="mt-1 min-h-12 rounded-[13px] bg-[#0F172A] text-[14px] font-bold text-white disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar servicio'}
        </button>
      </div>
    </ModalPortal>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-bold text-[#475569]">{label}</span>
      {children}
    </label>
  );
}

function Switch({ on, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} className={'relative h-6 w-10 flex-none rounded-full ' + (on ? 'bg-[#0F172A]' : 'bg-[#D3D7E0]')}>
      <span className={'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ' + (on ? 'left-[19px]' : 'left-0.5')} />
    </button>
  );
}
