-- Aislamiento estricto de ingresos por rol.
--
-- Gap real encontrado: bookings_manage (0002_rls.sql) solo exige tenant_id = current_tenant_id(),
-- sin mirar professional_id. Las RPCs de métricas (panel_period_metrics, panel_team_ranking,
-- panel_month_summary) sí exigen rol 'admin' para ver el agregado del salón o de otro
-- profesional (0010/0012/0016), pero esa validación se puede saltar por completo: cualquier
-- profesional autenticado podía llamar `supabase.from('bookings').select('*').eq('tenant_id',
-- tenantId)` directo (el toggle "Todo el equipo" del panel era una restricción solo de UI, no de
-- base de datos) y leer total_price_clp de TODAS las reservas del salón, incluidas las de sus
-- compañeros. Esta migración cierra ese hueco en la capa que de verdad importa (RLS), no solo en
-- el cliente.
--
-- Regla nueva: un profesional con role = 'professional' (equivalente a "Staff" en el negocio)
-- solo puede leer/escribir sus PROPIAS reservas (professional_id = current_professional_id()).
-- Un profesional con role = 'admin' (equivalente a "Admin/Owner") sigue viendo y gestionando
-- todo el tenant, igual que antes -- es el único rol habilitado para datos consolidados del
-- equipo, tanto aquí como en las RPCs de métricas ya existentes.

alter policy bookings_manage on bookings
  using (
    tenant_id = current_tenant_id()
    and (professional_id = current_professional_id() or current_professional_role() = 'admin')
  )
  with check (
    tenant_id = current_tenant_id()
    and (professional_id = current_professional_id() or current_professional_role() = 'admin')
  );

-- booking_items, booking_status_history y payment_transactions cuelgan de una reserva y
-- exponen la misma información financiera (precios, historial, montos de pago): se filtran por
-- la misma regla vía join a bookings.
alter policy booking_items_manage on booking_items
  using (exists (
    select 1 from bookings b
    where b.id = booking_items.booking_id
      and b.tenant_id = current_tenant_id()
      and (b.professional_id = current_professional_id() or current_professional_role() = 'admin')
  ))
  with check (exists (
    select 1 from bookings b
    where b.id = booking_items.booking_id
      and b.tenant_id = current_tenant_id()
      and (b.professional_id = current_professional_id() or current_professional_role() = 'admin')
  ));

alter policy booking_status_history_manage on booking_status_history
  using (exists (
    select 1 from bookings b
    where b.id = booking_status_history.booking_id
      and b.tenant_id = current_tenant_id()
      and (b.professional_id = current_professional_id() or current_professional_role() = 'admin')
  ))
  with check (exists (
    select 1 from bookings b
    where b.id = booking_status_history.booking_id
      and b.tenant_id = current_tenant_id()
      and (b.professional_id = current_professional_id() or current_professional_role() = 'admin')
  ));

alter policy payment_transactions_manage on payment_transactions
  using (exists (
    select 1 from bookings b
    where b.id = payment_transactions.booking_id
      and b.tenant_id = current_tenant_id()
      and (b.professional_id = current_professional_id() or current_professional_role() = 'admin')
  ))
  with check (exists (
    select 1 from bookings b
    where b.id = payment_transactions.booking_id
      and b.tenant_id = current_tenant_id()
      and (b.professional_id = current_professional_id() or current_professional_role() = 'admin')
  ));
