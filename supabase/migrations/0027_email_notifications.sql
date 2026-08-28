-- Reemplaza las notificaciones por WhatsApp (0025/0026, n8n + Evolution API) por notificaciones
-- por correo. Se saca WhatsApp del camino de triggers/cron -- el código de n8n/Evolution queda
-- en el repo (docker/, n8n/) por si se retoma más adelante, pero deja de dispararse.
--
-- Decisión de arquitectura: se reusa notification_queue tal cual existía desde 0001 (ya tenía
-- status/attempts/scheduled_at/last_error, pensada para un worker con reintentos que WhatsApp
-- nunca terminó de usar) en vez de agregar columnas booleanas nuevas tipo confirmation_email_sent
-- -- esta tabla YA es ese mecanismo, más robusto (reintenta, audita el motivo del último error).
-- El channel 'email' ya existía en el enum desde el día 1 (0001_schema.sql), antes incluso de que
-- se implementara WhatsApp.
--
-- Quien realmente arma y envía el correo es la Edge Function send-notification (Resend); acá
-- solo se encola trabajo y se dispara un webhook interno con notification_id -- mismo patrón que
-- 0025 (pg_net + pg_cron) pero apuntando a nuestra propia función en vez de a n8n.

-- ---------- 0) desmontar el camino de WhatsApp ----------
drop trigger if exists bookings_notify_n8n_created on bookings;
drop trigger if exists bookings_notify_n8n_status_changed on bookings;
drop function if exists notify_n8n_booking_created();
drop function if exists notify_n8n_booking_status_changed();
drop function if exists whatsapp_enqueue_reminders();
select cron.unschedule('whatsapp-2h-reminders');
drop function if exists handle_whatsapp_reply(uuid, text, smallint);
drop function if exists whatsapp_webhook_config();
drop index if exists bookings_professional_phone_idx; -- solo existía para resolver el telefono que respondía por WhatsApp

-- notification_queue_reminder_once_idx (dedupe de recordatorio) sigue igual: es channel-agnostic.
-- mark_notification_result tampoco se toca: sigue siendo válida para cualquier canal.

-- ---------- 1) config: URL de send-notification + secreto compartido, en Vault ----------
-- Después de deployar, correr una sola vez con los valores reales:
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-notification', 'notification_dispatch_url');
--   select vault.create_secret('un-secreto-largo-random', 'notification_dispatch_secret');
-- (mismo secreto que NOTIFICATION_DISPATCH_SECRET en el entorno de la función). Mientras no
-- existan, process_notification_queue() detecta la ausencia y no hace nada -- no rompe la
-- creación de reservas ni el resto del cron.
create or replace function notification_dispatch_config() returns table (url text, secret text)
language sql stable security definer set search_path = public as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'notification_dispatch_url'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'notification_dispatch_secret');
$$;
revoke all on function notification_dispatch_config() from public, anon, authenticated;

-- ---------- 2) encolar confirmación al crear la reserva ----------
create or replace function notify_booking_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notification_queue (tenant_id, booking_id, channel, payload)
  values (new.tenant_id, new.id, 'email', jsonb_build_object('event', 'created'));
  return new;
end;
$$;

create trigger bookings_notify_created after insert on bookings
  for each row execute function notify_booking_created();

-- ---------- 3) reprogramar/cancelar/completar: resetea el recordatorio ----------
-- Si cambia start_at (reagendó), cualquier fila de recordatorio que existiera (pendiente o ya
-- enviada) queda huérfana de la hora vieja -- se borra para que el cron de abajo pueda encolar
-- una nueva para la hora nueva (el índice único de dedupe permitiría como máximo una por booking,
-- así que sin este borrado un reagendado se quedaría sin recordatorio para siempre).
-- Si pasa a un estado terminal (cancelada/completada/no-show), un recordatorio pendiente ya no
-- corresponde enviarlo.
create or replace function bookings_reset_reminder() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.start_at is distinct from old.start_at or new.status in ('cancelada', 'completada', 'no-show') then
    delete from notification_queue where booking_id = new.id and channel = 'reminder';
  end if;
  return new;
end;
$$;

create trigger bookings_reset_reminder_trg after update of start_at, status on bookings
  for each row execute function bookings_reset_reminder();

-- ---------- 4) cron: encolar recordatorio ~2h antes (ventana de 15 min) ----------
-- Si la reserva se crea con menos de 2h de anticipación, nunca cae en esta ventana futura --
-- por construcción no se manda un recordatorio atrasado, solo la confirmación del paso 2.
create or replace function enqueue_reminder_emails() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notification_queue (tenant_id, booking_id, channel, payload)
  select b.tenant_id, b.id, 'reminder', jsonb_build_object('event', 'reminder_2h')
  from bookings b
  where b.status in ('pendiente', 'confirmada')
    and b.start_at >= now() + interval '2 hours'
    and b.start_at <  now() + interval '2 hours 15 minutes'
  on conflict (booking_id) where channel = 'reminder' do nothing;
end;
$$;

select cron.schedule('enqueue-reminder-emails', '*/15 * * * *', $$select enqueue_reminder_emails();$$);

-- ---------- 5) cron: procesar la cola y disparar el envío real ----------
-- Corre cada minuto: toma pendientes (o fallidos con margen para reintentar) hasta un tope de
-- intentos, empuja scheduled_at 2 minutos hacia adelante ANTES de disparar (evita que el próximo
-- tick la vuelva a tomar mientras la Edge Function todavía está respondiendo) y dispara
-- send-notification vía pg_net. Quien marca 'sent'/'failed' de verdad es esa función, no acá.
create or replace function process_notification_queue() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cfg record;
  r record;
begin
  select * into v_cfg from notification_dispatch_config();
  if v_cfg.url is null then
    return;
  end if;

  for r in
    select id from notification_queue
    where status in ('pending', 'failed')
      and attempts < 5
      and scheduled_at <= now()
    order by scheduled_at
    limit 25
  loop
    update notification_queue
      set attempts = attempts + 1, scheduled_at = now() + interval '2 minutes'
      where id = r.id;

    perform net.http_post(
      url := v_cfg.url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', coalesce(v_cfg.secret, '')),
      body := jsonb_build_object('notification_id', r.id)
    );
  end loop;
end;
$$;

select cron.schedule('process-notification-queue', '* * * * *', $$select process_notification_queue();$$);
