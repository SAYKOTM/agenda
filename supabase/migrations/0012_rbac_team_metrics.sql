-- RBAC: los ingresos y el conteo de citas de OTROS profesionales (ranking del equipo, resumen
-- del salón) son información financiera que solo 'admin' debe poder pedir. El bloqueo real tiene
-- que vivir aquí, no solo en el frontend: estas funciones son security definer y hasta ahora solo
-- validaban aislamiento por tenant, no por rol -- cualquier 'professional' autenticado podía
-- llamarlas por API y leer las cifras de sus compañeros o el agregado del salón completo.
--
-- Regla: un profesional sigue pudiendo pedir SUS PROPIOS números (p_professional_id = su propio
-- id); pedir los de otro profesional, o el agregado del salón (p_professional_id = null), exige
-- current_professional_role() = 'admin'.

create or replace function panel_period_metrics(p_professional_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable
security definer set search_path = public as $$
declare
  v_tenant_id uuid := current_tenant_id();
  v_result jsonb;
begin
  if v_tenant_id is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if (p_professional_id is null or p_professional_id <> current_professional_id())
    and current_professional_role() <> 'admin' then
    raise exception 'Solo un administrador puede ver las métricas de otro profesional o del salón' using errcode = '42501';
  end if;
  if p_professional_id is not null and not exists (
    select 1 from professionals where id = p_professional_id and tenant_id = v_tenant_id
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  with scoped as (
    select b.* from bookings b
    where b.tenant_id = v_tenant_id
      and (p_professional_id is null or b.professional_id = p_professional_id)
      and b.start_at >= p_from and b.start_at < p_to
  ),
  first_booking as (
    select client_phone, min(start_at) as first_at
    from bookings
    where tenant_id = v_tenant_id and status <> 'cancelada'
    group by client_phone
  ),
  top_services as (
    select bi.name_snapshot as name, count(*) as n
    from booking_items bi
    join scoped b on b.id = bi.booking_id
    group by bi.name_snapshot
    order by count(*) desc
    limit 4
  )
  select jsonb_build_object(
    'revenue', coalesce((select sum(total_price_clp) from scoped where status in ('confirmada', 'completada')), 0),
    'bookingsCount', (select count(*) from scoped),
    'paidCount', (select count(*) from scoped where status in ('confirmada', 'completada')),
    'cancelNoShowCount', (select count(*) from scoped where status in ('cancelada', 'no-show')),
    'newCustomers', (select count(*) from scoped s join first_booking f on f.client_phone = s.client_phone
                       where f.first_at = s.start_at and s.status <> 'cancelada'),
    'bookedMinutes', coalesce((
      select sum(bi.duration_snapshot) from booking_items bi
      join scoped b on b.id = bi.booking_id where b.status <> 'cancelada'
    ), 0),
    'topServices', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n)) from top_services), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function professional_available_minutes(p_professional_id uuid, p_from date, p_to date)
returns integer
language plpgsql stable
security definer set search_path = public as $$
declare
  v_total integer := 0;
  v_pro_id uuid;
  v_day date;
  v_weekday int;
  v_recurring int;
  v_blocked_full boolean;
  v_blocked_partial int;
  v_extra int;
begin
  if (p_professional_id is null or p_professional_id <> current_professional_id())
    and current_professional_role() <> 'admin' then
    raise exception 'Solo un administrador puede ver la disponibilidad de otro profesional o del salón' using errcode = '42501';
  end if;

  if p_professional_id is null then
    for v_pro_id in select id from professionals where tenant_id = current_tenant_id() and active = true loop
      v_total := v_total + professional_available_minutes(v_pro_id, p_from, p_to);
    end loop;
    return v_total;
  end if;

  v_day := p_from;
  while v_day <= p_to loop
    v_weekday := mod(extract(isodow from v_day)::int + 6, 7);

    select coalesce(sum(end_min - start_min), 0) into v_recurring
      from availability_blocks
      where professional_id = p_professional_id and weekday = v_weekday;

    select exists(
      select 1 from availability_exceptions
      where professional_id = p_professional_id and date = v_day and type = 'blocked' and start_min is null
    ) into v_blocked_full;

    if v_blocked_full then
      v_recurring := 0;
    else
      select coalesce(sum(least(end_min, 1440) - greatest(start_min, 0)), 0) into v_blocked_partial
        from availability_exceptions
        where professional_id = p_professional_id and date = v_day and type = 'blocked' and start_min is not null;
      v_recurring := greatest(v_recurring - coalesce(v_blocked_partial, 0), 0);
    end if;

    select coalesce(sum(end_min - start_min), 0) into v_extra
      from availability_exceptions
      where professional_id = p_professional_id and date = v_day and type = 'extra';

    v_total := v_total + v_recurring + v_extra;
    v_day := v_day + 1;
  end loop;
  return v_total;
end;
$$;

-- panel_team_ranking siempre devuelve a TODO el equipo: no tiene un "propio" caso, así que es
-- admin-only sin excepción.
create or replace function panel_team_ranking(p_from timestamptz, p_to timestamptz)
returns table (professional_id uuid, name text, initials text, revenue bigint, bookings_count bigint)
language plpgsql stable
security definer set search_path = public as $$
declare
  v_tenant_id uuid := current_tenant_id();
begin
  if v_tenant_id is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if current_professional_role() <> 'admin' then
    raise exception 'Solo un administrador puede ver el ranking del equipo' using errcode = '42501';
  end if;

  return query
    select p.id, p.name, p.initials,
      coalesce(sum(b.total_price_clp) filter (where b.status in ('confirmada', 'completada')), 0)::bigint,
      count(b.id)::bigint
    from professionals p
    left join bookings b on b.professional_id = p.id and b.start_at >= p_from and b.start_at < p_to
    where p.tenant_id = v_tenant_id and p.active = true
    group by p.id, p.name, p.initials
    order by 4 desc;
end;
$$;
