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
  });
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState(tenant.slug);
  const [slugSaving, setSlugSaving] = useState(false);

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
