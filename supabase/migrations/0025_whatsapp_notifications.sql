-- Notificaciones y recordatorios transaccionales por WhatsApp (n8n + Evolution API).
--
-- Decisión de arquitectura (elegida por costo/escala, no requiere infraestructura nueva):
-- en vez de que n8n haga polling constante sobre "bookings", Postgres empuja los eventos con
-- pg_net (extensión oficial de Supabase, ya corre dentro del mismo Postgres, sin servicio
-- adicional) y pg_cron resuelve el recordatorio de 24h (que por definición no es un evento de
-- fila, sino el paso del tiempo: ningún Database Webhook puede dispararlo solo). Ambas
-- extensiones son gratuitas en cualquier plan de Supabase. "notification_queue" (ya existía en
-- 0001, sin nada que la llenara) pasa a ser el registro auditable de qué se encoló y qué
-- resultado tuvo cada envío.
--
-- Convención elegida para Evolution API: cada profesional tiene su propia instancia de
-- WhatsApp (su propio número), y el nombre de esa instancia en Evolution ES el
-- professionals.id (uuid) -- no hace falta una columna nueva para mapear instancia -> tenant,
-- ya existe la FK.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- config: URL y secreto del webhook de n8n, guardados en Vault (no en el repo) ----------
-- Después de deployar, correr una sola vez con los valores reales:
--   select vault.create_secret('https://tu-n8n.dominio/webhook/agenda', 'n8n_webhook_url');
--   select vault.create_secret('un-secreto-largo-random', 'n8n_webhook_secret');
-- Mientras no existan, las funciones de abajo detectan la ausencia y no intentan el POST (no
-- rompen la creación de la reserva ni el cron).
create or replace function whatsapp_webhook_config() returns table (url text, secret text)
language sql stable security definer set search_path = public as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'n8n_webhook_url'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'n8n_webhook_secret');
$$;

-- ---------- dedupe de recordatorios: una sola fila 'reminder' por reserva ----------
create unique index notification_queue_reminder_once_idx
  on notification_queue (booking_id) where channel = 'reminder';

-- índice de apoyo para resolver "a qué reserva corresponde este teléfono que respondió" rápido
create index bookings_professional_phone_idx on bookings (professional_id, client_phone)
  where status in ('pendiente', 'confirmada');

-- ---------- 1) confirmación al crear la reserva ----------
create or replace function notify_n8n_booking_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cfg record;
  v_notification_id uuid;
  v_tenant_slug text;
  v_tenant_timezone text;
begin
  insert into notification_queue (tenant_id, booking_id, channel, payload)
  values (new.tenant_id, new.id, 'whatsapp', jsonb_build_object('event', 'created'))
  returning id into v_notification_id;

  select slug, timezone into v_tenant_slug, v_tenant_timezone from tenants where id = new.tenant_id;

  select * into v_cfg from whatsapp_webhook_config();
  if v_cfg.url is not null then
    perform net.http_post(
      url := v_cfg.url || '/booking-created',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', coalesce(v_cfg.secret, '')),
      body := jsonb_build_object(
        'notification_id', v_notification_id,
        'booking_id', new.id,
        'tenant_id', new.tenant_id,
        'tenant_slug', v_tenant_slug,
        'tenant_timezone', v_tenant_timezone,
        'professional_id', new.professional_id,
        'client_name', new.client_name,
        'client_phone', new.client_phone,
        'start_at', new.start_at,
        'public_token', new.public_token
      )
    );
  end if;
  return new;
end;
$$;

create trigger bookings_notify_n8n_created after insert on bookings
  for each row execute function notify_n8n_booking_created();

-- ---------- 2) aviso cuando cambia el estado (ej. el profesional confirma/cancela desde el panel) ----------
-- Guarda anti-loop: si el cambio de estado vino de handle_whatsapp_reply (el cliente respondiendo
-- por WhatsApp), no hay que volver a avisarle a n8n de su propia acción.
create or replace function notify_n8n_booking_status_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cfg record;
  v_notification_id uuid;
  v_tenant_slug text;
  v_tenant_timezone text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if current_setting('agenda.whatsapp_reply', true) = 'true' then
    return new;
  end if;

  insert into notification_queue (tenant_id, booking_id, channel, payload)
  values (new.tenant_id, new.id, 'whatsapp', jsonb_build_object('event', 'status_changed', 'status', new.status))
  returning id into v_notification_id;

  select slug, timezone into v_tenant_slug, v_tenant_timezone from tenants where id = new.tenant_id;

  select * into v_cfg from whatsapp_webhook_config();
  if v_cfg.url is not null then
    perform net.http_post(
      url := v_cfg.url || '/booking-status-changed',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', coalesce(v_cfg.secret, '')),
      body := jsonb_build_object(
        'notification_id', v_notification_id,
        'booking_id', new.id,
        'tenant_id', new.tenant_id,
        'tenant_slug', v_tenant_slug,
        'tenant_timezone', v_tenant_timezone,
        'professional_id', new.professional_id,
        'client_name', new.client_name,
        'client_phone', new.client_phone,
        'start_at', new.start_at,
        'status', new.status,
        'public_token', new.public_token
      )
    );
  end if;
  return new;
end;
$$;

create trigger bookings_notify_n8n_status_changed after update of status on bookings
  for each row execute function notify_n8n_booking_status_changed();

-- ---------- 3) recordatorio 24h antes (cron, no un webhook: no hay fila cambiando) ----------
create or replace function whatsapp_enqueue_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cfg record;
  r record;
  v_notification_id uuid;
begin
  select * into v_cfg from whatsapp_webhook_config();

  for r in
    select b.*, t.slug as tenant_slug, t.timezone as tenant_timezone
    from bookings b
    join tenants t on t.id = b.tenant_id
    where b.status in ('pendiente', 'confirmada')
      and b.start_at >= now() + interval '24 hours'
      and b.start_at <  now() + interval '24 hours 15 minutes'
  loop
    v_notification_id := null;
    insert into notification_queue (tenant_id, booking_id, channel, payload)
    values (r.tenant_id, r.id, 'reminder', jsonb_build_object('event', 'reminder_24h'))
    on conflict (booking_id) where channel = 'reminder' do nothing
    returning id into v_notification_id;

    if v_notification_id is null then
      continue; -- ya se había encolado (dedupe por el índice único parcial)
    end if;

    if v_cfg.url is not null then
      perform net.http_post(
        url := v_cfg.url || '/booking-reminder',
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', coalesce(v_cfg.secret, '')),
        body := jsonb_build_object(
          'notification_id', v_notification_id,
          'booking_id', r.id,
          'tenant_id', r.tenant_id,
          'tenant_slug', r.tenant_slug,
          'tenant_timezone', r.tenant_timezone,
          'professional_id', r.professional_id,
          'client_name', r.client_name,
          'client_phone', r.client_phone,
          'start_at', r.start_at,
          'public_token', r.public_token
        )
      );
    end if;
  end loop;
end;
$$;

-- Cada 15 min (mismo grano que la grilla de slots de 0021) para no perder ventanas de reserva.
select cron.schedule('whatsapp-24h-reminders', '*/15 * * * *', $$select whatsapp_enqueue_reminders();$$);

-- ---------- 4) endpoint seguro para que n8n aplique la respuesta del cliente (1/2/3) ----------
-- Único punto de escritura para esta funcionalidad: valida la transición, resuelve a qué reserva
-- se refiere el teléfono que respondió (no hay booking_id en un mensaje de WhatsApp, solo el
-- número) y deja auditoría en booking_status_history. Se llama desde n8n vía PostgREST
-- (POST /rest/v1/rpc/handle_whatsapp_reply) usando la service_role key -- nunca desde el navegador.
create or replace function handle_whatsapp_reply(
  p_professional_id uuid,
  p_client_phone text,
  p_option smallint -- 1 = confirmar, 2 = pedir reprogramar, 3 = cancelar
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings;
  v_new_status booking_status;
  v_tenant_slug text;
  v_tenant_timezone text;
begin
  select * into v_booking
    from bookings b
    where b.professional_id = p_professional_id
      and b.status in ('pendiente', 'confirmada')
      and right(regexp_replace(b.client_phone, '\D', '', 'g'), 9)
        = right(regexp_replace(p_client_phone, '\D', '', 'g'), 9)
      and b.start_at > now()
    order by b.start_at asc
    limit 1;

  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- variable record aparte (plpgsql no permite mezclar un target %ROWTYPE con otros targets
  -- escalares en el mismo "select ... into"), de ahí la segunda consulta.
  select t.slug, t.timezone into v_tenant_slug, v_tenant_timezone
    from tenants t where t.id = v_booking.tenant_id;

  if p_option = 1 and v_booking.status = 'pendiente' then
    v_new_status := 'confirmada';
  elsif p_option = 3 then
    v_new_status := 'cancelada';
  else
    -- opción 2 (reprogramar) u opción sin transición válida: no se toca el estado, n8n responde
    -- con el link de autogestión (bookings.public_token) para elegir nuevo horario en el flujo
    -- público existente (reschedule-booking), en vez de intentar resolver un slot desde un dígito.
    -- tenant_slug/tenant_timezone van sueltos (no adentro de "booking") para que n8n arme el link
    -- ("<APP_BASE_URL>/" || tenant_slug || "/reserva/" || booking.public_token) y formatee la hora
    -- sin tener que hacer una segunda consulta a Supabase.
    return jsonb_build_object(
      'ok', true, 'action', 'no_status_change', 'booking', to_jsonb(v_booking),
      'tenant_slug', v_tenant_slug, 'tenant_timezone', v_tenant_timezone
    );
  end if;

  perform set_config('agenda.whatsapp_reply', 'true', true);

  update bookings
  set status = v_new_status,
      cancelled_at = case when v_new_status = 'cancelada' then now() else cancelled_at end
  where id = v_booking.id
  returning * into v_booking;

  insert into booking_status_history (booking_id, from_status, to_status, changed_by, note)
  values (v_booking.id, case when v_new_status = 'confirmada' then 'pendiente'::booking_status else null end, v_new_status, 'client_whatsapp', 'respuesta whatsapp: opción ' || p_option);

  return jsonb_build_object(
    'ok', true, 'action', 'status_updated', 'booking', to_jsonb(v_booking),
    'tenant_slug', v_tenant_slug, 'tenant_timezone', v_tenant_timezone
  );
end;
$$;

revoke all on function handle_whatsapp_reply(uuid, text, smallint) from public, anon, authenticated;
grant execute on function handle_whatsapp_reply(uuid, text, smallint) to service_role;

-- ---------- 5) cierre del loop: n8n marca el resultado real del envío por Evolution API ----------
create or replace function mark_notification_result(
  p_notification_id uuid,
  p_success boolean,
  p_error text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update notification_queue
  set status = case when p_success then 'sent'::notification_status else 'failed'::notification_status end,
      sent_at = case when p_success then now() else sent_at end,
      attempts = attempts + 1,
      last_error = p_error
  where id = p_notification_id;
end;
$$;

revoke all on function mark_notification_result(uuid, boolean, text) from public, anon, authenticated;
grant execute on function mark_notification_result(uuid, boolean, text) to service_role;

revoke all on function whatsapp_webhook_config() from public, anon, authenticated;
