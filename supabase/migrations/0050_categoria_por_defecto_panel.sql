-- Bug: un salón creado DESDE EL PANEL (create_tenant_for_current_user, migración 0024 -- el
-- camino de quien entra con Google o crea su salón ya autenticado) nace sin ninguna categoría, y
-- el botón "+ Nuevo servicio" queda deshabilitado mientras `categories` esté vacía (ver
-- src/pages/panel/PanelServices.jsx): el salón nuevo no puede cargar ni un solo servicio.
--
-- Es el mismo bug que arregló 0029_default_category.sql, pero esa migración solo tocó
-- create_tenant_with_owner (el alta por la Edge Function signup-tenant) y dejó intacta la del
-- panel. Acá se cierra el otro camino y se vuelve a hacer el backfill, para desbloquear ahora
-- mismo a los salones que se crearon en el medio.

create or replace function create_tenant_for_current_user(p_name text, p_slug text, p_owner_name text)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_name text := trim(coalesce(p_name, ''));
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_owner_name text;
  v_tenant_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if exists (select 1 from professionals where auth_user_id = v_auth_user_id) then
    raise exception 'Esta cuenta ya tiene un panel asociado' using errcode = 'P0001';
  end if;
  if length(v_name) < 2 then
    raise exception 'Ingresa el nombre del local' using errcode = 'P0001';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) < 3 or length(v_slug) > 40 then
    raise exception 'El link solo puede tener minúsculas, números y guiones (3 a 40 caracteres)' using errcode = 'P0001';
  end if;
  if v_slug = any (array[
    'registro', 'crear-salon', 'panel', 'api', 'admin', 'auth', 'login', 'logout', 'app',
    'static', 'assets', 'home', 'www', 'soporte', 'ayuda', 'terminos', 'privacidad', 'signup',
    'dashboard', 'public', 'null', 'undefined'
  ]) then
    raise exception 'Ese link está reservado, elige otro' using errcode = 'P0001';
  end if;
  if exists (select 1 from tenants where slug = v_slug) then
    raise exception 'Ese link ya está en uso' using errcode = 'P0001';
  end if;

  v_owner_name := coalesce(nullif(trim(p_owner_name), ''), v_name);

  insert into tenants (slug, name, mark)
  values (v_slug, v_name, upper(left(v_name, 2)))
  returning id into v_tenant_id;

  insert into professionals (tenant_id, auth_user_id, name, initials, role, email, active)
  values (v_tenant_id, v_auth_user_id, v_owner_name, upper(left(v_owner_name, 2)), 'admin', v_email, true);

  -- Lo que faltaba: sin esto no se puede crear ningún servicio (no hay pantalla para crear
  -- categorías en el panel, son una agrupación interna liviana).
  insert into categories (tenant_id, name) values (v_tenant_id, 'General');

  return jsonb_build_object('tenantId', v_tenant_id, 'slug', v_slug);
end;
$$;

-- Backfill: los salones que ya nacieron sin categoría quedan desbloqueados sin tener que tocar
-- nada a mano.
insert into categories (tenant_id, name)
select t.id, 'General'
from tenants t
where not exists (select 1 from categories c where c.tenant_id = t.id);
