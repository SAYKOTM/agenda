-- Activa el barrido de retención que quedó preparado pero apagado en 0040. Antes de programarlo
-- se verificó contra producción que 0 tenants calificarían en el primer tick (ningún tenant tiene
-- subscription_status = 'canceled' todavía), así que no hay riesgo de anonimizar datos de golpe.
select cron.schedule('purge-stale-tenant-customer-data', '30 4 * * *', $$select purge_stale_tenant_customer_data();$$);
