import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (revisa tu .env.local)');
}

export const supabase = createClient(url, anonKey);
export const functionsUrl = `${url}/functions/v1`;
export { anonKey };
