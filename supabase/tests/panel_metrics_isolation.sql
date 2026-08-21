-- Aislamiento por tenant de las funciones del panel agregadas en la fase 3
-- (professional_available_minutes, panel_period_metrics): un profesional autenticado no debe
-- poder pedir métricas ni disponibilidad de un profesional de otro tenant.
--
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/panel_metrics_isolation.sql "$DB_URL"

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000f003', 'authenticated', 'authenticated', 'matias-test@roblebarberia.cl', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

update professionals set auth_user_id = 'c0000000-0000-0000-0000-00000000f003' where id = 'a0000000-0000-0000-0000-000000000f01'; -- Matías, Roble

set local role authenticated;
set local request.jwt.claims = '{"sub": "c0000000-0000-0000-0000-00000000f003", "role": "authenticated"}';

do $$
declare
  v_lumiere_pro uuid := 'b0000000-0000-0000-0000-000000000f01'; -- Valentina, Lumière
  v_own_pro uuid := 'a0000000-0000-0000-0000-000000000f01'; -- el propio Matías
  v_raised boolean := false;
  v_result jsonb;
begin
  begin
    perform panel_period_metrics(v_lumiere_pro, now() - interval '7 days', now());
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FALLO DE AISLAMIENTO: Matías (Roble) pudo pedir métricas de un profesional de Lumière';
  end if;

  -- las propias sí deben funcionar
  select panel_period_metrics(v_own_pro, now() - interval '7 days', now()) into v_result;
  if v_result is null then
    raise exception 'panel_period_metrics no devolvió resultado para el propio profesional';
  end if;

  -- agregado del propio tenant (professional_id null) también debe funcionar
  select panel_period_metrics(null, now() - interval '7 days', now()) into v_result;
  if v_result is null then
    raise exception 'panel_period_metrics(null, ...) no devolvió resultado para el propio tenant';
  end if;

  raise notice 'OK: panel_period_metrics respeta el aislamiento por tenant';
end $$;

rollback;
