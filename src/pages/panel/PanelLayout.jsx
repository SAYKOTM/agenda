import { useCallback, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { usePanelSession } from '../../features/panel/usePanelSession';
import { hasActiveAccess } from '../../lib/subscription';
import { createCheckoutSession } from '../../lib/api';
import { useToast } from '../../components/Toast';
import PanelOnboarding from './PanelOnboarding';
import OfflineBanner from '../../components/panel/OfflineBanner';
import { usePushMessages, playChime } from '../../features/pwa/usePushMessages';

// Todo profesional ve su propio panel (Hoy/Agenda/Servicios/Disponibilidad/Perfil, fase 3).
// Un 'admin' además ve el nivel del salón completo (Resumen/Equipo/Estaciones/Pagos/Ajustes,
// fase 4): en este esquema un admin sigue siendo también un profesional que atiende, no un rol
// separado sin agenda propia.
const PRO_NAV = [
  { to: '/panel', label: 'Hoy', end: true, icon: '☀' },
  { to: '/panel/agenda', label: 'Agenda', icon: '▦' },
  { to: '/panel/servicios', label: 'Mis servicios', icon: '✂' },
  { to: '/panel/clientes', label: 'Clientes', icon: '◐' },
  { to: '/panel/disponibilidad', label: 'Disponibilidad', icon: '◔' },
  { to: '/panel/perfil', label: 'Perfil', icon: '◑' },
];
const ADMIN_NAV = [
  { to: '/panel/resumen', label: 'Resumen', icon: '◈' },
  { to: '/panel/equipo', label: 'Equipo', icon: '◕' },
  { to: '/panel/estaciones', label: 'Estaciones', icon: '▤' },
  { to: '/panel/pagos', label: 'Pagos', icon: '$' },
  { to: '/panel/privacidad', label: 'Privacidad', icon: '⚑' },
  { to: '/panel/ajustes', label: 'Ajustes', icon: '⚙' },
];

export default function PanelLayout() {
  const location = useLocation();
  const toast = useToast();
  const { loading, session, professional, tenant, error, needsOnboarding, offline, signOut, refresh } = usePanelSession();
  const [startingCheckout, setStartingCheckout] = useState(false);

  // Aviso llegado mientras el panel está abierto y a la vista: el service worker no muestra la
  // notificación del sistema en ese caso y manda el dato acá (ver public/sw.js). Va antes de
  // cualquier return temprano porque es un hook.
  usePushMessages(
    useCallback(
      (payload) => {
        toast(payload.body || payload.title || 'Novedad en tu agenda');
        playChime();
      },
      [toast]
    )
  );

  async function startCheckout() {
    setStartingCheckout(true);
    try {
      const { url } = await createCheckoutSession();
      window.location.href = url;
    } catch (e) {
      toast(e.message || 'No pudimos iniciar el pago');
      setStartingCheckout(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] text-sm text-[#64748B]" role="status" aria-live="polite">
        Cargando…
      </div>
    );
  }
  if (!session) return <Navigate to="/panel/login" state={{ from: location.pathname }} replace />;
  if (needsOnboarding) return <PanelOnboarding email={session.user.email} onCreated={refresh} />;
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

  // Objetivo 4 (regla de acceso): 'trialing' cuenta solo mientras trial_ends_at no venció,
  // 'active' y 'past_due' (período de gracia tras un cobro fallido) pasan; 'canceled' y 'unpaid'
  // quedan afuera. Esto bloquea SOLO el panel -- la página pública de reservas del tenant sigue
  // funcionando igual (tenants_public_read en RLS no depende de la suscripción a propósito).
  if (!hasActiveAccess(tenant)) {
    const isAdmin = professional.role === 'admin';
    const reason =
      tenant.subscription_status === 'canceled'
        ? 'Tu suscripción fue cancelada.'
        : tenant.subscription_status === 'unpaid'
          ? 'No pudimos procesar el pago y se agotó el período de gracia.'
          : 'Tu período de prueba de 7 días terminó.';
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F1F2F5] px-6 text-center">
        <p className="text-base font-bold text-[#0F172A]">Suscripción inactiva</p>
        <p className="max-w-sm text-sm text-[#64748B]">
          {reason} {isAdmin ? 'Agrega un método de pago para recuperar el acceso.' : 'Pídele al administrador del salón que reactive la suscripción.'}
        </p>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={startCheckout}
              disabled={startingCheckout}
              className="rounded-[11px] bg-[#0F172A] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {startingCheckout ? 'Abriendo pago…' : 'Agregar método de pago'}
            </button>
          )}
          <button type="button" onClick={signOut} className="rounded-[11px] border border-[#E2E5EC] bg-white px-4 py-2 text-[13px] font-semibold">
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const navItems = professional.role === 'admin' ? [...PRO_NAV, ...ADMIN_NAV] : PRO_NAV;

  return (
    <>
      <div className="@container min-h-screen bg-[#F1F2F5]">
        <div className="flex min-h-screen flex-col md:flex-row">
          {/* Escritorio (el computador del mesón): barra lateral completa. */}
          <aside className="sticky top-0 hidden h-screen w-[222px] flex-none flex-col gap-4 bg-[#0F172A] px-3 py-4 text-[#F7F8FA] md:flex">
            <div className="flex flex-none items-center gap-2.5 px-0.5">
              <div className="flex h-7.5 w-7.5 flex-none items-center justify-center rounded-[9px] bg-[#4F46E5] text-[13px] font-extrabold text-white">
                {tenant.mark}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold tracking-tight">{tenant.name}</div>
                <div className="truncate font-mono text-[9.5px] text-[#8493A8]">/{tenant.slug}</div>
              </div>
            </div>

            <nav className="flex min-w-0 flex-1 flex-col gap-0.5">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    'flex w-full items-center gap-2 whitespace-nowrap rounded-[10px] px-2.5 py-2 text-[12.5px] font-semibold ' +
                    (isActive ? 'bg-[#1E293B] text-white' : 'text-[#94A3B8]')
                  }
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto flex items-center gap-2.5 rounded-xl bg-[#1E293B] p-2.5">
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

          {/* Móvil (el celular en el sillón): cabecera mínima arriba, navegación abajo al alcance
              del pulgar. El padding superior respeta la franja de estado, que en la app instalada
              queda encima del contenido por apple-mobile-web-app-status-bar-style. */}
          <header
            className="sticky top-0 z-20 flex flex-none items-center gap-2.5 bg-[#0F172A] px-3.5 pb-2 text-[#F7F8FA] md:hidden"
            style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
          >
            <div className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#4F46E5] text-[12px] font-extrabold text-white">
              {tenant.mark}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold tracking-tight">{tenant.name}</div>
              <div className="truncate text-[10px] text-[#94A3B8]">{professional.name}</div>
            </div>
            <button
              type="button"
              onClick={signOut}
              aria-label="Cerrar sesión"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[15px] text-[#94A3B8]"
            >
              ⏻
            </button>
          </header>

          <div className="flex min-w-0 flex-1 flex-col">
            <OfflineBanner forced={offline} />
            <main className="min-w-0 flex-1 px-3.5 py-3 md:px-5.5 md:py-4.5">
              <div className="mx-auto w-full max-w-[1440px]">
                <Outlet context={{ professional, tenant, signOut, refresh }} />
              </div>
              {/* Espacio para que la última tarjeta no quede tapada por la barra inferior. */}
              <div className="md:hidden" style={{ height: 'calc(5.75rem + env(safe-area-inset-bottom))' }} aria-hidden="true" />
            </main>
          </div>
        </div>
      </div>

      {/* Fuera del contenedor @container a propósito: container-type crea un bloque contenedor y
          un `fixed` adentro se anclaría al alto de la página en vez de al del viewport, con lo
          que la barra se iría con el scroll. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-[#1E293B] bg-[#0F172A] px-2 pt-2 md:hidden"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))', scrollbarWidth: 'none' }}
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              'flex min-h-14 min-w-18 flex-none flex-col items-center justify-center gap-1 rounded-[13px] px-2.5 py-1.5 text-[11.5px] font-semibold ' +
              (isActive ? 'bg-[#1E293B] text-white' : 'text-[#94A3B8]')
            }
          >
            <span aria-hidden="true" className="text-[20px] leading-none">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
