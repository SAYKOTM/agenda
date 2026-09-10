import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// El manifest "de verdad" lo define el documento HTML que se cargó (index.html o panel.html):
// iOS lo lee al cargar la página y ya no vuelve a mirar. Esto es el respaldo para el otro caso:
// Chrome/Android sí relee el link, y en navegación SPA (portada → /panel sin recargar) el
// documento sigue siendo index.html, así que sin esto Chrome ofrecería instalar la app del
// cliente estando en el panel.
const PROFILES = {
  panel: { manifest: '/panel.webmanifest', title: 'Mi Agenda', themeColor: '#0F172A', appleIcon: '/panel-apple-touch-icon.png' },
  client: { manifest: '/manifest.json', title: 'Agenda', themeColor: '#863BFF', appleIcon: '/apple-touch-icon.png' },
};

function setMeta(name, content) {
  const el = document.querySelector(`meta[name="${name}"]`);
  if (el && el.getAttribute('content') !== content) el.setAttribute('content', content);
}

export default function RouteManifest() {
  const { pathname } = useLocation();

  useEffect(() => {
    const profile = pathname.startsWith('/panel') ? PROFILES.panel : PROFILES.client;

    const link = document.querySelector('link[rel="manifest"]');
    // Solo si cambió: reasignar el href fuerza al navegador a descargar el manifest de nuevo.
    if (link && !link.getAttribute('href').endsWith(profile.manifest)) link.setAttribute('href', profile.manifest);

    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleIcon && !appleIcon.getAttribute('href').endsWith(profile.appleIcon)) appleIcon.setAttribute('href', profile.appleIcon);

    setMeta('apple-mobile-web-app-title', profile.title);
    setMeta('theme-color', profile.themeColor);
  }, [pathname]);

  return null;
}
