import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// Avisos push para el profesional: le suena el teléfono cuando le agendan, cancelan o reagendan
// una hora, aunque tenga la app cerrada.
//
// Es Web Push estándar (VAPID) contra la Edge Function send-notification, no FCM: el proyecto ya
// tiene toda la infraestructura de notificaciones en Supabase (notification_queue + pg_cron +
// send-notification) y sumar Firebase solo para esto significaría un SDK más, otro service worker
// peleando por el scope y una cuenta de Google extra que mantener.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// En iPhone el push web SOLO existe con la app agregada a la pantalla de inicio (iOS 16.4+).
// Desde Safari normal la API ni siquiera aparece, así que hay que decírselo a la persona en vez
// de mostrarle un botón que no va a hacer nada.
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// La VAPID key viaja en base64url y PushManager la exige como Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

function keyToBase64(subscription, name) {
  const key = subscription.getKey(name);
  if (!key) return null;
  return window.btoa(String.fromCharCode(...new Uint8Array(key)));
}

export function usePushNotifications() {
  // Comprobación síncrona en el inicializador de useState: si se hiciera en un efecto, el primer
  // render mostraría el botón de activar y lo escondería un instante después.
  const [supported] = useState(() => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  const [standalone] = useState(() => isStandalone());
  const [permission, setPermission] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'));
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // ¿Este dispositivo ya está suscrito? (la suscripción vive en el navegador, no en la cuenta:
  // el mismo profesional puede tener el celular sí y el PC del mesón no)
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setSubscribed(!!sub);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    setError(null);

    if (!supported) {
      setError(
        isIos() && !isStandalone()
          ? 'En iPhone los avisos solo funcionan con la app instalada: tocá Compartir → Añadir a pantalla de inicio y abrila desde ahí.'
          : 'Este navegador no admite avisos push.'
      );
      return false;
    }
    if (!VAPID_PUBLIC_KEY) {
      // Falla ruidosa pero contenida: sin la clave no hay push posible, pero el panel sigue
      // funcionando igual.
      console.error(
        'Falta VITE_VAPID_PUBLIC_KEY. Generá el par con `npx web-push generate-vapid-keys`, poné la pública en el .env del front y la privada en el entorno de Supabase (VAPID_PRIVATE_KEY).'
      );
      setError('Los avisos no están configurados en este servidor. Avisale a quien administra el sistema.');
      return false;
    }

    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        setError(
          result === 'denied'
            ? 'Bloqueaste los avisos para este sitio. Hay que volver a permitirlos desde los ajustes del navegador.'
            : 'No autorizaste los avisos.'
        );
        return false;
      }

      // Esperar a que el worker esté activo: pushManager.subscribe sobre un registro todavía en
      // "installing" falla.
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true, // obligatorio en Chrome: todo push tiene que terminar en un aviso visible
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      // Vía RPC y no con un upsert directo: la función resuelve el profesional desde la sesión y
      // sabe traspasar una suscripción que quedó a nombre de otra persona en un navegador
      // compartido, como el computador del mesón (ver la migración 0045).
      const { error: dbError } = await supabase.rpc('save_push_subscription', {
        p_endpoint: subscription.endpoint,
        p_p256dh: keyToBase64(subscription, 'p256dh'),
        p_auth: keyToBase64(subscription, 'auth'),
        p_user_agent: navigator.userAgent.slice(0, 300),
      });
      if (dbError) throw new Error(dbError.message);

      setSubscribed(true);
      return true;
    } catch (e) {
      console.error('No pudimos activar los avisos push:', e);
      setError('No pudimos activar los avisos en este dispositivo.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported]);

  const disable = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Primero se marca en la base y después se da de baja en el navegador: si se hiciera al
        // revés y fallara la red, el servidor seguiría mandando a un endpoint muerto.
        await supabase.from('push_subscriptions').update({ enabled: false }).eq('endpoint', subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      return true;
    } catch (e) {
      console.error('No pudimos desactivar los avisos push:', e);
      setError('No pudimos desactivar los avisos.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    supported,
    standalone,
    permission,
    subscribed,
    busy,
    error,
    // En iPhone fuera de la app instalada no hay nada que ofrecer más que la instalación.
    needsInstallFirst: isIos() && !standalone,
    enable,
    disable,
  };
}
