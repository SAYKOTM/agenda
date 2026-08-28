// POST /refresh-google-ratings
// Header: X-Webhook-Secret: <secreto compartido, mismo patrón que send-notification>
//
// La llama un cron diario de Postgres (ver 0032_refresh_google_ratings.sql). Recorre todos los
// tenants con google_place_id cargado y les refresca google_rating/google_reviews_count desde
// la Places API de Google -- Google no tiene forma de sincronizar las reseñas en sí (ver 0031),
// así que esto es lo más cerca que se puede llegar: el rating agregado real, cacheado para no
// pegarle a la API en cada visita de la landing pública.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const expected = Deno.env.get('GOOGLE_RATING_REFRESH_SECRET') || '';
  const got = req.headers.get('X-Webhook-Secret') || '';
  if (!expected || got !== expected) return errorResponse('no autorizado', 401);

  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) return errorResponse('falta configurar GOOGLE_PLACES_API_KEY', 500);

  const db = supabaseAdmin();
  const { data: tenants, error } = await db.from('tenants').select('id, google_place_id').not('google_place_id', 'is', null);
  if (error) return errorResponse(error.message, 500);

  let updated = 0;
  let failed = 0;
  for (const t of tenants || []) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(t.google_place_id)}&fields=rating,user_ratings_total&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== 'OK') {
        failed++;
        console.error(`[GOOGLE_RATING] failed tenant=${t.id}: ${data.status}`);
        continue;
      }
      await db
        .from('tenants')
        .update({
          google_rating: data.result?.rating ?? null,
          google_reviews_count: data.result?.user_ratings_total ?? null,
          google_rating_updated_at: new Date().toISOString(),
        })
        .eq('id', t.id);
      updated++;
    } catch (err) {
      failed++;
      console.error(`[GOOGLE_RATING] failed tenant=${t.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`[GOOGLE_RATING] refreshed ${updated} tenant(s), ${failed} failed`);
  return jsonResponse({ updated, failed });
});
