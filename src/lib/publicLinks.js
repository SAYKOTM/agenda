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

export function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
