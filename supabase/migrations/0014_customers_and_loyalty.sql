-- Gamificación por fidelidad + ficha de cliente.
--
-- Hasta ahora "cliente" no era una entidad: cada reserva guardaba client_name/phone/email
-- sueltos, y "cliente nuevo" se inferia comparando client_phone entre reservas
-- (panel_period_metrics, 0008/0012). Esta migración introduce una tabla customers real,
-- necesaria para reseñas (0015), el módulo de fichas de cliente y las medallas de fidelidad.
--
-- Las visitas que cuentan para la medalla/descuento son las reservas con status = 'completada'.
-- visits_count/total_spent_clp/last_visit_at se mantienen "recompute from scratch" via trigger
-- (mismo enfoque que ya usa el repo en vez de incrementos frágiles) para no arrastrar drift si
-- una reserva cambia de estado varias veces (p.ej. completada -> cancelada por error).

create or replace function customer_loyalty_tier(p_visits int) returns text
language sql immutable as $$
  select case
    when p_visits >= 20 then 'diamante'
    when p_visits >= 10 then 'oro'
    when p_visits >= 5 then 'plata'
    when p_visits >= 1 then 'bronce'
    else null
  end;
$$;

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  phone text not null,
  name text not null,
  email text,
  visits_count integer not null default 0,
  total_spent_clp integer not null default 0,
  last_visit_at timestamptz,
  tier text generated always as (customer_loyalty_tier(visits_count)) stored,
  created_at timestamptz not null default now(),
  unique (tenant_id, phone)
);
create index customers_tenant_idx on customers (tenant_id);

alter table bookings add column customer_id uuid references customers (id) on delete set null;
alter table bookings add column loyalty_discount_clp integer not null default 0 check (loyalty_discount_clp >= 0);
alter table bookings add column loyalty_tier_applied text;
create index bookings_customer_idx on bookings (customer_id);

alter table tenants add column enable_loyalty_discounts boolean not null default false;
alter table tenants add column loyalty_gold_discount_pct numeric(5, 2) not null default 10;
alter table tenants add column loyalty_diamond_discount_pct numeric(5, 2) not null default 15;

-- ---------- backfill: un customer por (tenant_id, client_phone) ya existente en bookings ----------
insert into customers (tenant_id, phone, name, email)
select distinct on (tenant_id, client_phone) tenant_id, client_phone, client_name, client_email
from bookings
order by tenant_id, client_phone, created_at desc
on conflict (tenant_id, phone) do nothing;

update bookings b set customer_id = c.id
from customers c
where c.tenant_id = b.tenant_id and c.phone = b.client_phone and b.customer_id is null;

update customers c set
  visits_count = agg.visits_count,
  total_spent_clp = agg.total_spent_clp,
  last_visit_at = agg.last_visit_at
from (
  select customer_id,
    count(*) filter (where status = 'completada') as visits_count,
    coalesce(sum(total_price_clp) filter (where status in ('confirmada', 'completada')), 0) as total_spent_clp,
    max(start_at) filter (where status = 'completada') as last_visit_at
  from bookings
  where customer_id is not null
  group by customer_id
) agg
where agg.customer_id = c.id;

-- ---------- mantiene las estadísticas del cliente al crear/cambiar el estado de una reserva ----------
create or replace function sync_customer_stats() returns trigger
language plpgsql as $$
begin
  if new.customer_id is not null then
    update customers c set
      visits_count = agg.visits_count,
      total_spent_clp = agg.total_spent_clp,
      last_visit_at = agg.last_visit_at
    from (
      select
        count(*) filter (where status = 'completada') as visits_count,
        coalesce(sum(total_price_clp) filter (where status in ('confirmada', 'completada')), 0) as total_spent_clp,
        max(start_at) filter (where status = 'completada') as last_visit_at
      from bookings
      where customer_id = new.customer_id
    ) agg
    where c.id = new.customer_id;
  end if;
  return new;
end;
$$;
create trigger bookings_sync_customer_stats after insert or update of status on bookings
  for each row execute function sync_customer_stats();

-- ---------- RLS: ficha de cliente compartida por todo el equipo del tenant ----------
alter table customers enable row level security;
create policy customers_manage on customers for all
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
-- RLS no sustituye el GRANT de tabla que exige PostgREST (ver 0003_grants.sql): customers es
-- dato privado del panel, nunca accesible por anon.
grant select, insert, update, delete on customers to authenticated;

-- ---------- create_booking: ahora resuelve el customer_id (upsert) y aplica el descuento de ----------
-- fidelidad del tenant (si está encendido) usando las visitas PREVIAS a esta reserva.
create or replace function create_booking(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_client_name text,
  p_client_phone text,
  p_client_email text,
  p_notes text,
  p_start_at timestamptz,
  p_items jsonb,
  p_payment_method payment_method,
  p_source booking_source default 'public'
) returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_core_span int;
  v_buffer_before int;
  v_buffer_after int;
  v_end_at timestamptz;
  v_total int;
  v_deposit int;
  v_item jsonb;
  v_sort int := 0;
  v_customer_id uuid;
  v_prior_visits int;
  v_tier text;
  v_tenant tenants;
  v_discount_pct numeric(5, 2) := 0;
  v_discount int := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La reserva necesita al menos un servicio' using errcode = 'P0001';
  end if;

  select coalesce(sum((i ->> 'duration_min')::int), 0),
         coalesce(sum((i ->> 'price')::int), 0),
         coalesce(sum(coalesce((i ->> 'deposit_amount_clp')::int, 0)), 0)
    into v_core_span, v_total, v_deposit
    from jsonb_array_elements(p_items) i;

  v_buffer_before := coalesce((p_items -> 0 ->> 'buffer_before_min')::int, 0);
  v_buffer_after := coalesce((p_items -> -1 ->> 'buffer_after_min')::int, 0);
  v_end_at := p_start_at + make_interval(mins => v_core_span);

  insert into customers (tenant_id, phone, name, email)
  values (p_tenant_id, p_client_phone, p_client_name, p_client_email)
  on conflict (tenant_id, phone) do update set name = excluded.name, email = excluded.email
  returning id, visits_count into v_customer_id, v_prior_visits;

  v_tier := customer_loyalty_tier(v_prior_visits);

  select * into v_tenant from tenants where id = p_tenant_id;
  if v_tenant.enable_loyalty_discounts and v_tier in ('oro', 'diamante') then
    v_discount_pct := case v_tier when 'oro' then v_tenant.loyalty_gold_discount_pct else v_tenant.loyalty_diamond_discount_pct end;
    v_discount := round(v_total * v_discount_pct / 100);
    v_total := greatest(v_total - v_discount, 0);
  end if;

  insert into bookings (
    tenant_id, professional_id, client_name, client_phone, client_email, notes,
    start_at, end_at, buffer_before_min, buffer_after_min,
    total_price_clp, deposit_amount_clp, payment_method, source,
    customer_id, loyalty_discount_clp, loyalty_tier_applied
  ) values (
    p_tenant_id, p_professional_id, p_client_name, p_client_phone, p_client_email, p_notes,
    p_start_at, v_end_at, v_buffer_before, v_buffer_after,
    v_total, v_deposit, p_payment_method, p_source,
    v_customer_id, v_discount, case when v_discount > 0 then v_tier else null end
  ) returning * into v_booking;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into booking_items (
      booking_id, service_id, name_snapshot, price_snapshot, duration_snapshot,
      buffer_before_snapshot, buffer_after_snapshot, sort_order
    ) values (
      v_booking.id, (v_item ->> 'service_id')::uuid, v_item ->> 'name',
      (v_item ->> 'price')::int, (v_item ->> 'duration_min')::int,
      coalesce((v_item ->> 'buffer_before_min')::int, 0), coalesce((v_item ->> 'buffer_after_min')::int, 0),
      v_sort
    );
    v_sort := v_sort + 1;
  end loop;

  return v_booking;
end;
$$;

-- ---------- preview público de solo lectura, usado por el wizard antes de confirmar ----------
create or replace function lookup_customer_tier(p_tenant_id uuid, p_phone text) returns jsonb
language plpgsql stable
security definer set search_path = public as $$
declare
  v_visits int;
  v_tier text;
  v_tenant tenants;
  v_discount_pct numeric(5, 2) := 0;
begin
  select visits_count into v_visits from customers where tenant_id = p_tenant_id and phone = p_phone;
  v_tier := customer_loyalty_tier(coalesce(v_visits, 0));

  select * into v_tenant from tenants where id = p_tenant_id;
  if v_tenant.enable_loyalty_discounts and v_tier in ('oro', 'diamante') then
    v_discount_pct := case v_tier when 'oro' then v_tenant.loyalty_gold_discount_pct else v_tenant.loyalty_diamond_discount_pct end;
  end if;

  return jsonb_build_object('tier', v_tier, 'discountPct', v_discount_pct);
end;
$$;
grant execute on function lookup_customer_tier(uuid, text) to anon, authenticated;
