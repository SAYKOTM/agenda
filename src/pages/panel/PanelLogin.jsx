import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

export default function PanelLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) {
      setError('Email o contraseña incorrectos.');
      return;
    }
    navigate(location.state?.from || '/panel', { replace: true });
  }

  async function onGoogleLogin() {
    setError('');
    // El destino final (aceptar la sesión, enlazar una invitación pendiente o pedir crear un
    // salón nuevo) lo resuelve PanelLayout/usePanelSession al volver a /panel -- acá solo se
    // dispara el redirect a Google.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/panel` },
    });
    if (error) setError('No pudimos iniciar el login con Google.');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] px-4">
      <form onSubmit={onSubmit} className="flex w-full max-w-[380px] flex-col gap-4 rounded-[20px] border border-[#E2E5EC] bg-white p-7">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#4F46E5] text-base font-extrabold text-white">A</div>
          <h1 className="text-lg font-extrabold tracking-tight text-[#0F172A]">Panel de Agenda SaaS</h1>
          <p className="text-[12.5px] text-[#64748B]">Ingresa con la cuenta de tu salón</p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-12 w-full rounded-[11px] border border-[#D3D7E0] px-3.5 text-[15px] text-[#0F172A]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Contraseña</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-12 w-full rounded-[11px] border border-[#D3D7E0] px-3.5 text-[15px] text-[#0F172A]"
          />
        </label>

        {error && <p className="text-[12.5px] font-medium text-[#C0402B]">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-12 rounded-[13px] bg-[#0F172A] text-[14px] font-bold text-white disabled:opacity-50"
        >
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>

        <div className="flex items-center gap-2.5 text-[11px] font-semibold text-[#94A3B8]">
          <span className="h-px flex-1 bg-[#E2E5EC]" />o<span className="h-px flex-1 bg-[#E2E5EC]" />
        </div>

        <button
          type="button"
          onClick={onGoogleLogin}
          className="flex min-h-12 items-center justify-center gap-2.5 rounded-[13px] border border-[#D3D7E0] bg-white text-[14px] font-bold text-[#0F172A]"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z" />
            <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 013.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
          </svg>
          Continuar con Google
        </button>

        <p className="text-center text-[12.5px] text-[#64748B]">
          ¿Aún no tienes un salón?{' '}
          <Link to="/registro" className="font-semibold text-[#4F46E5]">
            Regístrate aquí
          </Link>
        </p>
      </form>
    </div>
  );
}
