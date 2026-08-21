-- RLS por sí sola no otorga acceso: Postgres exige además el GRANT de privilegios de tabla
-- correspondiente al rol de PostgREST (anon / authenticated). Aquí se define la superficie
-- de acceso; el filtrado fila-a-fila lo hacen las políticas de 0002_rls.sql.

grant usage on schema public to anon, authenticated;

-- catálogo público: legible por cualquiera (incluyendo visitantes sin sesión)
grant select on tenants, categories, services, professionals, professional_services, tenant_payment_methods
  to anon, authenticated;

-- gestión del catálogo: solo profesionales autenticados (RLS restringe al propio tenant)
grant insert, update, delete on tenants to authenticated;
grant insert, update, delete on categories, services, professionals, professional_services, tenant_payment_methods
  to authenticated;

-- privado: nunca accesible por anon; el panel autenticado opera dentro de su propio tenant
grant select, insert, update, delete on
  tenant_bank_accounts, availability_blocks, availability_exceptions,
  bookings, booking_items, booking_status_history,
  stations, payment_transactions, notification_queue
  to authenticated;
