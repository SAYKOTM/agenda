-- Bug: create_tenant_with_owner (0023) nunca seteaba tenants.theme, así que todo salón nacido
-- del auto-registro quedaba con el default '{}' de la columna -- ClientShell.jsx arma las
-- variables CSS (--t-bg, --t-accent, etc.) desde ese jsonb, así que theme vacío = colores sin
-- definir = landing pública en blanco y negro por defecto del navegador (visto en nicobarber).
-- "Onyx" (mismo valor que ya traía roble-barberia) queda como default neutro; el admin lo puede
-- cambiar en Ajustes → Apariencia entre las 6 paletas de src/lib/tenantThemes.js.
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
  insert into tenants (slug, name, mark, theme)
  values (
    p_slug, p_name, upper(left(p_name, 2)),
    '{"bg":"#0F1219","panel":"#171C26","ink":"#F3F5F8","sub":"#8B96A6","border":"#242C39","accent":"#FF5A2B","accentInk":"#0F1219"}'::jsonb
  )
  returning id into v_tenant_id;

  insert into professionals (tenant_id, auth_user_id, name, initials, role, email, active)
  values (v_tenant_id, p_auth_user_id, v_owner_name, upper(left(v_owner_name, 2)), 'admin', p_owner_email, true);

  insert into categories (tenant_id, name) values (v_tenant_id, 'General');

  return jsonb_build_object('tenantId', v_tenant_id, 'slug', p_slug);
end;
$$;

-- backfill: cualquier tenant que ya haya quedado con theme vacío (nicobarber incluido).
update tenants
set theme = '{"bg":"#0F1219","panel":"#171C26","ink":"#F3F5F8","sub":"#8B96A6","border":"#242C39","accent":"#FF5A2B","accentInk":"#0F1219"}'::jsonb
where theme = '{}'::jsonb;
