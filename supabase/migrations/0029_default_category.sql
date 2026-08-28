-- Bug: un tenant nuevo (self-signup, 0023) se creaba sin ninguna categoría, y el botón "+ Nuevo
-- servicio" del panel queda deshabilitado mientras `categories` esté vacía (ver
-- src/pages/panel/PanelServices.jsx) -- un profesional nuevo no podía cargar ni un solo servicio.
-- No hay pantalla de gestión de categorías en el panel: son solo una agrupación interna liviana,
-- así que la solución más simple y mantenible es asegurar que SIEMPRE exista al menos una.

-- 1) de acá en adelante: create_tenant_with_owner también crea la categoría por defecto.
create or replace function create_tenant_with_owner(
  p_name text,
  p_slug text,
  p_owner_name text,
  p_owner_email text,
  p_auth_user_id uuid
) returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant_id uuid;
  v_owner_name text := coalesce(nullif(trim(p_owner_name), ''), p_name);
begin
  insert into tenants (slug, name, mark)
  values (p_slug, p_name, upper(left(p_name, 2)))
  returning id into v_tenant_id;

  insert into professionals (tenant_id, auth_user_id, name, initials, role, email, active)
  values (v_tenant_id, p_auth_user_id, v_owner_name, upper(left(v_owner_name, 2)), 'admin', p_owner_email, true);

  insert into categories (tenant_id, name) values (v_tenant_id, 'General');

  return jsonb_build_object('tenantId', v_tenant_id, 'slug', p_slug);
end;
$$;

-- 2) backfill: cualquier tenant que ya haya quedado sin categorías (nicobarber incluido) queda
-- desbloqueado ahora mismo.
insert into categories (tenant_id, name)
select t.id, 'General'
from tenants t
where not exists (select 1 from categories c where c.tenant_id = t.id);
