import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (revisa tu .env.local)');
}

// Los links de correo de Supabase (invitación a un profesional, recuperar contraseña) vuelven con
// `type=invite` / `type=recovery` en el hash de la URL. Hay que leerlo ACÁ, antes de createClient:
// el cliente detecta la sesión en la URL apenas se crea y deja el hash limpio, así que para
// cualquier otro archivo esa información ya no existe.
//
// Importa porque quien llega por invitación queda con sesión abierta pero SIN contraseña: entra
// de una en ese navegador y después no puede entrar en ningún otro lado (ni en la app instalada,
// que tiene su propio almacenamiento). El panel usa esta pista para pedirle que cree una.
function readAuthLinkType() {
  if (typeof window === 'undefined') return null;
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type');
  return fromHash || new URLSearchParams(window.location.search).get('type');
}

export const authLinkType = readAuthLinkType();

export const supabase = createClient(url, anonKey);
export const functionsUrl = `${url}/functions/v1`;
export { anonKey };
