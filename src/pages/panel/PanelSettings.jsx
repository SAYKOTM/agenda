import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../components/Toast';

const inputCls = 'min-h-11 w-full rounded-[10px] border border-[#D3D7E0] bg-white px-3 text-[14px] text-[#0F172A]';

export default function PanelSettings() {
  const { tenant, refresh } = useOutletContext();
  const toast = useToast();
  const [draft, setDraft] = useState({
    name: tenant.name || '', address: tenant.address || '', phone: tenant.phone || '',
    instagram: tenant.instagram || '', hours_label: tenant.hours_label || '',
    cancellation_policy_text: tenant.cancellation_policy_text || '',
  });
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState(tenant.slug);
  const [slugSaving, setSlugSaving] = useState(false);
  const [loyalty, setLoyalty] = useState({
    enable_loyalty_discounts: !!tenant.enable_loyalty_discounts,
    loyalty_gold_discount_pct: tenant.loyalty_gold_discount_pct ?? 10,
    loyalty_diamond_discount_pct: tenant.loyalty_diamond_discount_pct ?? 15,
  });
  const [loyaltySaving, setLoyaltySaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('tenants').update(draft).eq('id', tenant.id);
    setSaving(false);
    if (error) toast('No pudimos guardar los cambios');
    else {
      toast('Cambios guardados');
      refresh();
    }
  }

  async function saveLoyalty(next) {
    setLoyaltySaving(true);
    const { error } = await supabase.from('tenants').update(next).eq('id', tenant.id);
    setLoyaltySaving(false);
    if (error) {
      toast('No pudimos guardar la configuración de fidelidad');
      return;
    }
    setLoyalty(next);
    refresh();
  }

  async function saveSlug() {
    if (slug === tenant.slug) return;
    setSlugSaving(true);
    const { error } = await supabase.rpc('update_tenant_slug', { p_new_slug: slug.trim().toLowerCase() });
    setSlugSaving(false);
    if (error) {
      toast(error.message.includes('en uso') ? 'Ese link ya está en uso' : 'No pudimos cambiar el link público');
      return;
    }
    toast('Link público actualizado · el anterior seguirá redirigiendo');
    refresh();
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Ajustes del salón</h1>
        <p className="mt-0.5 text-[12.5px] text-[#64748B]">Identidad, dirección y link público</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 @[900px]:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[16px] border border-[#E2E5EC] bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-13 w-13 flex-none items-center justify-center rounded-[15px] bg-[#4F46E5] text-[19px] font-extrabold text-white">{tenant.mark}</div>
            <span className="text-[12.5px] text-[#64748B]">La subida de logo real llega con el resto de assets (fase de medios/CDN).</span>
          </div>

          <Field label="Nombre del salón"><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className={inputCls} /></Field>
          <Field label="Dirección"><input value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} className={inputCls} /></Field>
          <Field label="Teléfono"><input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} className={inputCls} /></Field>
          <Field label="Instagram"><input value={draft.instagram} onChange={(e) => setDraft((d) => ({ ...d, instagram: e.target.value }))} className={inputCls} /></Field>
          <Field label="Horario (texto para la vista pública)"><input value={draft.hours_label} onChange={(e) => setDraft((d) => ({ ...d, hours_label: e.target.value }))} className={inputCls} /></Field>
          <Field label="Política de reserva (se muestra al cliente al pagar)">
            <textarea
              rows={2}
              value={draft.cancellation_policy_text}
              onChange={(e) => setDraft((d) => ({ ...d, cancellation_policy_text: e.target.value }))}
              className="w-full resize-y rounded-[10px] border border-[#D3D7E0] bg-white px-3 py-2.5 text-[14px] text-[#0F172A]"
            />
          </Field>

          <button type="button" onClick={save} disabled={saving} className="min-h-11 rounded-[12px] bg-[#0F172A] text-[13.5px] font-bold text-white disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>

          <div className="mt-1 border-t border-[#F1F2F5] pt-3">
            <span className="text-[11.5px] font-bold text-[#475569]">Link público (slug)</span>
            <div className="mt-1.5 flex items-center overflow-hidden rounded-[10px] border border-[#D3D7E0] bg-white">
              <span className="flex min-h-10 items-center bg-[#F7F8FA] px-2.5 font-mono text-[12px] text-[#94A3B8]">agenda.app/</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} className="min-h-10 min-w-0 flex-1 border-none px-2.5 font-mono text-[12.5px] text-[#0F172A]" />
            </div>
            <p className="mt-1.5 text-[11.5px] text-[#64748B]">Los clientes reservan en agenda.app/{tenant.slug}. Si lo cambias, el link anterior sigue redirigiendo.</p>
            <button type="button" onClick={saveSlug} disabled={slugSaving || slug === tenant.slug} className="mt-2 min-h-9 rounded-[9px] border border-[#E2E5EC] px-3 text-[12.5px] font-semibold disabled:opacity-50">
              {slugSaving ? 'Guardando…' : 'Actualizar link'}
            </button>
          </div>
        </div>

        <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-4">
          <div className="mb-2.5 text-[13.5px] font-bold">Horario general del local</div>
          <p className="text-[12px] text-[#64748B]">Este es solo el texto que ve el cliente en la landing pública. El horario real que usa el motor de reservas se edita por profesional en <strong>Disponibilidad</strong>.</p>
        </div>
      </div>

      <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-4">
        <div className="mb-1 flex items-center justify-between">
          <div>
            <div className="text-[13.5px] font-bold">Fidelización</div>
            <p className="mt-0.5 max-w-[520px] text-[12px] text-[#64748B]">
              Las medallas (Bronce/Plata/Oro/Diamante) siempre se muestran. Si activas esto, además se aplica un descuento
              automático al agendar para clientes Oro y Diamante.
            </p>
          </div>
          <Switch on={loyalty.enable_loyalty_discounts} onToggle={() => saveLoyalty({ ...loyalty, enable_loyalty_discounts: !loyalty.enable_loyalty_discounts })} disabled={loyaltySaving} />
        </div>
        {loyalty.enable_loyalty_discounts && (
          <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-[#F1F2F5] pt-3 @[500px]:grid-cols-2">
            <Field label="Descuento medalla Oro (%)">
              <input
                type="number" min={0} max={100}
                value={loyalty.loyalty_gold_discount_pct}
                onChange={(e) => setLoyalty((d) => ({ ...d, loyalty_gold_discount_pct: e.target.value }))}
                onBlur={() => saveLoyalty({ ...loyalty, loyalty_gold_discount_pct: Number(loyalty.loyalty_gold_discount_pct) || 0 })}
                className={inputCls}
              />
            </Field>
            <Field label="Descuento medalla Diamante (%)">
              <input
                type="number" min={0} max={100}
                value={loyalty.loyalty_diamond_discount_pct}
                onChange={(e) => setLoyalty((d) => ({ ...d, loyalty_diamond_discount_pct: e.target.value }))}
                onBlur={() => saveLoyalty({ ...loyalty, loyalty_diamond_discount_pct: Number(loyalty.loyalty_diamond_discount_pct) || 0 })}
                className={inputCls}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

function Switch({ on, onToggle, disabled }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      className={'relative h-6 w-10 flex-none rounded-full disabled:opacity-50 ' + (on ? 'bg-[#0F172A]' : 'bg-[#D3D7E0]')}
    >
      <span className={'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ' + (on ? 'left-[19px]' : 'left-0.5')} />
    </button>
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
