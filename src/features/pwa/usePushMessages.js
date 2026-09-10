import { useEffect, useRef } from 'react';

// Avisos en primer plano. Cuando el panel está abierto y visible, el service worker no muestra la
// notificación del sistema (sería redundante con la pantalla que la persona está mirando) y en su
// lugar le manda el payload a la pestaña: acá se recibe para mostrar un toast y hacer sonar un
// tono corto, que en un salón con música de fondo es lo que hace que el profesional levante la
// vista.
export function usePushMessages(onPush) {
  // El handler va por ref para no re-suscribirse en cada render si quien llama pasa una función
  // nueva cada vez.
  const handlerRef = useRef(onPush);
  useEffect(() => {
    handlerRef.current = onPush;
  }, [onPush]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    function handle(event) {
      if (event.data?.type === 'push') handlerRef.current?.(event.data.payload || {});
    }
    navigator.serviceWorker.addEventListener('message', handle);
    return () => navigator.serviceWorker.removeEventListener('message', handle);
  }, []);
}

// Tono corto generado con WebAudio en vez de un mp3: no suma un archivo al bundle ni una petición
// más, y no depende de que la caché lo tenga. Si el navegador todavía no habilitó el audio (hace
// falta una interacción previa de la persona), simplemente no suena.
export function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => ctx.close();
  } catch {
    // sin audio disponible el toast ya cumple
  }
}
