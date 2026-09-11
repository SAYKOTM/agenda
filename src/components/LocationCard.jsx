import { wazeUrl, googleMapsUrl, appleMapsUrl, googleMapsEmbedUrl } from '../lib/mapLinks';
import LocationMap from './LocationMap';

// Tarjeta de "dónde queda" del lado cliente: mapa arriba, la dirección escrita debajo y los tres
// botones para abrirla en la app de mapas que cada uno use. Es un componente compartido porque se
// muestra igual en la portada del salón y en el perfil público de cada profesional -- si el
// cliente entró por el link de su peluquera, también tiene que poder llegar al local.
export default function LocationCard({ tenant }) {
  const { address, google_place_id: placeId, lat, lng, theme, hours_label: hoursLabel } = tenant;
  if (!address && !hoursLabel) return null;

  // Prioriza el embed de Google si hay API key configurada (la mayoría no la va a tener, por el
  // requisito de tarjeta en Google Cloud); si no, cae al mapa propio (Leaflet, gratis).
  const googleEmbedUrl = googleMapsEmbedUrl(placeId);

  return (
    <div className="flex flex-col gap-2.5 overflow-hidden rounded-[18px] border border-[var(--t-border)]">
      {address && (
        <div className="flex flex-col gap-2.5 bg-[var(--t-panel)] px-3.5 py-3.5 text-[13px]">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">Ubicación</span>
          {googleEmbedUrl ? (
            <iframe
              title="Ubicación en el mapa"
              src={googleEmbedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-40 w-full rounded-[12px] border-0"
            />
          ) : lat != null && lng != null ? (
            <div className="h-40 w-full overflow-hidden rounded-[12px]">
              <LocationMap lat={lat} lng={lng} accent={theme?.accent || '#0F172A'} bg={theme?.bg || '#FFFFFF'} />
            </div>
          ) : null}
          {/* La dirección escrita va SIEMPRE, haya mapa o no: es lo que el cliente copia, lee en
              la vereda y le dicta al taxi. */}
          <span className="leading-snug">{address}</span>
          <div className="flex gap-2">
            <a href={googleMapsUrl(address, placeId)} target="_blank" rel="noreferrer" className="flex-1 rounded-[10px] border border-[var(--t-border)] py-2 text-center text-[12px] font-semibold">
              Google Maps
            </a>
            <a href={wazeUrl(address)} target="_blank" rel="noreferrer" className="flex-1 rounded-[10px] border border-[var(--t-border)] py-2 text-center text-[12px] font-semibold">
              Waze
            </a>
            <a href={appleMapsUrl(address)} target="_blank" rel="noreferrer" className="flex-1 rounded-[10px] border border-[var(--t-border)] py-2 text-center text-[12px] font-semibold">
              Apple Maps
            </a>
          </div>
        </div>
      )}
      {hoursLabel && (
        <div className="flex gap-3 bg-[var(--t-panel)] px-3.5 py-3.5 text-[13px]">
          <span className="w-16.5 flex-none pt-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">Horario</span>
          <span className="flex-1">{hoursLabel}</span>
        </div>
      )}
    </div>
  );
}
