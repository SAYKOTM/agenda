-- Verifica los guardrails de la migración 0010: un 'professional' no puede escalar sus propios
-- permisos, suspenderse o suspender a otros, ni editar la configuración del salón; un 'admin' sí
-- puede hacer todo eso dentro de su propio tenant.
--
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/admin_role_guards.sql "$DB_URL"

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000f004', 'authenticated', 'authenticated', 'nicolas-test@roblebarberia.cl', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000f005', 'authenticated', 'authenticated', 'matias-test2@roblebarberia.cl', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

update professionals set auth_user_id = 'c0000000-0000-0000-0000-00000000f004' where id = 'a0000000-0000-0000-0000-000000000f02'; -- Nicolás, 'professional'
update professionals set auth_user_id = 'c0000000-0000-0000-0000-00000000f005' where id = 'a0000000-0000-0000-0000-000000000f01'; -- Matías, 'admin'

-- ---------- como Nicolás ('professional') ----------
set local role authenticated;
set local request.jwt.claims = '{"sub": "c0000000-0000-0000-0000-00000000f004", "role": "authenticated"}';

do $$
declare
  cnt integer;
begin
  -- no puede autoasignarse el rol admin
  begin
    update professionals set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000f02';
    raise exception 'FALLO: Nicolás pudo autoasignarse el rol admin';
  exception when insufficient_privilege then null;
  end;

  -- no puede suspenderse a sí mismo (mismo guard que bloquea 'role')
  begin
    update professionals set active = false where id = 'a0000000-0000-0000-0000-000000000f02';
    raise exception 'FALLO: Nicolás pudo desactivarse a sí mismo';
  exception when insufficient_privilege then null;
  end;

  -- no puede suspender a un colega
  update professionals set active = false where id = 'a0000000-0000-0000-0000-000000000f03'; -- Camilo
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'FALLO: Nicolás pudo suspender a Camilo'; end if;

  -- sí puede editar su propio perfil (campo no privilegiado)
  update professionals set bio = 'bio de prueba' where id = 'a0000000-0000-0000-0000-000000000f02';
  get diagnostics cnt = row_count;
  if cnt <> 1 then raise exception 'Nicolás no pudo editar su propio perfil (demasiado restrictivo)'; end if;

  -- no puede editar la configuración del salón
  update tenants set name = 'hackeado' where id = 'a0000000-0000-0000-0000-000000000000';
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'FALLO: Nicolás pudo editar los ajustes del salón'; end if;

  -- no puede tocar los métodos de pago del salón
  begin
    update tenant_payment_methods set enabled = false where tenant_id = 'a0000000-0000-0000-0000-000000000000' and method = 'efectivo';
    get diagnostics cnt = row_count;
    if cnt <> 0 then raise exception 'FALLO: Nicolás pudo editar los métodos de pago'; end if;
  exception when insufficient_privilege then null;
  end;

  raise notice 'OK: un professional no puede escalar permisos ni tocar la configuración del salón';
end $$;

-- ---------- como Matías ('admin') ----------
set local request.jwt.claims = '{"sub": "c0000000-0000-0000-0000-00000000f005", "role": "authenticated"}';

do $$
declare
  cnt integer;
begin
  update professionals set active = false where id = 'a0000000-0000-0000-0000-000000000f03'; -- Camilo
  get diagnostics cnt = row_count;
  if cnt <> 1 then raise exception 'Un admin no pudo suspender a un profesional de su propio tenant'; end if;

  update tenants set name = 'Roble Barbería Actualizado' where id = 'a0000000-0000-0000-0000-000000000000';
  get diagnostics cnt = row_count;
  if cnt <> 1 then raise exception 'Un admin no pudo editar los ajustes de su propio salón'; end if;

  raise notice 'OK: un admin sí puede gestionar el equipo y los ajustes de su propio tenant';
end $$;

rollback;
