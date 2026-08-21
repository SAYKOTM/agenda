-- Row Level Security: aislamiento por tenant.
--
-- Regla general: las tablas de catálogo público (lo que ve un cliente antes de reservar)
-- son legibles por cualquiera (anon incluido); todo lo demás solo es visible/editable por
-- un profesional autenticado cuyo tenant_id coincide con el de la fila. La creación pública
-- de reservas (fase 2) se hará vía una función security definer, no con INSERT directo de
-- anon sobre "bookings" — así la validación de disponibilidad siempre pasa por el motor de
-- slots del servidor.

alter table tenants enable row level security;
alter table tenant_bank_accounts enable row level security;
alter table tenant_payment_methods enable row level security;
alter table categories enable row level security;
alter table services enable row level security;
alter table professionals enable row level security;
alter table professional_services enable row level security;
alter table availability_blocks enable row level security;
alter table availability_exceptions enable row level security;
alter table bookings enable row level security;
alter table booking_items enable row level security;
alter table booking_status_history enable row level security;
alter table stations enable row level security;
alter table payment_transactions enable row level security;
alter table notification_queue enable row level security;

-- ---------- catálogo público: legible por cualquiera ----------
create policy tenants_public_read on tenants for select using (true);
create policy tenants_self_update on tenants for update using (id = current_tenant_id());

create policy tenant_payment_methods_public_read on tenant_payment_methods for select using (true);
create policy tenant_payment_methods_manage on tenant_payment_methods for all
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

create policy categories_public_read on categories for select using (true);
create policy categories_manage on categories for insert with check (tenant_id = current_tenant_id());
create policy categories_manage_upd on categories for update using (tenant_id = current_tenant_id());
create policy categories_manage_del on categories for delete using (tenant_id = current_tenant_id());

create policy services_public_read on services for select using (true);
create policy services_manage_ins on services for insert with check (tenant_id = current_tenant_id());
create policy services_manage_upd on services for update using (tenant_id = current_tenant_id());
create policy services_manage_del on services for delete using (tenant_id = current_tenant_id());

create policy professionals_public_read on professionals for select using (true);
create policy professionals_manage_ins on professionals for insert with check (tenant_id = current_tenant_id());
create policy professionals_manage_upd on professionals for update using (tenant_id = current_tenant_id());
create policy professionals_manage_del on professionals for delete using (tenant_id = current_tenant_id());

create policy professional_services_public_read on professional_services for select using (true);
create policy professional_services_manage on professional_services for all
  using (exists (select 1 from professionals p where p.id = professional_services.professional_id and p.tenant_id = current_tenant_id()))
  with check (exists (select 1 from professionals p where p.id = professional_services.professional_id and p.tenant_id = current_tenant_id()));

-- ---------- privado: solo el propio tenant (vía sesión de panel) ----------
create policy tenant_bank_accounts_manage on tenant_bank_accounts for all
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

create policy availability_blocks_manage on availability_blocks for all
  using (exists (select 1 from professionals p where p.id = availability_blocks.professional_id and p.tenant_id = current_tenant_id()))
  with check (exists (select 1 from professionals p where p.id = availability_blocks.professional_id and p.tenant_id = current_tenant_id()));

create policy availability_exceptions_manage on availability_exceptions for all
  using (exists (select 1 from professionals p where p.id = availability_exceptions.professional_id and p.tenant_id = current_tenant_id()))
  with check (exists (select 1 from professionals p where p.id = availability_exceptions.professional_id and p.tenant_id = current_tenant_id()));

create policy bookings_manage on bookings for all
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

create policy booking_items_manage on booking_items for all
  using (exists (select 1 from bookings b where b.id = booking_items.booking_id and b.tenant_id = current_tenant_id()))
  with check (exists (select 1 from bookings b where b.id = booking_items.booking_id and b.tenant_id = current_tenant_id()));

create policy booking_status_history_manage on booking_status_history for all
  using (exists (select 1 from bookings b where b.id = booking_status_history.booking_id and b.tenant_id = current_tenant_id()))
  with check (exists (select 1 from bookings b where b.id = booking_status_history.booking_id and b.tenant_id = current_tenant_id()));

create policy stations_manage on stations for all
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

create policy payment_transactions_manage on payment_transactions for all
  using (exists (select 1 from bookings b where b.id = payment_transactions.booking_id and b.tenant_id = current_tenant_id()));

create policy notification_queue_manage on notification_queue for all
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
