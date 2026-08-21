-- Fase 4: soporte de base para el panel del administrador.

-- ---------- ranking de profesionales de un período (Resumen del salón) ----------
-- Todos los profesionales activos del tenant, con o sin citas en el rango (left join), para
-- que el ranking no oculte a quien no tuvo citas esa semana.
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
grant execute on function panel_team_ranking(timestamptz, timestamptz) to authenticated;

-- ---------- cambio de slug del tenant, con redirect del anterior ----------
create or replace function update_tenant_slug(p_new_slug text)
returns tenants
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant_id uuid := current_tenant_id();
  v_old_slug text;
  v_result tenants;
begin
  if v_tenant_id is null or current_professional_role() <> 'admin' then
    raise exception 'Solo un administrador puede cambiar el link público' using errcode = '42501';
  end if;
  if p_new_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'El link solo puede tener minúsculas, números y guiones' using errcode = 'P0001';
  end if;

  select slug into v_old_slug from tenants where id = v_tenant_id;
  if v_old_slug = p_new_slug then
    select * into v_result from tenants where id = v_tenant_id;
    return v_result;
  end if;

  if exists (select 1 from tenants where slug = p_new_slug and id <> v_tenant_id) then
    raise exception 'Ese link ya está en uso por otro salón' using errcode = 'P0001';
  end if;

  update tenants
    set slug = p_new_slug, previous_slugs = array_remove(array_append(previous_slugs, v_old_slug), p_new_slug)
    where id = v_tenant_id
    returning * into v_result;

  return v_result;
end;
$$;
grant execute on function update_tenant_slug(text) to authenticated;
