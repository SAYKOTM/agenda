import { useState } from 'react';
import { inviteProfessional, ApiError } from '../../lib/api';
import { useToast } from '../Toast';
import ModalPortal from './ModalPortal';

const inputCls = 'min-h-11 w-full rounded-[10px] border border-[#D3D7E0] bg-white px-3 text-[15px] text-[#0F172A]';

export default function InviteProfessionalModal({ onClose, onInvited }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [role, setRole] = useState('professional');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !email.trim()) {
      toast('Nombre y email son requeridos');
      return;
    }
    setSaving(true);
    try {
      await inviteProfessional({ name, email, roleTitle, role });
      toast('Invitación enviada al nuevo profesional');
      onInvited();
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'No pudimos enviar la invitación');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onClose={onClose} z={75}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-full w-full flex-col gap-3 overflow-y-auto bg-white p-4.5 [animation:fadeUp_.2s_ease] min-[520px]:h-auto min-[520px]:max-h-[85dvh] min-[520px]:w-full min-[520px]:max-w-[440px] min-[520px]:rounded-[20px]"
        style={{ overscrollBehavior: 'contain', paddingBottom: 'calc(18px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold tracking-tight text-[#0F172A]">Invitar profesional</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E5EC] text-sm">✕</button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Especialidad</span>
          <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Permisos</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            <option value="professional">Profesional</option>
            <option value="admin">Administrador</option>
          </select>
        </label>

        <p className="text-[11.5px] text-[#64748B]">Le enviaremos un email para que active su cuenta y elija su contraseña.</p>

        <button type="button" onClick={save} disabled={saving} className="mt-1 min-h-12 rounded-[13px] bg-[#0F172A] text-[14px] font-bold text-white disabled:opacity-50">
          {saving ? 'Enviando…' : 'Enviar invitación'}
        </button>
      </div>
    </ModalPortal>
  );
}
