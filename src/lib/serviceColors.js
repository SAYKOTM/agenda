// Paleta de la agenda. El criterio es que dos servicios NO se confundan de un vistazo: ocho
// tonos repartidos por toda la rueda de color en vez de varios azules/violetas vecinos (la
// paleta anterior tenía índigo #4F46E5 y violeta #7C3AED juntos, y rojo, naranjo y rosa muy
// cerca). Se recorre en orden salteado a propósito: dos servicios creados uno detrás del otro
// quedan en extremos opuestos de la rueda, que es como se ven en la agenda.
export const SERVICE_COLORS = [
  { hex: '#2563EB', name: 'Azul' },
  { hex: '#E08700', name: 'Naranjo' },
  { hex: '#1F9D55', name: 'Verde' },
  { hex: '#BE2FA0', name: 'Magenta' },
  { hex: '#0D9BA8', name: 'Turquesa' },
  { hex: '#D92B2B', name: 'Rojo' },
  { hex: '#7C3AED', name: 'Violeta' },
  { hex: '#64748B', name: 'Gris' },
];

export const SERVICE_COLOR_HEXES = SERVICE_COLORS.map((c) => c.hex);

export function serviceColorName(hex) {
  return SERVICE_COLORS.find((c) => c.hex.toLowerCase() === String(hex || '').toLowerCase())?.name || 'Personalizado';
}

// Primer color de la paleta que el profesional todavía no esté usando, para que un servicio
// nuevo nazca ya diferenciado del resto sin que tenga que elegir a mano. Si ya usó los ocho,
// vuelve a empezar por el principio.
export function nextServiceColor(usedHexes = []) {
  const used = new Set(usedHexes.map((h) => String(h || '').toLowerCase()));
  return SERVICE_COLOR_HEXES.find((hex) => !used.has(hex.toLowerCase())) || SERVICE_COLOR_HEXES[0];
}

// Reparte la paleta entre una lista de servicios ya existentes (botón "Recolorear" en Mis
// servicios): los creados antes de esta paleta quedaron con tonos parecidos entre sí y
// cambiarlos uno por uno es tedioso.
export function recolorServices(services) {
  return services.map((s, i) => ({ id: s.id, color: SERVICE_COLOR_HEXES[i % SERVICE_COLOR_HEXES.length] }));
}
