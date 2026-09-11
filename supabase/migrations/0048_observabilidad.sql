-- Monitoreo: errores del navegador y alarma cuando la cola de notificaciones se traba.
--
-- El problema que resuelve es concreto y ya pasó: la cola de producción acumuló filas en 'failed'
-- (Resend rechazando los correos con 403 por dominio sin verificar) y nadie se enteró. Desde
-- afuera eso se ve como "a mis clientes no les llega la confirmación", y el salón lo descubre
-- antes que vos. Lo mismo vale para un error de JavaScript que rompa el wizard de reserva un
-- sábado: hoy no existe ningún lugar donde quede registrado.
--
-- Se arma con lo que el proyecto ya tiene (pg_cron + pg_net + Resend) en vez de sumar un servicio
-- externo: una tabla donde caen los errores del navegador, una tabla de alertas con deduplicación
-- y un cron que revisa la salud cada 15 minutos y avisa por correo.

-- ---------- 1) errores del navegador ----------

-- Sin tenant_id obligatorio a propósito: la mayoría de los errores ocurren en la página pública de
-- reservas, donde todavía no hay sesión ni salón resuelto.
create table client_errors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete set null,
  message text not null,
  stack text,
  url text,
  user_agent text,
  kind text not null default 'error' check (kind in ('error', 'unhandledrejection', 'render')),
  created_at timestamptz not null default now()
);
create index client_errors_recent_idx on client_errors (created_at desc);

alter table client_errors enable row level security;

-- Ninguna policy para anon/authenticated, igual que privacy_requests (0041): la única vía de
-- entrada es la Edge Function report-error con service_role, que además limita por IP. Leerlos es
-- tarea de operación, desde Studio -- no son datos que el panel de un salón deba mostrar.
grant select on client_errors to service_role;

-- Los errores son ruido con fecha de vencimiento: a los 30 días no sirven para nada y solo
-- acumulan stack traces que pueden incluir fragmentos de URL con datos.
create or replace function purge_old_client_errors() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_deleted integer;
begin
  delete from client_errors where created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function purge_old_client_errors() from public, anon, authenticated;
select cron.schedule('purge-old-client-errors', '15 4 * * *', $$select purge_old_client_errors();$$);

-- ---------- 2) alertas de sistema ----------

create table system_alerts (
  id uuid primary key default gen_random_uuid(),
  key text not null, -- identificador del tipo de problema, para no repetir el mismo aviso
  severity text not null default 'warning' check (severity in ('warning', 'critical')),
  title text not null,
  detail text,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  resolved_at timestamptz
);
create index system_alerts_open_idx on system_alerts (key, created_at desc) where resolved_at is null;

alter table system_alerts enable row level security;
grant select on system_alerts to service_role;

-- ---------- 3) configuración del despacho ----------

-- Mismo patrón que notification_dispatch_config() (0027): la URL y el secreto viven en el Vault,
-- no en el código. Correr una vez con los valores reales:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/ops-alert', 'ops_alert_url');
-- El secreto compartido se reusa a propósito -- es el mismo tipo de llamada interna de Postgres a
-- una Edge Function y tener dos secretos para lo mismo solo agrega una cosa más que rotar.
create or replace function ops_alert_config() returns table (url text, secret text)
language sql stable security definer set search_path = public as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'ops_alert_url'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'notification_dispatch_secret');
$$;
revoke all on function ops_alert_config() from public, anon, authenticated;

-- Levanta una alerta y dispara el correo, salvo que ya haya una igual sin resolver en las últimas
-- 6 horas. Sin esa ventana, un problema que dura un fin de semana entero significa 192 correos
-- idénticos y el efecto es el contrario al buscado: se dejan de leer.
create or replace function raise_system_alert(p_key text, p_severity text, p_title text, p_detail text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cfg record;
  v_id uuid;
begin
  if exists (
    select 1 from system_alerts
    where key = p_key and resolved_at is null and created_at > now() - interval '6 hours'
  ) then
    return null;
  end if;

  insert into system_alerts (key, severity, title, detail)
  values (p_key, p_severity, p_title, p_detail)
  returning id into v_id;

  select * into v_cfg from ops_alert_config();
  if v_cfg.url is null then
    -- Sin configurar, la alerta igual queda registrada en la tabla: se pierde el correo, no el
    -- hallazgo.
    return v_id;
  end if;

  perform net.http_post(
    url := v_cfg.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', coalesce(v_cfg.secret, '')),
    body := jsonb_build_object('alert_id', v_id)
  );
  return v_id;
end;
$$;
revoke all on function raise_system_alert(text, text, text, text) from public, anon, authenticated;

-- ---------- 4) el chequeo de salud ----------

-- Tres cosas que, cuando se rompen, hoy no las nota nadie hasta que se queja un salón.
create or replace function check_system_health() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dead integer;
  v_failed integer;
  v_stuck integer;
  v_errors integer;
  v_last_error text;
begin
  -- (a) Notificaciones muertas: agotaron los 5 intentos que permite process_notification_queue, así
  -- que NUNCA van a salir. Acá no hace falta adivinar un umbral -- una sola ya significa que un
  -- cliente se quedó sin su confirmación y nadie lo va a reintentar.
  select count(*), max(last_error) into v_dead, v_last_error
  from notification_queue
  where status = 'failed' and attempts >= 5 and scheduled_at > now() - interval '7 days';

  if v_dead >= 1 then
    perform raise_system_alert(
      'notification_queue_dead',
      'critical',
      v_dead || case when v_dead = 1 then ' notificación que ya no se reintentará' else ' notificaciones que ya no se reintentarán' end,
      'Agotaron los 5 intentos. Último error: ' || coalesce(v_last_error, 'sin detalle')
        || chr(10) || chr(10)
        || 'Revisar: select id, channel, attempts, last_error from notification_queue where status = ''failed'' order by scheduled_at desc;'
    );
  end if;

  -- (b) Muchos fallos recientes que todavía tienen reintentos por delante: suele ser el proveedor
  -- de correo caído, y conviene saberlo antes de que agoten los intentos.
  select count(*), max(last_error) into v_failed, v_last_error
  from notification_queue
  where status = 'failed' and attempts < 5 and scheduled_at > now() - interval '24 hours';

  if v_failed >= 3 then
    perform raise_system_alert(
      'notification_queue_failing',
      'warning',
      v_failed || ' notificaciones fallando (aún con reintentos)',
      'Último error: ' || coalesce(v_last_error, 'sin detalle')
    );
  end if;

  -- (c) Cola trabada: filas pendientes que el cron debería haber tomado hace rato. Señal de que
  -- process_notification_queue dejó de correr o de que pg_net no está despachando.
  select count(*) into v_stuck
  from notification_queue
  where status = 'pending' and scheduled_at < now() - interval '30 minutes';

  if v_stuck >= 1 then
    perform raise_system_alert(
      'notification_queue_stuck',
      'critical',
      v_stuck || ' notificaciones pendientes hace más de 30 minutos',
      'La cola no se está procesando. Revisar que el cron process-notification-queue siga activo: select * from cron.job;'
    );
  end if;

  -- (d) Errores del navegador: un pico casi siempre significa que un deploy rompió algo.
  select count(*) into v_errors from client_errors where created_at > now() - interval '1 hour';

  if v_errors >= 10 then
    perform raise_system_alert(
      'client_errors_spike',
      'warning',
      v_errors || ' errores de navegador en la última hora',
      'Revisar: select message, count(*) from client_errors where created_at > now() - interval ''1 hour'' group by 1 order by 2 desc;'
    );
  end if;
end;
$$;
revoke all on function check_system_health() from public, anon, authenticated;

-- Cada 15 minutos: suficiente para enterarse el mismo día de trabajo, sin convertirse en ruido.
select cron.schedule('check-system-health', '*/15 * * * *', $$select check_system_health();$$);
