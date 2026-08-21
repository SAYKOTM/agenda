// Fuente única del motor de slots: vive en supabase/functions/_shared/slotEngine.ts porque lo
// consumen tanto las Edge Functions (Deno) como el frontend/tests (Node/Vite). Este archivo solo
// re-exporta para que el resto del código de la app pueda importar desde 'src/server/...'.
export * from '../../../supabase/functions/_shared/slotEngine';
