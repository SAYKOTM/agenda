-- Ubicación en Google Maps + rating de Google en la landing pública.
-- google_place_id: lo carga el admin en Ajustes, es lo único necesario para el botón "escribir
-- reseña en Google" (search.google.com/local/writereview) y para el embed del mapa -- ninguno de
-- los dos requiere guardar coordenadas propias.
-- google_rating/google_reviews_count/google_rating_updated_at: caché del rating real de Google
-- (Places API), refrescado por un cron -- ver función que se agrega cuando haya API key
-- configurada (Google no tiene forma de sincronizar reseñas en sí, solo el rating agregado).
alter table tenants add column google_place_id text;
alter table tenants add column google_rating numeric(2,1);
alter table tenants add column google_reviews_count integer;
alter table tenants add column google_rating_updated_at timestamptz;
