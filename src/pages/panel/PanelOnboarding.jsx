import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const inputCls = 'min-h-12 w-full rounded-[11px] border border-[#D3D7E0] px-3.5 text-[15px] text-[#0F172A]';
const errorCls = 'text-[12px] font-medium text-[#C0402B]';

// Pantalla para una sesión ya autenticada (típicamente Google) sin `professionals` propio ni
// invitación pendiente que reclamar (ver usePanelSession -- claim_invited_professional ya se
// intentó antes de llegar acá). Sin campos de email/contraseña porque la sesión ya existe: solo
// falta crear el salón y enlazarlo, vía create_tenant_for_current_user (migración 0024).
export default function PanelOnboarding({ email, onCreated }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function onNameChange(value) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function onSlugChange(value) {
    setSlugTouched(true);
    setSlug(slugify(value));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('create_tenant_for_current_user', {
      p_name: name.trim(),
      p_slug: slug,
      p_owner_name: ownerName.trim(),
    });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message.includes('en uso') ? 'Ese link ya está en uso' : rpcError.message);
      return;
    }
    onCreated();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] px-4 py-10">
      <form onSubmit={onSubmit} className="flex w-full max-w-[420px] flex-col gap-4 rounded-[20px] border border-[#E2E5EC] bg-white p-7">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#4F46E5] text-base font-extrabold text-white">A</div>
          <h1 className="text-lg font-extrabold tracking-tight text-[#0F172A]">Un último paso</h1>
          <p className="text-[12.5px] text-[#64748B]">
            {email ? <>Conectado como {email} · c</> : 'C'}rea tu salón para empezar a usar el panel
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Nombre del local</span>
          <input required value={name} onChange={(e) => onNameChange(e.target.value)} className={inputCls} placeholder="Barbería Central" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Link público</span>
          <div className="flex min-h-12 items-center overflow-hidden rounded-[11px] border border-[#D3D7E0]">
            <span className="whitespace-nowrap bg-[#F1F2F5] px-3 text-[13px] text-[#64748B]">{window.location.host}/</span>
            <input
              required
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              className="min-h-12 min-w-0 flex-1 border-none px-2 font-mono text-[13.5px] text-[#0F172A]"
              placeholder="barberia-central"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Tu nombre</span>
          <input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} placeholder="Nombre y apellido" />
        </label>

        {error && <p className={errorCls}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-12 rounded-[13px] bg-[#0F172A] text-[14px] font-bold text-white disabled:opacity-50"
        >
          {submitting ? 'Creando tu salón…' : 'Crear mi salón'}
        </button>
      </form>
    </div>
  );
}
