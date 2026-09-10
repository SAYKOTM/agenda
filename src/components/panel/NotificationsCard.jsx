import { usePushNotifications } from '../../features/pwa/usePushNotifications';
import { useToast } from '../Toast';

// Alta/baja de los avisos push del profesional, por dispositivo. Vive en Perfil porque es una
// preferencia de la persona, no del salón.
export default function NotificationsCard() {
  const toast = useToast();
  const { supported, standalone, subscribed, busy, error, permission, needsInstallFirst, enable, disable } = usePushNotifications();

  async function toggle() {
    if (subscribed) {
      if (await disable()) toast('Avisos desactivados en este dispositivo');
      return;
    }
    if (await enable()) toast('Listo: te vamos a avisar cuando te agenden');
  }

  return (
    <section className="rounded-[14px] border border-[#E2E5EC] bg-white p-3.5">
      <h2 className="text-[13.5px] font-bold text-[#0F172A]">Avisos en este dispositivo</h2>
      <p className="mt-1 text-[12.5px] leading-snug text-[#64748B]">
        Te avisamos cuando te agendan, cancelan o reagendan una hora, aunque tengas la app cerrada.
        Se configura por dispositivo: podés tenerlo activo en el celular y no en el computador del mesón.
      </p>

      {/* En iPhone el push web solo existe con la app agregada a la pantalla de inicio: mostrar un
          botón que no puede funcionar sería peor que explicar el camino. */}
      {needsInstallFirst && !standalone ? (
        <p className="mt-2.5 rounded-[11px] bg-[#FFF7E6] px-3 py-2.5 text-[12.5px] leading-snug text-[#7A4E00]">
          En iPhone hay que instalar la app primero: tocá <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong> y volvé a entrar desde ese ícono. Recién ahí iOS permite activar los avisos.
        </p>
      ) : !supported ? (
        <p className="mt-2.5 text-[12.5px] text-[#64748B]">Este navegador no admite avisos push.</p>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={toggle}
            disabled={busy || permission === 'denied'}
            className={
              'min-h-11 rounded-[11px] px-4 text-[13px] font-semibold disabled:opacity-50 ' +
              (subscribed ? 'border border-[#D3D7E0] bg-white text-[#0F172A]' : 'bg-[#0F172A] text-white')
            }
          >
            {busy ? 'Un momento…' : subscribed ? 'Desactivar avisos' : 'Activar avisos'}
          </button>
          <span className="text-[12px] font-semibold text-[#64748B]">
            {subscribed ? 'Activos en este dispositivo' : 'Desactivados'}
          </span>
        </div>
      )}

      {permission === 'denied' && (
        <p className="mt-2 text-[12px] text-[#A33421]">
          Los avisos están bloqueados para este sitio. Hay que volver a permitirlos desde los ajustes del navegador.
        </p>
      )}
      {error && <p className="mt-2 text-[12px] text-[#A33421]">{error}</p>}
    </section>
  );
}
