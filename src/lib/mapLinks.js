// Links de navegación externa (Waze/Google Maps/Apple Maps) y el embed de Google Maps. Los tres
// deep links funcionan solo con la dirección en texto -- no hace falta guardar lat/lng propias.
// El embed y el link "escribir reseña en Google" sí usan el Place ID que carga el admin en Ajustes.
export function wazeUrl(address) {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

export function googleMapsUrl(address, placeId) {
  const params = new URLSearchParams({ api: '1', destination: address });
  if (placeId) params.set('destination_place_id', placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function appleMapsUrl(address) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`;
}

export function googleWriteReviewUrl(placeId) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

export function googleMapsEmbedUrl(placeId) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key || !placeId) return null;
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=place_id:${encodeURIComponent(placeId)}`;
}
