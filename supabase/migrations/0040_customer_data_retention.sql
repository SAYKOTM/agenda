-- Retención de datos de clientes finales de un salón dado de baja (auditoría de seguridad,
-- hallazgo "retención indefinida tras cancelar la suscripción"). La Ley 21.719 (art. 3 letra c,
-- principio de proporcionalidad) no fija un plazo en días para este caso -- delega en el
-- responsable del tratamiento definir un criterio claro y documentarlo. Plazo elegido con el
-- dueño del proyecto: 180 días corridos desde que el tenant queda en
-- subscription_status = 'canceled', aproximado con tenants.updated_at (se actualiza en cada
-- UPDATE de la fila vía el trigger tenants_set_updated_at -- un tenant cancelado y abandonado no
-- vuelve a tocarse hasta que alguien reactive la suscripción, lo que cambia subscription_status y
-- por lo tanto lo saca de este barrido).
--
-- Se anonimiza en vez de borrar la fila entera: se conserva el conteo/monto agregado de reservas
-- (útil para el propio análisis de negocio del dueño del salón y ya no es dato personal de un
-- tercero una vez anonimizado), pero se borra todo lo identificable de la persona (nombre,
-- teléfono, email, notas). No toca reviews.comment (texto libre que el cliente decidió publicar
-- él mismo, no se puede depurar PII de forma automática y segura) ni payment_transactions/
-- booking_status_history (no tienen columnas de PII de cliente).
--
-- Fuera de alcance a propósito: un tenant que nunca convirtió su trial (subscription_status se
-- queda en 'trialing' para siempre, sin pasar nunca por 'canceled') no cae en este barrido -- es
-- un caso distinto (cuenta abandonada, no suscripción cancelada) que no pidió esta pasada.

create or replace function purge_stale_tenant_customer_data() returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_cutoff timestamptz := now() - interval '180 days';
begin
  update customers c set
    name = 'Cliente eliminado',
    -- phone es NOT NULL y tiene unique(tenant_id, phone): un placeholder fijo chocaría entre
    -- varios clientes anonimizados del mismo tenant, así que se deriva de c.id (único por fila).
    phone = 'eliminado-' || c.id::text,
    email = null
  from tenants t
  where t.id = c.tenant_id
    and t.subscription_status = 'canceled'
    and t.updated_at < v_cutoff
    and c.name <> 'Cliente eliminado';

  update bookings b set
    client_name = 'Cliente eliminado',
    client_phone = '',
    client_email = 'eliminado@invalido.local',
    notes = null
  from tenants t
  where t.id = b.tenant_id
    and t.subscription_status = 'canceled'
    and t.updated_at < v_cutoff
    and b.client_name <> 'Cliente eliminado';
end;
$$;

-- OJO: el cron NO se programa acá a propósito. Antes de dejarlo corriendo solo, revisa en
-- Supabase Studio (SQL Editor) cuántos tenants ya calificarían para la purga en el primer tick:
--
--   select id, slug, subscription_status, updated_at
--   from tenants
--   where subscription_status = 'canceled' and updated_at < now() - interval '180 days';
--
-- Si el resultado es el esperado (o vacío), programa el cron con:
--   select cron.schedule('purge-stale-tenant-customer-data', '30 4 * * *', $$select purge_stale_tenant_customer_data();$$);
-- Mientras tanto, la función existe pero nadie la llama sola.
