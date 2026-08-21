import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../Toast';

const inputCls = 'min-h-11 w-full rounded-[10px] border border-[#D3D7E0] bg-white px-3 text-[15px] text-[#0F172A]';

const emptyDraft = (tenantId, categoryId) => ({
  tenant_id: tenantId, category_id: categoryId, name: '', description: '',
  duration_min: 30, price_clp: 12000, buffer_before_min: 0, buffer_after_min: 10,
  deposit_required: false, deposit_amount_clp: null, active: true, color: COLOR_PRESETS[0],
});

const COLOR_PRESETS = ['#4F46E5', '#2C8B58', '#E0891B', '#C0402B', '#7C3AED', '#0891B2', '#DB2777', '#64748B'];

export default function ServiceFormModal({ tenantId, categories, service, onClose, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState(service ? { ...service } : emptyDraft(tenantId, categories[0]?.id));
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
      tenant_id: tenantId, category_id: draft.category_id, name: draft.name.trim(), description: draft.description || null,
      duration_min: Number(draft.duration_min) || 1, price_clp: Number(draft.price_clp) || 0,
      buffer_before_min: Number(draft.buffer_before_min) || 0, buffer_after_min: Number(draft.buffer_after_min) || 0,
      deposit_required: !!draft.deposit_required, deposit_amount_clp: draft.deposit_required ? Number(draft.deposit_amount_clp) || 0 : null,
      active: !!draft.active, color: draft.color || COLOR_PRESETS[0],
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
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[rgba(15,23,42,.4)] p-0 @[640px]:p-5" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-h-full flex-col gap-3 overflow-y-auto bg-white p-4.5 [animation:fadeUp_.2s_ease] @[640px]:h-auto @[640px]:w-[520px] @[640px]:rounded-[20px]"
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

        <Field label="Color en la agenda">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={draft.color || COLOR_PRESETS[0]}
              onChange={(e) => set('color', e.target.value)}
              className="h-9 w-11 flex-none cursor-pointer rounded-[8px] border border-[#D3D7E0] bg-white p-1"
              aria-label="Color personalizado"
            />
            <div className="flex flex-1 flex-wrap gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('color', c)}
                  aria-label={`Usar color ${c}`}
                  aria-pressed={draft.color === c}
                  className={'h-7 w-7 flex-none rounded-full border-2 ' + (draft.color === c ? 'border-[#0F172A]' : 'border-transparent')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </Field>

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
    </div>
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
