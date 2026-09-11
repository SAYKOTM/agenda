import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../Toast';
import ModalPortal from './ModalPortal';

const inputCls = 'min-h-11 w-full rounded-[10px] border border-[#D3D7E0] bg-white px-3 text-[15px] text-[#0F172A]';

export default function EditProfessionalModal({ professional, isSelf, onClose, onSaved }) {
  const toast = useToast();
  const [roleTitle, setRoleTitle] = useState(professional.role_title || '');
  const [role, setRole] = useState(professional.role);
  const [commissionPct, setCommissionPct] = useState(professional.commission_pct ?? 0);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error: profErr } = await supabase
      .from('professionals')
      .update({ role_title: roleTitle, role, commission_pct: Number(commissionPct) || 0 })
      .eq('id', professional.id);
    setSaving(false);
    if (profErr) {
      toast('No pudimos guardar los permisos');
      return;
    }
    toast('Permisos actualizados');
    onSaved();
    onClose();
  }

  return (
    <ModalPortal onClose={onClose} z={75}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-full w-full flex-col gap-3 overflow-y-auto bg-white p-4.5 [animation:fadeUp_.2s_ease] min-[520px]:h-auto min-[520px]:max-h-[85dvh] min-[520px]:w-full min-[520px]:max-w-[440px] min-[520px]:rounded-[20px]"
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
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Comisión (%)</span>
          <input type="number" min={0} max={100} step={0.5} value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} className={inputCls} />
          <span className="text-[11px] text-[#64748B]">% de sus ingresos que se le paga como comisión. Se usa en el Resumen financiero.</span>
        </label>

        <p className="text-[11.5px] text-[#64748B]">Cada profesional gestiona su propio catálogo de servicios desde "Mis servicios" en su panel.</p>

        <button type="button" onClick={save} disabled={saving} className="mt-1 min-h-12 rounded-[13px] bg-[#0F172A] text-[14px] font-bold text-white disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar permisos'}
        </button>
      </div>
    </ModalPortal>
  );
}
