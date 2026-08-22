-- Habilita Supabase Realtime (Postgres Changes) sobre "bookings": la Agenda del panel escucha
-- inserts/updates/deletes para reflejar en pantalla, sin recargar, las reservas que un cliente
-- hace desde el flujo público (o que otro miembro del equipo confirma/reagenda/cancela).
alter publication supabase_realtime add table bookings;
