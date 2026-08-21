-- Esquema completo de Agenda SaaS: multi-tenant (salones/barberías), aislado por tenant_id,
-- con RLS en todas las tablas que no son catálogo público. Ver decisiones documentadas al
-- final de este archivo.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------- enums ----------
create type booking_status as enum ('pendiente', 'confirmada', 'completada', 'cancelada', 'no-show');
create type payment_method as enum ('efectivo', 'transferencia', 'online');
create type payment_status as enum ('pendiente', 'pagado', 'reembolsado');
create type professional_role as enum ('admin', 'professional');
create type exception_type as enum ('blocked', 'extra');
create type booking_source as enum ('public', 'panel');
create type notification_channel as enum ('email', 'whatsapp', 'ics', 'reminder');
create type notification_status as enum ('pending', 'sent', 'failed');

-- ---------- tenants ----------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  previous_slugs text[] not null default '{}',
  name text not null,
  mark text not null,
  tagline text,
  headline text,
  address text,
  phone text,
  instagram text,
  timezone text not null default 'America/Santiago',
  locale text not null default 'es-CL',
  currency text not null default 'CLP',
  rating numeric(2, 1),
  reviews_count integer not null default 0,
  theme jsonb not null default '{}'::jsonb,
  min_lead_time_min integer not null default 60,
  slot_interval_min integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants (id) on delete cascade,
  holder text not null,
  bank text not null,
  account_type text not null,
  account_number text not null,
  rut text not null,
  notice_email text not null
);

create table tenant_payment_methods (
  tenant_id uuid not null references tenants (id) on delete cascade,
  method payment_method not null,
  enabled boolean not null default true,
  gateway text,
  primary key (tenant_id, method)
);

-- ---------- catálogo ----------
create table categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (tenant_id, name)
);

create table services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  category_id uuid not null references categories (id) on delete restrict,
  name text not null,
  description text,
  duration_min integer not null check (duration_min > 0),
  price_clp integer not null check (price_clp >= 0),
  buffer_before_min integer not null default 0 check (buffer_before_min >= 0),
  buffer_after_min integer not null default 0 check (buffer_after_min >= 0),
  deposit_required boolean not null default false,
  deposit_amount_clp integer check (deposit_amount_clp is null or deposit_amount_clp >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_tenant_idx on services (tenant_id);
create index services_category_idx on services (category_id);

-- ---------- equipo ----------
create table professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  role_title text,
  initials text not null,
  avatar_url text,
  bio text,
  instagram text,
  whatsapp text,
  role professional_role not null default 'professional',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index professionals_tenant_idx on professionals (tenant_id);

create table professional_services (
  professional_id uuid not null references professionals (id) on delete cascade,
  service_id uuid not null references services (id) on delete cascade,
  primary key (professional_id, service_id)
);

-- ---------- disponibilidad ----------
create table availability_blocks (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = lunes .. 6 = domingo
  start_min integer not null check (start_min >= 0 and start_min < 1440),
  end_min integer not null check (end_min > start_min and end_min <= 1440)
);
create index availability_blocks_pro_idx on availability_blocks (professional_id, weekday);

create table availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals (id) on delete cascade,
  date date not null,
  type exception_type not null,
  start_min integer check (start_min is null or (start_min >= 0 and start_min < 1440)),
  end_min integer check (end_min is null or (end_min > 0 and end_min <= 1440)),
  reason text,
  created_at timestamptz not null default now(),
  constraint availability_exceptions_range_chk check (
    (type = 'extra' and start_min is not null and end_min is not null and end_min > start_min)
    or (type = 'blocked' and ((start_min is null and end_min is null) or (start_min is not null and end_min is not null and end_min > start_min)))
  )
);
create index availability_exceptions_pro_idx on availability_exceptions (professional_id, date);

-- ---------- reservas ----------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  professional_id uuid not null references professionals (id) on delete restrict,
  client_name text not null,
  client_phone text not null,
  client_email text not null,
  notes text,
  status booking_status not null default 'pendiente',
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  buffer_before_min integer not null default 0 check (buffer_before_min >= 0),
  buffer_after_min integer not null default 0 check (buffer_after_min >= 0),
  -- Rango bloqueado real (servicio + buffers), mantenido por trigger en vez de columna generada
  -- porque la aritmética de timestamptz + interval no se considera IMMUTABLE por Postgres.
  blocked_range tstzrange not null,
  total_price_clp integer not null check (total_price_clp >= 0),
  deposit_amount_clp integer not null default 0 check (deposit_amount_clp >= 0),
  payment_method payment_method,
  payment_status payment_status not null default 'pendiente',
  public_token uuid not null default gen_random_uuid() unique,
  source booking_source not null default 'public',
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  -- Ninguna reserva activa (no cancelada) puede solapar su rango bloqueado (servicio + buffers)
  -- con otra del mismo profesional. Esta es la garantía de "no doble reserva" a nivel de base
  -- de datos: aunque dos requests concurrentes pasen la validación de la app, solo uno gana aquí.
  exclude using gist (professional_id with =, blocked_range with &&) where (status <> 'cancelada')
);
create index bookings_tenant_idx on bookings (tenant_id);
create index bookings_professional_start_idx on bookings (professional_id, start_at);
create index bookings_public_token_idx on bookings (public_token);

create table booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  service_id uuid references services (id) on delete set null,
  name_snapshot text not null,
  price_snapshot integer not null check (price_snapshot >= 0),
  duration_snapshot integer not null check (duration_snapshot > 0),
  buffer_before_snapshot integer not null default 0,
  buffer_after_snapshot integer not null default 0,
  sort_order integer not null default 0
);
create index booking_items_booking_idx on booking_items (booking_id);

create table booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  from_status booking_status,
  to_status booking_status not null,
  changed_by text not null, -- 'client' | 'system' | id de professionals como texto
  note text,
  changed_at timestamptz not null default now()
);
create index booking_status_history_booking_idx on booking_status_history (booking_id);

-- ---------- panel de administración ----------
create table stations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

-- ---------- pagos y notificaciones (fase 5) ----------
create table payment_transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  gateway text not null,
  external_id text not null,
  status text not null,
  amount_clp integer not null,
  signature_verified boolean not null default false,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (gateway, external_id) -- idempotencia: un webhook reenviado no duplica el efecto
);

create table notification_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  booking_id uuid references bookings (id) on delete cascade,
  channel notification_channel not null,
  status notification_status not null default 'pending',
  attempts integer not null default 0,
  payload jsonb,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);
create index notification_queue_pending_idx on notification_queue (status, scheduled_at);

-- ---------- funciones de apoyo ----------

create or replace function set_booking_blocked_range() returns trigger
language plpgsql as $$
begin
  new.blocked_range = tstzrange(
    new.start_at - make_interval(mins => new.buffer_before_min),
    new.end_at + make_interval(mins => new.buffer_after_min),
    '[)'
  );
  return new;
end;
$$;
create trigger bookings_set_blocked_range before insert or update
  of start_at, end_at, buffer_before_min, buffer_after_min on bookings
  for each row execute function set_booking_blocked_range();

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger tenants_set_updated_at before update on tenants
  for each row execute function set_updated_at();
create trigger services_set_updated_at before update on services
  for each row execute function set_updated_at();

-- Registra automáticamente cada cambio de estado de una reserva (auditoría, fase 3).
create or replace function log_booking_status_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into booking_status_history (booking_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end, new.status, 'system');
  end if;
  return new;
end;
$$;
create trigger bookings_log_status_change after insert or update on bookings
  for each row execute function log_booking_status_change();

-- tenant_id del profesional autenticado actualmente (null si no hay sesión de panel o no es profesional)
create or replace function current_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from professionals where auth_user_id = auth.uid() and active = true limit 1;
$$;

create or replace function current_professional_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from professionals where auth_user_id = auth.uid() and active = true limit 1;
$$;

create or replace function current_professional_role() returns professional_role
language sql stable security definer set search_path = public as $$
  select role from professionals where auth_user_id = auth.uid() and active = true limit 1;
$$;
