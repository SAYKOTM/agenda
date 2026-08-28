-- Fidelización configurable POR PROFESIONAL: cantidad de visitas y % de descuento de cada
-- medalla, en vez de los umbrales fijos (customer_loyalty_tier, 0014) y el % único del tenant.
--
-- Decisión de alcance (confirmada con el usuario): las visitas para calcular el descuento se
-- cuentan por profesional (si un cliente va con dos profesionales del mismo salón, cada uno lleva
-- su propia cuenta) -- pero la ficha de cliente ("Clientes", PanelClientDetail) sigue mostrando
-- la medalla histórica del salón entero tal cual estaba (customers.visits_count/tier no se
-- tocan): son dos cosas distintas -- "cuán fiel es al salón" vs. "cuántas visitas lleva con ESTE
-- profesional para su descuento", y no hay una sola noción correcta que las reemplace a ambas.
create table professional_loyalty_tiers (
  professional_id uuid not null references professionals (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  tier text not null check (tier in ('bronce', 'plata', 'oro', 'diamante')),
  visits_threshold integer not null check (visits_threshold >= 0),
  discount_pct numeric(5, 2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  primary key (professional_id, tier)
);
create index professional_loyalty_tiers_professional_idx on professional_loyalty_tiers (professional_id);

alter table professional_loyalty_tiers enable row level security;
-- lectura pública: create-booking (anon) y el preview del wizard necesitan poder resolver el
-- descuento antes de que el cliente tenga sesión.
create policy professional_loyalty_tiers_public_read on professional_loyalty_tiers for select using (true);
-- escritura: el propio profesional configura sus tiers (autoservicio, como pidió el usuario);
-- un admin del tenant también puede, por si necesita ajustarlo por el equipo.
create policy professional_loyalty_tiers_manage on professional_loyalty_tiers for all
  using (tenant_id = current_tenant_id() and (professional_id = current_professional_id() or current_professional_role() = 'admin'))
  with check (tenant_id = current_tenant_id() and (professional_id = current_professional_id() or current_professional_role() = 'admin'));
grant select on professional_loyalty_tiers to anon;
grant select, insert, update, delete on professional_loyalty_tiers to authenticated;

-- ---------- seed: mismos valores que traía el sistema tenant-wide, ahora por profesional ----------
insert into professional_loyalty_tiers (professional_id, tenant_id, tier, visits_threshold, discount_pct)
select p.id, p.tenant_id, v.tier, v.visits_threshold, v.discount_pct
from professionals p
cross join (values ('bronce', 1, 0), ('plata', 5, 0), ('oro', 10, 10), ('diamante', 20, 15)) as v(tier, visits_threshold, discount_pct)
on conflict do nothing;

-- cualquier profesional nuevo (self-signup, invitado, agregado por un admin) nace con estos
-- mismos defaults -- así el admin/profesional los ajusta desde cero en vez de partir sin nada.
create or replace function seed_professional_loyalty_tiers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into professional_loyalty_tiers (professional_id, tenant_id, tier, visits_threshold, discount_pct)
  values
    (new.id, new.tenant_id, 'bronce', 1, 0),
    (new.id, new.tenant_id, 'plata', 5, 0),
    (new.id, new.tenant_id, 'oro', 10, 10),
    (new.id, new.tenant_id, 'diamante', 20, 15);
  return new;
end;
$$;
create trigger professionals_seed_loyalty_tiers after insert on professionals
  for each row execute function seed_professional_loyalty_tiers();

-- ---------- resuelve tier + descuento para (profesional, visitas previas CON ESE profesional) ----------
create or replace function professional_loyalty_tier(p_professional_id uuid, p_visits int)
returns table (tier text, discount_pct numeric)
language sql stable as $$
  select t.tier, t.discount_pct
  from professional_loyalty_tiers t
  where t.professional_id = p_professional_id and t.visits_threshold <= p_visits
  order by t.visits_threshold desc
  limit 1;
$$;

-- ---------- create_booking: descuento ahora resuelto por profesional, no por tenant ----------
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
  v_prior_visits_with_pro int;
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
  returning id into v_customer_id;

  select count(*) into v_prior_visits_with_pro
    from bookings
    where professional_id = p_professional_id and customer_id = v_customer_id and status = 'completada';

  select * into v_tenant from tenants where id = p_tenant_id;
  if v_tenant.enable_loyalty_discounts then
    select plt.tier, plt.discount_pct into v_tier, v_discount_pct from professional_loyalty_tier(p_professional_id, v_prior_visits_with_pro) plt;
    if v_discount_pct > 0 then
      v_discount := round(v_total * v_discount_pct / 100);
      v_total := greatest(v_total - v_discount, 0);
    end if;
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

-- ---------- preview público (wizard, antes de confirmar) ----------
create or replace function lookup_customer_tier(p_tenant_id uuid, p_professional_id uuid, p_phone text) returns jsonb
language plpgsql stable
security definer set search_path = public as $$
declare
  v_customer_id uuid;
  v_visits int;
  v_tier text;
  v_discount_pct numeric(5, 2) := 0;
  v_tenant tenants;
begin
  select id into v_customer_id from customers where tenant_id = p_tenant_id and phone = p_phone;

  select count(*) into v_visits
    from bookings
    where professional_id = p_professional_id and customer_id = v_customer_id and status = 'completada';

  select * into v_tenant from tenants where id = p_tenant_id;
  if v_tenant.enable_loyalty_discounts then
    select plt.tier, plt.discount_pct into v_tier, v_discount_pct from professional_loyalty_tier(p_professional_id, v_visits) plt;
  else
    select plt.tier into v_tier from professional_loyalty_tier(p_professional_id, v_visits) plt;
  end if;

  return jsonb_build_object('tier', v_tier, 'discountPct', coalesce(v_discount_pct, 0));
end;
$$;
grant execute on function lookup_customer_tier(uuid, uuid, text) to anon, authenticated;

-- la firma vieja (sin professional_id) ya no la llama nadie del frontend actualizado -- se saca
-- para no dejar dos formas de resolver el mismo descuento con reglas distintas.
drop function if exists lookup_customer_tier(uuid, text);
