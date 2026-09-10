-- Encolado de los avisos push al profesional. Va en un archivo aparte de 0045 porque Postgres no
-- deja usar un valor de enum ('push') en la misma transacción en la que se agregó.
--
-- Qué se avisa: una cita nueva, una cancelación (o no-show) y un cambio de hora. No se avisa cada
-- update de la fila -- el trigger escucha solo esas tres columnas.

-- Regla clave: no avisarle a quien acaba de hacer el cambio. Si el propio profesional cancela una
-- cita desde su panel, auth.uid() coincide con su auth_user_id y no tiene sentido hacerle sonar
-- el teléfono por su propia acción. Cuando reserva un cliente desde la web pública, auth.uid() es
-- null (la reserva entra por una función security definer llamada con anon) y el aviso sale; si
-- el cambio lo hace un admin o un compañero, tampoco coincide y el aviso también sale.
create or replace function enqueue_professional_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event text;
  v_actor uuid;
begin
  if TG_OP = 'INSERT' then
    v_event := 'created';
  elsif new.status is distinct from old.status and new.status in ('cancelada', 'no-show') then
    v_event := 'cancelled';
  elsif new.start_at is distinct from old.start_at then
    v_event := 'rescheduled';
  elsif new.professional_id is distinct from old.professional_id then
    -- Reasignada: para quien la recibe es una cita nueva, y al que la tenía se le avisa abajo.
    v_event := 'created';
  else
    return new;
  end if;

  select auth_user_id into v_actor from professionals where id = new.professional_id;
  if v_actor is null or v_actor is distinct from auth.uid() then
    insert into notification_queue (tenant_id, booking_id, channel, payload)
    values (
      new.tenant_id,
      new.id,
      'push',
      jsonb_build_object('event', v_event, 'professional_id', new.professional_id)
    );
  end if;

  -- El profesional al que le SACARON la cita también tiene que enterarse: para su agenda del día
  -- eso es exactamente una cancelación. El destinatario viaja en el payload porque la fila de
  -- bookings ya apunta al profesional nuevo.
  if TG_OP = 'UPDATE' and new.professional_id is distinct from old.professional_id and old.professional_id is not null then
    insert into notification_queue (tenant_id, booking_id, channel, payload)
    values (
      new.tenant_id,
      new.id,
      'push',
      jsonb_build_object('event', 'cancelled', 'professional_id', old.professional_id)
    );
  end if;

  return new;
end;
$$;

create trigger bookings_enqueue_professional_push
  after insert or update of start_at, status, professional_id on bookings
  for each row execute function enqueue_professional_push();

-- Limpieza: una suscripción sin uso durante mucho tiempo es un teléfono que ya no existe. No hace
-- falta un cron dedicado -- send-notification borra sola las que el servicio de push rechaza con
-- 404/410, que es la señal confiable. Esta función queda por si hace falta pasar la escoba a mano
-- desde Studio.
create or replace function purge_stale_push_subscriptions(p_days integer default 180) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_deleted integer;
begin
  delete from push_subscriptions where updated_at < now() - make_interval(days => p_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function purge_stale_push_subscriptions(integer) from public, anon, authenticated;
