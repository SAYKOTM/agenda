import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { signupTenant, ApiError } from '../lib/api';

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

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
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
    setFieldErrors({});
    try {
      await signupTenant({ name: name.trim(), slug, ownerName: ownerName.trim(), email: email.trim(), password });
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError('Tu salón fue creado, pero no pudimos iniciar sesión automáticamente. Intenta ingresar desde /panel/login.');
        setSubmitting(false);
        return;
      }
      navigate('/panel', { replace: true });
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.fields) {
        setFieldErrors(err.fields);
        setError(err.message);
      } else {
        setError(err.message || 'No pudimos crear tu salón, intenta de nuevo.');
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] px-4 py-10">
      <form onSubmit={onSubmit} className="flex w-full max-w-[420px] flex-col gap-4 rounded-[20px] border border-[#E2E5EC] bg-white p-7">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#4F46E5] text-base font-extrabold text-white">A</div>
          <h1 className="text-lg font-extrabold tracking-tight text-[#0F172A]">Crea tu salón en Agenda SaaS</h1>
          <p className="text-[12.5px] text-[#64748B]">7 días de prueba gratis, sin tarjeta</p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Nombre del local</span>
          <input required value={name} onChange={(e) => onNameChange(e.target.value)} className={inputCls} placeholder="Barbería Central" />
          {fieldErrors.name && <span className={errorCls}>{fieldErrors.name}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Link público</span>
          <div className="flex min-h-12 items-center overflow-hidden rounded-[11px] border border-[#D3D7E0]">
            <span className="whitespace-nowrap bg-[#F1F2F5] px-3 text-[13px] text-[#64748B]">agenda.app/</span>
            <input
              required
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              className="min-h-12 min-w-0 flex-1 border-none px-2 font-mono text-[13.5px] text-[#0F172A]"
              placeholder="barberia-central"
            />
          </div>
          {fieldErrors.slug && <span className={errorCls}>{fieldErrors.slug}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Tu nombre</span>
          <input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} placeholder="Nombre y apellido" />
          {fieldErrors.ownerName && <span className={errorCls}>{fieldErrors.ownerName}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Email</span>
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          {fieldErrors.email && <span className={errorCls}>{fieldErrors.email}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Contraseña</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
          {fieldErrors.password && <span className={errorCls}>{fieldErrors.password}</span>}
        </label>

        <label className="flex items-start gap-2.5 text-[12.5px] text-[#475569]">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none accent-[#4F46E5]"
          />
          <span>
            Acepto la{' '}
            <Link to="/privacidad" target="_blank" className="font-semibold text-[#4F46E5]">
              política de privacidad
            </Link>{' '}
            y el tratamiento de mis datos para crear y operar mi cuenta.
          </span>
        </label>

        {error && <p className={errorCls}>{error}</p>}

        <button
          type="submit"
          disabled={submitting || !consent}
          className="min-h-12 rounded-[13px] bg-[#0F172A] text-[14px] font-bold text-white disabled:opacity-50"
        >
          {submitting ? 'Creando tu salón…' : 'Crear mi salón'}
        </button>

        <p className="text-center text-[12.5px] text-[#64748B]">
          ¿Ya tienes cuenta?{' '}
          <Link to="/panel/login" className="font-semibold text-[#4F46E5]">
            Ingresa aquí
          </Link>
        </p>
      </form>
    </div>
  );
}
