-- Verifica el RBAC de la migración 0012: un 'professional' puede pedir SUS PROPIAS métricas
-- pero no las de un compañero ni el agregado del salón; panel_team_ranking (siempre agregado)
-- es admin-only sin excepción.
--
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/rbac_team_financials.sql "$DB_URL"

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000f006', 'authenticated', 'authenticated', 'nicolas-test2@roblebarberia.cl', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

update professionals set auth_user_id = 'c0000000-0000-0000-0000-00000000f006' where id = 'a0000000-0000-0000-0000-000000000f02'; -- Nicolás, 'professional'

set local role authenticated;
set local request.jwt.claims = '{"sub": "c0000000-0000-0000-0000-00000000f006", "role": "authenticated"}';

do $$
declare
  v_self uuid := 'a0000000-0000-0000-0000-000000000f02'; -- Nicolás (el que llama)
  v_colleague uuid := 'a0000000-0000-0000-0000-000000000f03'; -- Camilo
  v_raised boolean;
  v_result jsonb;
begin
  -- sus propias métricas: permitido
  select panel_period_metrics(v_self, now() - interval '7 days', now()) into v_result;
  if v_result is null then raise exception 'Nicolás no pudo pedir sus propias métricas'; end if;

  -- las de un compañero: bloqueado
  v_raised := false;
  begin
    perform panel_period_metrics(v_colleague, now() - interval '7 days', now());
  exception when others then v_raised := true;
  end;
  if not v_raised then raise exception 'FALLO: Nicolás pudo pedir las métricas de Camilo'; end if;

  -- el agregado del salón (professional_id null): bloqueado
  v_raised := false;
  begin
    perform panel_period_metrics(null, now() - interval '7 days', now());
  exception when others then v_raised := true;
  end;
  if not v_raised then raise exception 'FALLO: Nicolás pudo pedir el agregado financiero del salón'; end if;

  -- su propia disponibilidad: permitido
  perform professional_available_minutes(v_self, current_date, current_date + 6);

  -- la disponibilidad de un compañero: bloqueado
  v_raised := false;
  begin
    perform professional_available_minutes(v_colleague, current_date, current_date + 6);
  exception when others then v_raised := true;
  end;
  if not v_raised then raise exception 'FALLO: Nicolás pudo pedir la disponibilidad de Camilo'; end if;

  -- el ranking del equipo: siempre bloqueado para un 'professional'
  v_raised := false;
  begin
    perform panel_team_ranking(now() - interval '7 days', now());
  exception when others then v_raised := true;
  end;
  if not v_raised then raise exception 'FALLO: Nicolás pudo pedir el ranking del equipo'; end if;

  raise notice 'OK: un professional solo ve sus propias métricas, nunca las de un compañero ni el agregado del salón';
end $$;

-- ---------- como Matías ('admin'): todo lo anterior debe funcionar ----------
-- vuelve a la conexión superuser para el setup: "reset role" por sí solo no alcanza porque
-- request.jwt.claims es un GUC de sesión aparte (set local) que sigue activo en la misma
-- transacción -- auth.uid() seguiría resolviendo a Nicolás y el trigger de guard seguiría aplicando.
reset role;
set local request.jwt.claims = '{}';
update professionals set auth_user_id = null where id = 'a0000000-0000-0000-0000-000000000f02';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000f007', 'authenticated', 'authenticated', 'matias-test3@roblebarberia.cl', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());
update professionals set auth_user_id = 'c0000000-0000-0000-0000-00000000f007' where id = 'a0000000-0000-0000-0000-000000000f01'; -- Matías, 'admin'
set local request.jwt.claims = '{"sub": "c0000000-0000-0000-0000-00000000f007", "role": "authenticated"}';

do $$
declare
  v_colleague uuid := 'a0000000-0000-0000-0000-000000000f03';
  v_result jsonb;
  v_rows int;
begin
  select panel_period_metrics(v_colleague, now() - interval '7 days', now()) into v_result;
  if v_result is null then raise exception 'Un admin no pudo pedir las métricas de un profesional de su tenant'; end if;

  select panel_period_metrics(null, now() - interval '7 days', now()) into v_result;
  if v_result is null then raise exception 'Un admin no pudo pedir el agregado financiero del salón'; end if;

  select count(*) into v_rows from panel_team_ranking(now() - interval '7 days', now());
  if v_rows = 0 then raise exception 'Un admin no pudo pedir el ranking del equipo'; end if;

  raise notice 'OK: un admin sí puede ver las métricas de cualquier profesional y el ranking del equipo';
end $$;

rollback;
