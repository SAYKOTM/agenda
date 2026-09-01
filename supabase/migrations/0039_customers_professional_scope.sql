-- Ficha de cliente por profesional (auditoría de seguridad, hallazgo "ficha de cliente
-- compartida"). Hasta ahora customers_manage (0014_customers_and_loyalty.sql) solo exigía
-- tenant_id = current_tenant_id(): cualquier profesional del salón -- no solo un admin -- podía
-- leer nombre, teléfono, email, gasto total e historial de TODOS los clientes del tenant, aunque
-- nunca los hubiera atendido. Se aplica el mismo criterio que ya usa 'bookings' desde
-- 0017_professional_financial_isolation.sql: un 'professional' solo ve clientes con los que tiene
-- al menos una reserva propia; un 'admin' sigue viendo la ficha completa del salón.
--
-- No hace falta agregar professional_id a "customers" (customers es del tenant, no de un
-- profesional -- un mismo cliente puede haber ido con varios): la pertenencia se resuelve vía
-- EXISTS contra bookings, igual que hacía booking_items_manage con bookings.
--
-- No rompe nada de lo que ya escribe: create_booking hace el insert/upsert de customers dentro de
-- una función SECURITY DEFINER (corre como el dueño de la función, que a su vez es dueño de la
-- tabla -- eso bypassa RLS por diseño de Postgres, sin necesitar FORCE ROW LEVEL SECURITY). El
-- panel (usePanelClients.js) solo lee la tabla, nunca inserta/actualiza directo.

drop policy customers_manage on customers;

create policy customers_manage on customers for all
  using (
    tenant_id = current_tenant_id()
    and (
      current_professional_role() = 'admin'
      or exists (
        select 1 from bookings b
        where b.customer_id = customers.id and b.professional_id = current_professional_id()
      )
    )
  )
  with check (
    tenant_id = current_tenant_id()
    and (
      current_professional_role() = 'admin'
      or exists (
        select 1 from bookings b
        where b.customer_id = customers.id and b.professional_id = current_professional_id()
      )
    )
  );
