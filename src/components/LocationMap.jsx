import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Mapa propio con Leaflet en vez del iframe de export/embed.html de OpenStreetMap.org: ese embed
// fuerza su chrome de sitio completo (barra de búsqueda, colores saturados de hace 20 años) que
// no se puede restylear al vivir en un iframe de otro origen. El tile set es "Canvas" de Esri
// (server.arcgisonline.com/.../Canvas/World_{Light,Dark}_Gray_Base) -- gris minimalista, sin API
// key (CARTO exige key desde hace poco, por eso no se usa esa) -- + una capa de referencia
// transparente encima con los nombres de calle. Elige claro/oscuro según el tema del tenant para
// que el mapa combine con el resto de la landing en vez de desentonar.
function isDarkHex(hex) {
  const n = parseInt((hex || '').replace('#', ''), 16);
  if (Number.isNaN(n)) return false;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

export default function LocationMap({ lat, lng, accent, bg }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!elRef.current || lat == null || lng == null) return;
    const dark = isDarkHex(bg);
    const map = L.map(elRef.current, {
      center: [lat, lng],
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    });
    mapRef.current = map;

    const canvas = dark ? 'World_Dark_Gray' : 'World_Light_Gray';
    const attribution = 'Esri, © OpenStreetMap contributors';
    L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${canvas}_Base/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 16,
      attribution,
    }).addTo(map);
    L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${canvas}_Reference/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 16,
    }).addTo(map);

    const icon = L.divIcon({
      className: '',
      html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${accent};border:3px solid ${dark ? '#0F1219' : '#FFFFFF'};box-shadow:0 1px 4px rgba(0,0,0,.35);"></span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    L.marker([lat, lng], { icon, interactive: false }).addTo(map);

    // Leaflet calcula el tamaño del mapa UNA vez, al crearlo, y no se entera si el contenedor
    // cambia después: basta con que aparezca la barra de scroll de la página (por una foto que
    // terminó de cargar más abajo) para que el mapa quede con tiles grises o corridos. El
    // observer lo vuelve a medir cada vez que el contenedor cambia de tamaño.
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(elRef.current);

    return () => {
      resize.disconnect();
      map.remove();
    };
  }, [lat, lng, accent, bg]);

  return <div ref={elRef} className="h-40 w-full" />;
}
