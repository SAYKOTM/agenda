-- Prueba de aislamiento por tenant: un profesional autenticado de Roble Barbería no debe
-- poder leer datos de Lumière Salón (ni reservas, ni disponibilidad, ni cuenta bancaria),
-- aunque haga la consulta sin ningún filtro de tenant_id -- RLS debe filtrar por sí sola.
--
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/tenant_isolation.sql "$DB_URL"

begin;

-- ---------- setup: usuarios de auth vinculados a un profesional de cada tenant ----------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000f001', 'authenticated', 'authenticated', 'matias-test@roblebarberia.cl', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000f002', 'authenticated', 'authenticated', 'valentina-test@lumiere.cl', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

update professionals set auth_user_id = 'c0000000-0000-0000-0000-00000000f001' where id = 'a0000000-0000-0000-0000-000000000f01'; -- Matías, Roble
update professionals set auth_user_id = 'c0000000-0000-0000-0000-00000000f002' where id = 'b0000000-0000-0000-0000-000000000f01'; -- Valentina, Lumière

-- una reserva por tenant, para tener algo que efectivamente se pueda "filtrar mal"
insert into bookings (id, tenant_id, professional_id, client_name, client_phone, client_email, status, start_at, end_at, buffer_before_min, buffer_after_min, total_price_clp)
values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000f01', 'Cliente Roble', '+56911111111', 'cliente@roble.cl', 'confirmada', '2020-01-06 14:00:00+00', '2020-01-06 14:35:00+00', 0, 10, 12000),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000f01', 'Cliente Lumière', '+56922222222', 'cliente@lumiere.cl', 'confirmada', '2020-01-06 16:00:00+00', '2020-01-06 16:50:00+00', 0, 10, 22000);

-- ---------- impersonar a Matías (Roble) como lo haría PostgREST ----------
set local role authenticated;
set local request.jwt.claims = '{"sub": "c0000000-0000-0000-0000-00000000f001", "role": "authenticated"}';

do $$
declare
  cnt integer;
begin
  -- current_tenant_id() debe resolver al tenant de Matías, no a null ni al de Lumière
  if (select current_tenant_id()) is distinct from 'a0000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'current_tenant_id() no resolvió al tenant de Roble para Matías';
  end if;

  -- bookings: debe ver la suya, no la de Lumière
  select count(*) into cnt from bookings where id = 'd0000000-0000-0000-0000-000000000002';
  if cnt <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Matías (Roble) pudo leer una reserva de Lumière';
  end if;
  select count(*) into cnt from bookings where id = 'd0000000-0000-0000-0000-000000000001';
  if cnt <> 1 then
    raise exception 'Matías no pudo leer su propia reserva (RLS demasiado restrictivo)';
  end if;

  -- tenant_bank_accounts: de lectura pública a propósito desde la migración 0006 (el cliente
  -- público necesita ver el destino de la transferencia al pagar); lo que sigue privado es la
  -- escritura, probada más abajo.
  update tenant_bank_accounts set holder = 'hackeado' where tenant_id = 'b0000000-0000-0000-0000-000000000000';
  get diagnostics cnt = row_count;
  if cnt <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Matías (Roble) pudo modificar la cuenta bancaria de Lumière';
  end if;

  -- availability_blocks: no debe ver bloques de profesionales de Lumière
  select count(*) into cnt from availability_blocks ab
    join professionals p on p.id = ab.professional_id
    where p.tenant_id = 'b0000000-0000-0000-0000-000000000000';
  if cnt <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Matías (Roble) pudo leer disponibilidad de profesionales de Lumière';
  end if;

  -- intento de UPDATE cruzado: no debe poder cancelar la reserva de otro tenant
  update bookings set status = 'cancelada' where id = 'd0000000-0000-0000-0000-000000000002';
  get diagnostics cnt = row_count;
  if cnt <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Matías (Roble) pudo modificar una reserva de Lumière';
  end if;

  raise notice 'OK: aislamiento por tenant verificado para Matías (Roble) contra datos de Lumière';
end $$;

rollback;
