import { useCallback, useEffect, useState } from 'react';
import { isIos, isStandalone } from './usePushNotifications';

// Instalación de la app. Chrome/Android avisa con 'beforeinstallprompt' y deja abrir el diálogo
// nativo cuando queramos; Safari no dispara nada y la única vía es explicarle a la persona el
// camino manual (Compartir → Añadir a pantalla de inicio). Por eso el hook devuelve las dos
// cosas: el disparador cuando existe, y la señal de "mostrale las instrucciones" cuando no.
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    function onBeforeInstall(event) {
      event.preventDefault(); // sin esto Chrome muestra su propio banner cuando quiere
      setDeferredPrompt(event);
    }
    function onInstalled() {
      setDeferredPrompt(null);
      setInstalled(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    // El evento se consume: si la persona dice que no, Chrome no lo vuelve a emitir en esta carga.
    setDeferredPrompt(null);
    return outcome === 'accepted';
  }, [deferredPrompt]);

  return {
    installed,
    canPrompt: !!deferredPrompt,
    showIosInstructions: !installed && !deferredPrompt && isIos(),
    promptInstall,
  };
}
