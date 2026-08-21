import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../Toast';

const inputCls = 'min-h-11 w-full rounded-[10px] border border-[#D3D7E0] bg-white px-3 text-[15px] text-[#0F172A]';

export default function EditProfessionalModal({ professional, allServices, isSelf, onClose, onSaved }) {
  const toast = useToast();
  const [roleTitle, setRoleTitle] = useState(professional.role_title || '');
  const [role, setRole] = useState(professional.role);
  const [serviceIds, setServiceIds] = useState(new Set((professional.professional_services || []).map((r) => r.service_id)));
  const [saving, setSaving] = useState(false);

  function toggleService(id) {
    setServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const { error: profErr } = await supabase.from('professionals').update({ role_title: roleTitle, role }).eq('id', professional.id);
    if (profErr) {
      setSaving(false);
      toast('No pudimos guardar los permisos');
      return;
    }
    const { error: delErr } = await supabase.from('professional_services').delete().eq('professional_id', professional.id);
    if (!delErr && serviceIds.size) {
      await supabase.from('professional_services').insert([...serviceIds].map((service_id) => ({ professional_id: professional.id, service_id })));
    }
    setSaving(false);
    toast('Permisos actualizados');
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[rgba(15,23,42,.4)] p-0 @[520px]:p-5" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-h-full flex-col gap-3 overflow-y-auto bg-white p-4.5 [animation:fadeUp_.2s_ease] @[520px]:h-auto @[520px]:max-h-[85vh] @[520px]:w-[440px] @[520px]:rounded-[20px]"
        style={{ overscrollBehavior: 'contain', paddingBottom: 'calc(18px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold tracking-tight text-[#0F172A]">{professional.name}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E5EC] text-sm">✕</button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Especialidad</span>
          <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Permisos</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf} className={inputCls + ' disabled:opacity-50'}>
            <option value="professional">Profesional</option>
            <option value="admin">Administrador</option>
          </select>
          {isSelf && <span className="text-[11px] text-[#64748B]">No puedes cambiar tus propios permisos.</span>}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Servicios habilitados</span>
          <div className="flex flex-col gap-1 rounded-[11px] border border-[#E2E5EC] p-2">
            {allServices.map((s) => (
              <label key={s.id} className="flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[13px] hover:bg-[#F7F8FA]">
                <input type="checkbox" checked={serviceIds.has(s.id)} onChange={() => toggleService(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>

        <button type="button" onClick={save} disabled={saving} className="mt-1 min-h-12 rounded-[13px] bg-[#0F172A] text-[14px] font-bold text-white disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar permisos'}
        </button>
      </div>
    </div>
  );
}
