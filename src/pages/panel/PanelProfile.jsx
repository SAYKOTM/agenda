import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../components/Toast';

const inputCls = 'min-h-11 w-full rounded-[10px] border border-[#D3D7E0] bg-white px-3 text-[15px] text-[#0F172A]';

export default function PanelProfile() {
  const { professional, refresh } = useOutletContext();
  const toast = useToast();
  const [draft, setDraft] = useState({
    name: professional.name || '', role_title: professional.role_title || '',
    instagram: professional.instagram || '', whatsapp: professional.whatsapp || '', bio: professional.bio || '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('professionals').update(draft).eq('id', professional.id);
    setSaving(false);
    if (error) toast('No pudimos guardar tu perfil');
    else {
      toast('Perfil guardado');
      refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Mi perfil</h1>
        <p className="mt-0.5 text-[12.5px] text-[#64748B]">Lo que ven tus clientes en el link público</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 @[900px]:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[16px] border border-[#E2E5EC] bg-white p-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-16.5 w-16.5 flex-none items-center justify-center rounded-[18px] font-mono text-[9px] text-[#64748B]"
              style={{ backgroundImage: 'repeating-linear-gradient(115deg, rgba(100,116,139,.2) 0 2px, transparent 2px 10px)' }}
            >
              foto
            </div>
            <span className="text-[12.5px] text-[#64748B]">La subida de foto real llega con el resto de assets (fase de medios/CDN).</span>
          </div>
          <Field label="Nombre público"><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className={inputCls} /></Field>
          <Field label="Especialidad"><input value={draft.role_title} onChange={(e) => setDraft((d) => ({ ...d, role_title: e.target.value }))} className={inputCls} /></Field>
          <Field label="Instagram"><input value={draft.instagram} onChange={(e) => setDraft((d) => ({ ...d, instagram: e.target.value }))} className={inputCls} /></Field>
          <Field label="WhatsApp"><input value={draft.whatsapp} onChange={(e) => setDraft((d) => ({ ...d, whatsapp: e.target.value }))} className={inputCls} /></Field>
          <Field label="Bio">
            <textarea rows={3} value={draft.bio} onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))} className="w-full resize-y rounded-[10px] border border-[#D3D7E0] bg-white px-3 py-2.5 text-[14px] text-[#0F172A]" />
          </Field>
          <button type="button" onClick={save} disabled={saving} className="min-h-11 rounded-[12px] bg-[#0F172A] text-[13.5px] font-bold text-white disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </div>

        <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-4">
          <div className="mb-2.5 text-[13.5px] font-bold">Así te ven tus clientes</div>
          <div className="flex items-center gap-3 rounded-[14px] border border-[#E2E5EC] p-3.5">
            <div className="h-12 w-12 flex-none rounded-[14px]" style={{ backgroundImage: 'repeating-linear-gradient(115deg, rgba(100,116,139,.2) 0 2px, transparent 2px 10px)' }} />
            <div className="min-w-0">
              <div className="text-[14px] font-bold">{draft.name || 'Nombre público'}</div>
              <div className="text-xs text-[#64748B]">{draft.role_title || 'Especialidad'}</div>
            </div>
          </div>
          {draft.bio && <p className="mt-3 text-xs text-[#64748B]">{draft.bio}</p>}
          <div className="mt-3 flex items-center gap-2 border-t border-[#F1F2F5] pt-3 text-[13px]">
            {professional.rating_count > 0 ? (
              <>
                <span className="font-bold text-[#0F172A]">★ {professional.rating_avg}</span>
                <span className="text-[#64748B]">{professional.rating_count} reseña{professional.rating_count === 1 ? '' : 's'}</span>
              </>
            ) : (
              <span className="text-[#94A3B8]">Aún no tienes reseñas</span>
            )}
          </div>
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
