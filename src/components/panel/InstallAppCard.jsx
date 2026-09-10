import { useState } from 'react';
import { useInstallPrompt } from '../../features/pwa/useInstallPrompt';

const DISMISS_KEY = 'agenda-install-card-oculta';

function dismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

// Tarjeta "Instalar app" del panel. Desaparece sola cuando la app ya está instalada (display-mode
// standalone), así que quien la abre desde la pantalla de inicio no la ve nunca.
export default function InstallAppCard() {
  const { installed, canPrompt, showIosInstructions, promptInstall } = useInstallPrompt();
  const [hidden, setHidden] = useState(() => dismissed());

  if (installed || hidden || (!canPrompt && !showIosInstructions)) return null;

  function hide() {
    setHidden(true);
    try {
      // Solo por esta sesión: si no instala hoy, mañana se le vuelve a ofrecer.
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // sin sessionStorage se oculta igual hasta recargar
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-[#C7B8FF] bg-[#F5F1FF] p-3.5 @[560px]:flex-row @[560px]:items-center">
      <div className="flex flex-none items-center justify-center">
        <img src="/panel-icon-192.png" alt="" width="40" height="40" className="rounded-[11px]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold text-[#0F172A]">Instalá tu agenda en el teléfono</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-[#5B5470]">
          {showIosInstructions
            ? 'Tocá Compartir (el cuadrito con la flecha) y elegí “Añadir a pantalla de inicio”. Abrila desde ese ícono: así se abre sin barra del navegador y recién ahí iPhone permite los avisos.'
            : 'Se abre sin barra del navegador, arranca aunque no tengas señal y te avisa cuando te agendan o cancelan una hora.'}
        </p>
      </div>
      <div className="flex flex-none gap-2">
        {canPrompt && (
          <button
            type="button"
            onClick={promptInstall}
            className="min-h-11 rounded-[11px] bg-[#0F172A] px-4 text-[13px] font-semibold text-white"
          >
            Instalar
          </button>
        )}
        <button
          type="button"
          onClick={hide}
          className="min-h-11 rounded-[11px] border border-[#D3D7E0] bg-white px-3 text-[13px] font-semibold text-[#64748B]"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
