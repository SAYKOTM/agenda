// Links públicos que el salón y cada profesional reparten a sus clientes. Viven en un solo lugar
// porque se muestran para copiar en el panel (Perfil, Ajustes) y además se navegan desde la
// landing: si la forma del link cambia, tiene que cambiar en los dos lados a la vez.
export function tenantBookingUrl(slug, origin = window.location.origin) {
  return `${origin}/${slug}`;
}

// Perfil público de un profesional: su foto, su galería de trabajos y sus servicios, con el
// botón para reservar directo con él. Si todavía no tiene public_slug (base sin migrar), cae al
// id, que la página también resuelve.
export function professionalPublicPath(slug, professional) {
  return `/${slug}/con/${professional.public_slug || professional.id}`;
}

export function professionalPublicUrl(slug, professional, origin = window.location.origin) {
  return origin + professionalPublicPath(slug, professional);
}

// Link de "reservar conmigo": el wizard lee ?con= y salta el paso de elegir profesional.
export function professionalBookingPath(slug, professional) {
  return `/${slug}/reservar?con=${encodeURIComponent(professional.public_slug || professional.id)}`;
}

// Chat directo con una persona. wa.me quiere el número con código de país y sin nada más: los
// clientes escriben "+56 9 1234 5678", "912345678" o "56912345678" y los tres tienen que funcionar,
// así que se limpia y se asume Chile cuando el número viene sin código (9 dígitos que arrancan en 9).
export function whatsappDirectUrl(phone, text, defaultCountryCode = '56') {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('9')) digits = defaultCountryCode + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// Link de reserva apuntando a un día concreto: se usa en el mensaje de la lista de espera, para
// que el cliente caiga en el wizard con ese profesional y esa fecha ya elegidos.
export function bookingLinkForDate(slug, professional, date, origin = window.location.origin) {
  const base = professional ? `${origin}${professionalBookingPath(slug, professional)}` : `${origin}/${slug}/reservar`;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}fecha=${date}`;
}

export function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
