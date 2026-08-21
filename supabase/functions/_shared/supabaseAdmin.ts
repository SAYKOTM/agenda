// Cliente con service role: úsalo solo dentro de las Edge Functions, nunca lo expongas al
// cliente. Bypassa RLS por completo, así que cada función es responsable de verificar por su
// cuenta que quien llama tiene derecho a ver/tocar la fila (p. ej. por publicToken).
import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
