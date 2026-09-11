-- Lista de espera: cuando el cliente quiere un día que ya está lleno, deja su nombre y su
-- WhatsApp en vez de irse. Al liberarse una hora de ese día, el profesional recibe un aviso push
-- y desde el panel le escribe por WhatsApp con un toque.
--
-- Por qué el aviso va al profesional y no al cliente: los clientes de una barbería no instalan la
-- app, y el push web en iPhone solo funciona con la app agregada a la pantalla de inicio. El
-- profesional sí la tiene instalada, así que el sistema le avisa a él y el mensaje al cliente sale
-- por WhatsApp, escrito de antemano y enviado por una persona. El día que exista la API oficial de
-- WhatsApp Business, ese último paso se automatiza sin tocar nada de lo de acá.

create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  -- null = "cualquiera disponible": le sirve cualquier hueco de ese día en el salón.
  professional_id uuid references professionals (id) on delete cascade,
  client_name text not null,
  client_phone text not null,
  desired_date date not null,
  -- Los servicios que quería, para que el mensaje diga "tu corte + barba" y el link de reserva
  -- pueda llevarlos precargados. Sin FK a propósito: si el salón borra un servicio, la entrada de
  -- la lista no tiene por qué desaparecer ni bloquear el borrado.
  service_ids uuid[] not null default '{}',
  note text,
  status text not null default 'esperando'
    check (status in ('esperando', 'avisado', 'reservado', 'descartado')),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
-- El orden de llegada es el orden en que se ofrece el hueco, así que created_at entra en el índice.
create index waitlist_entries_lookup_idx on waitlist_entries (tenant_id, desired_date, status, created_at);

alter table waitlist_entries enable row level security;

-- Solo el salón lee y administra su lista. No hay política de insert para anon a propósito: el
-- alta pública entra por la Edge Function join-waitlist (service role), que valida el salón y
-- aplica rate limiting igual que create-booking -- un insert abierto desde el navegador sería una
-- invitación a llenar la tabla de basura con el nombre y el teléfono de cualquiera.
create policy waitlist_entries_manage on waitlist_entries for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

grant select, insert, update, delete on waitlist_entries to authenticated;

-- ---------- aviso al profesional cuando se libera una hora ----------
-- Se apoya en la misma cola y el mismo canal push que los avisos de cita (0046): el booking_id de
-- la reserva cancelada le da a send-notification la fecha, la hora y el profesional.
create or replace function enqueue_waitlist_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_timezone text;
  v_date date;
  v_waiting integer;
begin
  if new.status is not distinct from old.status or new.status <> 'cancelada' then
    return new;
  end if;

  select timezone into v_timezone from tenants where id = new.tenant_id;
  v_date := (new.start_at at time zone coalesce(v_timezone, 'America/Santiago'))::date;

  select count(*) into v_waiting
  from waitlist_entries w
  where w.tenant_id = new.tenant_id
    and w.status = 'esperando'
    and w.desired_date = v_date
    and (w.professional_id is null or w.professional_id = new.professional_id);

  if v_waiting > 0 then
    insert into notification_queue (tenant_id, booking_id, channel, payload)
    values (
      new.tenant_id,
      new.id,
      'push',
      jsonb_build_object('event', 'waitlist', 'professional_id', new.professional_id, 'waiting', v_waiting)
    );
  end if;

  return new;
end;
$$;

create trigger bookings_enqueue_waitlist_alert
  after update of status on bookings
  for each row execute function enqueue_waitlist_alert();

-- ---------- retención ----------
-- La entrada guarda nombre y teléfono de alguien que ni siquiera llegó a reservar: pasada la
-- fecha que pedía no le sirve a nadie y no hay razón para conservarla. Se suma a la purga que ya
-- corre todas las noches (0040 + 0043) en vez de programar un cron nuevo.
create or replace function purge_stale_tenant_customer_data() returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_cutoff timestamptz := now() - interval '180 days';
begin
  update customers c set
    name = 'Cliente eliminado',
    -- phone es NOT NULL y tiene unique(tenant_id, phone): un placeholder fijo chocaría entre
    -- varios clientes anonimizados del mismo tenant, así que se deriva de c.id (único por fila).
    phone = 'eliminado-' || c.id::text,
    email = null
  from tenants t
  where t.id = c.tenant_id
    and t.subscription_status = 'canceled'
    and t.updated_at < v_cutoff
    and c.name <> 'Cliente eliminado';

  update bookings b set
    client_name = 'Cliente eliminado',
    client_phone = '',
    client_email = 'eliminado@invalido.local',
    notes = null
  from tenants t
  where t.id = b.tenant_id
    and t.subscription_status = 'canceled'
    and t.updated_at < v_cutoff
    and b.client_name <> 'Cliente eliminado';

  delete from waitlist_entries where desired_date < current_date - interval '60 days';
end;
$$;
