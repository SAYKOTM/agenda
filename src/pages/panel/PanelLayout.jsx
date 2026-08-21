import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { usePanelSession } from '../../features/panel/usePanelSession';

// Todo profesional ve su propio panel (Hoy/Agenda/Servicios/Disponibilidad/Perfil, fase 3).
// Un 'admin' además ve el nivel del salón completo (Resumen/Equipo/Estaciones/Pagos/Ajustes,
// fase 4): en este esquema un admin sigue siendo también un profesional que atiende, no un rol
// separado sin agenda propia.
const PRO_NAV = [
  { to: '/panel', label: 'Hoy', end: true, icon: '☀' },
  { to: '/panel/agenda', label: 'Agenda', icon: '▦' },
  { to: '/panel/servicios', label: 'Servicios', icon: '✂' },
  { to: '/panel/clientes', label: 'Clientes', icon: '◐' },
  { to: '/panel/disponibilidad', label: 'Disponibilidad', icon: '◔' },
  { to: '/panel/perfil', label: 'Perfil', icon: '◑' },
];
const ADMIN_NAV = [
  { to: '/panel/resumen', label: 'Resumen', icon: '◈' },
  { to: '/panel/equipo', label: 'Equipo', icon: '◕' },
  { to: '/panel/estaciones', label: 'Estaciones', icon: '▤' },
  { to: '/panel/pagos', label: 'Pagos', icon: '$' },
  { to: '/panel/ajustes', label: 'Ajustes', icon: '⚙' },
];

export default function PanelLayout() {
  const location = useLocation();
  const { loading, session, professional, tenant, error, signOut, refresh } = usePanelSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] text-sm text-[#64748B]" role="status" aria-live="polite">
        Cargando…
      </div>
    );
  }
  if (!session) return <Navigate to="/panel/login" state={{ from: location.pathname }} replace />;
  if (error || !professional) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F1F2F5] px-6 text-center">
        <p className="text-sm text-[#64748B]">Esta cuenta no tiene acceso a ningún panel activo.</p>
        <button type="button" onClick={signOut} className="rounded-[11px] border border-[#E2E5EC] bg-white px-4 py-2 text-[13px] font-semibold">
          Cerrar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="@container min-h-screen bg-[#F1F2F5]">
      <div className="flex min-h-screen flex-col @[768px]:flex-row">
        <aside className="sticky top-0 z-20 flex flex-none items-center gap-2.5 overflow-x-auto bg-[#0F172A] px-3 py-2 text-[#F7F8FA] @[768px]:h-screen @[768px]:w-[222px] @[768px]:flex-col @[768px]:items-stretch @[768px]:gap-4 @[768px]:overflow-visible @[768px]:px-3 @[768px]:py-4">
          <div className="flex flex-none items-center gap-2 px-0.5 @[768px]:gap-2.5">
            <div className="flex h-6.5 w-6.5 flex-none items-center justify-center rounded-lg bg-[#4F46E5] text-[11px] font-extrabold text-white @[768px]:h-7.5 @[768px]:w-7.5 @[768px]:rounded-[9px] @[768px]:text-[13px]">
              {tenant.mark}
            </div>
            <div className="hidden min-w-0 @[768px]:block">
              <div className="truncate text-[13px] font-bold tracking-tight">{tenant.name}</div>
              <div className="truncate font-mono text-[9.5px] text-[#8493A8]">/{tenant.slug}</div>
            </div>
          </div>

          <nav className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto @[768px]:flex-col @[768px]:gap-0.5 @[768px]:overflow-visible" style={{ scrollbarWidth: 'none' }}>
            {(professional.role === 'admin' ? [...PRO_NAV, ...ADMIN_NAV] : PRO_NAV).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  'flex flex-none items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold @[768px]:w-full @[768px]:rounded-[10px] @[768px]:px-2.5 @[768px]:py-2 ' +
                  (isActive ? 'bg-[#1E293B] text-white' : 'text-[#94A3B8]')
                }
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto hidden items-center gap-2.5 rounded-xl bg-[#1E293B] p-2.5 @[768px]:flex">
            <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#334155] text-[11px] font-bold">{professional.initials}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{professional.name}</div>
              <div className="text-[10px] text-[#94A3B8]">{professional.role === 'admin' ? 'Administrador' : 'Profesional'}</div>
            </div>
            <button type="button" onClick={signOut} aria-label="Cerrar sesión" className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-[13px] text-[#94A3B8] hover:text-white">
              ⏻
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-3.5 py-3 @[768px]:px-5.5 @[768px]:py-4.5">
          <div className="mx-auto w-full max-w-[1440px]">
            <Outlet context={{ professional, tenant, signOut, refresh }} />
          </div>
        </main>
      </div>
    </div>
  );
}
