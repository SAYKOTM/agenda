// Rate limit compartido por IP para Edge Functions públicas (sin JWT de usuario que identifique
// al caller). Usa la misma tabla/función Postgres que lookup_customer_tier (ver
// 0038_rate_limit_public_endpoints.sql) para que el contador sea consistente entre instancias de
// Deno -- no se puede llevar en memoria porque cada invocación puede caer en una instancia distinta.
import { supabaseAdmin } from './supabaseAdmin.ts';

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || 'unknown';
}

// Si el chequeo mismo falla (p. ej. la DB está caída), no bloqueamos el endpoint por eso -- mejor
// dejar pasar el request que tirar abajo la función por un problema del rate limiter.
export async function checkRateLimit(key: string, maxCount: number, windowSeconds: number): Promise<boolean> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc('enforce_rate_limit', {
    p_key: key,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  });
  if (error) return true;
  return data === true;
}
