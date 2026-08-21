-- Prueba a nivel de base de datos del constraint de exclusión: dos reservas activas del mismo
-- profesional no pueden solaparse (ni siquiera si la app tuviera un bug de validación), y
-- cancelar una reserva libera el horario para una nueva. Se corre como service_role
-- (bypassa RLS, igual que lo haría el backend) porque lo que se prueba aquí es el constraint,
-- no las políticas de RLS (esas están cubiertas en tenant_isolation.sql).
--
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/booking_exclusion.sql "$DB_URL"

begin;

insert into bookings (id, tenant_id, professional_id, client_name, client_phone, client_email, status, start_at, end_at, buffer_before_min, buffer_after_min, total_price_clp)
values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000f01', 'Cliente A', '+56911111111', 'a@roble.cl', 'confirmada', '2020-01-06 14:00:00+00', '2020-01-06 14:35:00+00', 0, 10, 12000);

do $$
begin
  -- se solapa: la reserva A ocupa 14:00-14:45 (con buffer); esta empieza a las 14:20
  begin
    insert into bookings (id, tenant_id, professional_id, client_name, client_phone, client_email, status, start_at, end_at, buffer_before_min, buffer_after_min, total_price_clp)
    values ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000f01', 'Cliente B', '+56922222222', 'b@roble.cl', 'confirmada', '2020-01-06 14:20:00+00', '2020-01-06 14:50:00+00', 0, 10, 12000);
    raise exception 'FALLO: se permitió una reserva solapada para el mismo profesional';
  exception
    when exclusion_violation then
      raise notice 'OK: el constraint de exclusión rechazó la reserva solapada';
  end;
end $$;

-- un horario que no se solapa (empieza cuando termina el buffer de A, 14:45) sí debe poder crearse
insert into bookings (id, tenant_id, professional_id, client_name, client_phone, client_email, status, start_at, end_at, buffer_before_min, buffer_after_min, total_price_clp)
values ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000f01', 'Cliente C', '+56933333333', 'c@roble.cl', 'confirmada', '2020-01-06 15:00:00+00', '2020-01-06 15:30:00+00', 0, 10, 12000);

-- cancelar A debe liberar su horario original (14:00-14:45): la misma reserva que antes chocaba
-- con A (Cliente B, 14:20-14:50) ahora debe poder crearse sin chocar con C (15:00-15:40)
update bookings set status = 'cancelada' where id = 'e0000000-0000-0000-0000-000000000001';

insert into bookings (id, tenant_id, professional_id, client_name, client_phone, client_email, status, start_at, end_at, buffer_before_min, buffer_after_min, total_price_clp)
values ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000f01', 'Cliente D', '+56944444444', 'd@roble.cl', 'confirmada', '2020-01-06 14:20:00+00', '2020-01-06 14:50:00+00', 0, 10, 12000);

do $$ begin raise notice 'OK: cancelar una reserva liberó su horario para una nueva reserva'; end $$;

rollback;
