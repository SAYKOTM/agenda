import { useOnlineStatus } from '../../features/pwa/useOnlineStatus';

// Franja discreta y no bloqueante: sin señal la agenda igual se ve (viene de la caché de
// IndexedDB, ver src/lib/offlineStore.js), lo único que hace falta es que la persona entienda
// por qué no aparece la reserva que le acaban de hacer.
// `forced` viene de la sesión abierta desde la copia local: en algunos navegadores
// navigator.onLine sigue diciendo true aunque no haya salida a internet, y el hecho de haber
// tenido que abrir con la caché es una señal más confiable que el propio flag.
export default function OfflineBanner({ forced = false }) {
  const online = useOnlineStatus();
  if (online && !forced) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-[#F59E0B] px-3 py-1.5 text-center text-[12px] font-semibold text-[#3F2A05]"
    >
      <span aria-hidden="true">◍</span>
      Sin conexión — viendo tu agenda guardada
    </div>
  );
}
