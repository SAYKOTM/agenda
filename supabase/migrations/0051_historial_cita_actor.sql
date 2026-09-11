-- El historial de estados de una cita (booking_status_history) ya se llenaba solo desde la
-- migración 0001, pero grababa 'system' en `changed_by` para TODO, incluido el cambio que acaba
-- de hacer una persona apretando un botón en el panel. Ahora que el historial se muestra en el
-- detalle de la cita, ese dato importa: la pregunta que se responde mirándolo es "¿quién canceló
-- esto y cuándo?".
--
-- current_professional_id() resuelve el profesional a partir de auth.uid(), así que queda su id
-- cuando el cambio viene del panel y 'system' cuando viene de una Edge Function con service role
-- (reserva creada por un cliente, cancelación por token, purga automática): ahí no hay persona
-- del salón a la que atribuirle el cambio.
create or replace function log_booking_status_change() returns trigger
language plpgsql as $$
declare
  v_actor text;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    v_actor := coalesce(current_professional_id()::text, 'system');
    insert into booking_status_history (booking_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end, new.status, v_actor);
  end if;
  return new;
end;
$$;
