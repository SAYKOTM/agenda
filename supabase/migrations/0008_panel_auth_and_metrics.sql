-- Fase 3: soporte de base para el panel del profesional.
--
-- 1. Email de login por profesional (Supabase Auth se identifica por email; no existía en el
--    esquema de fase 1 porque el flujo público no lo necesitaba).
-- 2. Nota interna editable en la reserva (drawer de detalle de cita).
-- 3. Función de métricas agregadas del dashboard: se calculan en la base (agregación SQL), no
--    en el cliente, tal como exige el handoff. Recibe los límites de período ya resueltos en la
--    timezone del tenant (el cliente los calcula con Temporal, igual que hace el resto del app
--    con "hoy"), para no tener que reimplementar reglas de timezone/DST dentro de SQL.

alter table professionals add column email text unique;
alter table bookings add column internal_note text;

-- ---------- disponibilidad efectiva de un profesional en un rango de fechas ----------
-- Minutos disponibles por día = bloques recurrentes del weekday, menos lo cubierto por
-- excepciones "blocked", más lo agregado por excepciones "extra". Misma regla que aplica el
-- motor de slots (supabase/functions/_shared/slotEngine.ts), reexpresada en SQL para poder
-- agregarla sobre un rango sin tener que traer cada reserva/bloque al cliente.
create or replace function professional_available_minutes(p_professional_id uuid, p_from date, p_to date)
returns integer
language plpgsql stable
security definer set search_path = public as $$
declare
  v_total integer := 0;
  v_day date;
  v_weekday int;
  v_recurring int;
  v_blocked_full boolean;
  v_blocked_partial int;
  v_extra int;
begin
  v_day := p_from;
  while v_day <= p_to loop
    v_weekday := mod(extract(isodow from v_day)::int + 6, 7); -- isodow 1=lunes..7=domingo -> 0=lunes..6=domingo

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
grant execute on function professional_available_minutes(uuid, date, date) to authenticated;

-- ---------- métricas de un período (ingresos, citas, cancelación, top servicios, clientes) ----------
-- p_professional_id = null => agregado del tenant completo (uso del panel de administrador).
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
  -- "nuevo" = la primera reserva no cancelada de ese cliente (por teléfono) en todo el tenant
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
grant execute on function panel_period_metrics(uuid, timestamptz, timestamptz) to authenticated;
