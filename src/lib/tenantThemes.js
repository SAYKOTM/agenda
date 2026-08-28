// Paletas predefinidas para tenants.theme (ver ClientShell.jsx: bg/panel/ink/sub/border/accent/
// accentInk). "Onyx" y "Lavanda" son los temas que ya traían los datos de ejemplo (roble-barberia
// y lumiere-salon respectivamente) -- se documentan acá como presets oficiales en vez de quedar
// como colores sueltos escritos a mano solo en el seed.
export const TENANT_THEMES = [
  {
    id: 'onyx',
    label: 'Onyx',
    group: 'barberia',
    colors: { bg: '#0F1219', panel: '#171C26', ink: '#F3F5F8', sub: '#8B96A6', border: '#242C39', accent: '#FF5A2B', accentInk: '#0F1219' },
  },
  {
    id: 'grafito',
    label: 'Grafito Azul',
    group: 'barberia',
    colors: { bg: '#0E1420', panel: '#16202F', ink: '#EEF2F7', sub: '#8697AC', border: '#22303F', accent: '#3B82F6', accentInk: '#F8FAFC' },
  },
  {
    id: 'cuero',
    label: 'Cuero',
    group: 'barberia',
    colors: { bg: '#1B140F', panel: '#241B14', ink: '#F5EDE4', sub: '#A6907C', border: '#34281E', accent: '#C8862B', accentInk: '#1B140F' },
  },
  {
    id: 'lavanda',
    label: 'Lavanda',
    group: 'salon',
    colors: { bg: '#F7F7FA', panel: '#FFFFFF', ink: '#131722', sub: '#737C8D', border: '#E6E8F0', accent: '#6D4DF6', accentInk: '#FFFFFF' },
  },
  {
    id: 'rosa-palo',
    label: 'Rosa Palo',
    group: 'salon',
    colors: { bg: '#FDF6F5', panel: '#FFFFFF', ink: '#2B1E1D', sub: '#8C7472', border: '#F0DEDB', accent: '#E97C8D', accentInk: '#FFFFFF' },
  },
  {
    id: 'verde-salvia',
    label: 'Verde Salvia',
    group: 'salon',
    colors: { bg: '#F5F7F3', panel: '#FFFFFF', ink: '#232A22', sub: '#74806E', border: '#E1E7DC', accent: '#6E8B5E', accentInk: '#FFFFFF' },
  },
];

export const DEFAULT_TENANT_THEME = TENANT_THEMES[0].colors;

export function themeMatchesPreset(theme, preset) {
  if (!theme) return false;
  return Object.keys(preset.colors).every((k) => theme[k] === preset.colors[k]);
}
