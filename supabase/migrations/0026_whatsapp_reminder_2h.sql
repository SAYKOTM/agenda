-- Ajusta el recordatorio de WhatsApp: pasa de 24h antes a 2h antes, el mismo dia del turno.
-- Reemplaza la funcion completa (misma logica de dedupe con el indice unico parcial de 0025,
-- que sigue siendo valido: una sola fila 'reminder' por reserva sin importar la ventana usada).
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
      and b.start_at >= now() + interval '2 hours'
      and b.start_at <  now() + interval '2 hours 15 minutes'
  loop
    v_notification_id := null;
    insert into notification_queue (tenant_id, booking_id, channel, payload)
    values (r.tenant_id, r.id, 'reminder', jsonb_build_object('event', 'reminder_2h'))
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

-- cron.schedule() crea un job nuevo si el nombre difiere del anterior en vez de reemplazarlo;
-- hay que desprogramar el job de 0025 explicitamente para no dejar dos jobs corriendo la misma funcion.
select cron.unschedule('whatsapp-24h-reminders');
select cron.schedule('whatsapp-2h-reminders', '*/15 * * * *', $$select whatsapp_enqueue_reminders();$$);
