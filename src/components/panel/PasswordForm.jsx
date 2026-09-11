import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../Toast';

const inputCls = 'min-h-12 w-full rounded-[11px] border border-[#D3D7E0] bg-white px-3.5 text-[15px] text-[#0F172A]';
const MIN_LENGTH = 8;

// Formulario de "elegir contraseña", compartido por la pantalla que aparece al llegar desde el
// correo de invitación y por la tarjeta de Perfil. Es el mismo `updateUser` en los dos casos: la
// persona ya tiene sesión, solo le está poniendo (o cambiando) la contraseña a su cuenta.
export default function PasswordForm({ ctaLabel = 'Guardar contraseña', onSaved }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`La contraseña tiene que tener al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== repeat) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setError('');
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message || 'No pudimos guardar la contraseña.');
      return;
    }
    setPassword('');
    setRepeat('');
    toast('Contraseña guardada');
    onSaved?.();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-bold text-[#475569]">Nueva contraseña</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          placeholder={`Al menos ${MIN_LENGTH} caracteres`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-bold text-[#475569]">Repetila</span>
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          className={inputCls}
        />
      </label>
      {error && <p className="text-[12.5px] font-medium text-[#C0402B]">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="min-h-12 rounded-[13px] bg-[#0F172A] text-[14px] font-bold text-white disabled:opacity-50"
      >
        {saving ? 'Guardando…' : ctaLabel}
      </button>
    </form>
  );
}
