import { useEffect, useState } from 'react';

// navigator.onLine solo sabe si hay interfaz de red, no si el servidor responde -- alcanza para
// el caso real del salón (celular sin señal en el subsuelo, wifi caído) y no cuesta nada.
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
