-- service_role es el que usan las Edge Functions (supabaseAdmin) para operar bypassando RLS.
-- BYPASSRLS ya lo tiene por definición del rol, pero eso no sustituye el GRANT de privilegios
-- de tabla que Postgres exige de todas formas -- sin esto, toda query desde una Edge Function
-- falla con "permission denied" aunque la política de RLS la habría dejado pasar.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant execute on functions to service_role;
