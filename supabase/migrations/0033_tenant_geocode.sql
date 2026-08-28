-- Coordenadas del negocio para el mapa embebido con OpenStreetMap (sin API key ni tarjeta de
-- Google, a diferencia del embed de Google Maps de 0031/0032 que sigue ahí para quien la tenga).
-- Se cargan una sola vez geocodificando la dirección (ver Edge Function geocode-address), no en
-- cada visita de la landing pública.
alter table tenants add column lat double precision;
alter table tenants add column lng double precision;
