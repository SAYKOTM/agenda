-- Fase 6: self-signup autónomo. Un dueño de salón crea su propio tenant sin intervención manual.
--
-- La transacción (crear tenant + profesional 'admin' vinculado al auth.user) vive en esta única
-- función para que sea atómica: si el insert de `professionals` falla (p. ej. constraint), Postgres
-- revierte también el insert de `tenants` porque todo ocurre dentro del mismo bloque de función.
--
-- Solo se otorga EXECUTE a `service_role`: la llama exclusivamente la Edge Function signup-tenant,
-- que ya creó el auth.user con el service role antes de invocarla. No se le da acceso a
-- 'authenticated' ni 'anon' a propósito -- así no hace falta ninguna política RLS nueva de INSERT
-- en `tenants` ni en `professionals`, y un profesional ya logueado no puede llamarla para crearse
-- un segundo tenant.
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

  return jsonb_build_object('tenantId', v_tenant_id, 'slug', p_slug);
end;
$$;

revoke all on function create_tenant_with_owner(text, text, text, text, uuid) from public, authenticated, anon;
grant execute on function create_tenant_with_owner(text, text, text, text, uuid) to service_role;
