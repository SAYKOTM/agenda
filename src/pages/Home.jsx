import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

// Landing genérica de la plataforma (sin tenant). Cada salón vive en /:slug — esta página solo
// ayuda a llegar a uno mientras no exista un dominio propio por tenant.
export default function Home() {
  const [tenants, setTenants] = useState([]);

  useEffect(() => {
    supabase
      .from('tenants')
      .select('slug, name, tagline')
      .then(({ data }) => setTenants(data || []));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#F1F2F5] px-6 text-center">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Agenda SaaS</h1>
        <p className="mt-2 text-sm text-slate-500">Reserva de hora para salones y barberías.</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        {tenants.map((t) => (
          <Link
            key={t.slug}
            to={`/${t.slug}`}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:border-slate-300"
          >
            <div className="text-sm font-semibold text-slate-900">{t.name}</div>
            <div className="text-xs text-slate-500">{t.tagline}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
