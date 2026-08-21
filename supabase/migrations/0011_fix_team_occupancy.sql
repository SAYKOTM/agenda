-- professional_available_minutes (migración 0008) solo sabía calcular la disponibilidad de UN
-- profesional: con p_professional_id = null (uso del panel de administrador, "todo el equipo")
-- el `where professional_id = null` no matcheaba nada y la ocupación del salón siempre daba 0%.
-- Con null, ahora suma la disponibilidad de todos los profesionales activos del tenant actual.
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
  if p_professional_id is null then
    for v_pro_id in select id from professionals where tenant_id = current_tenant_id() and active = true loop
      v_total := v_total + professional_available_minutes(v_pro_id, p_from, p_to);
    end loop;
    return v_total;
  end if;

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
