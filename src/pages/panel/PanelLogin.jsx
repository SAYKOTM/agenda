import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
      </form>
    </div>
  );
}
