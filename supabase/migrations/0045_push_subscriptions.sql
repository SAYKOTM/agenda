-- Avisos push para el profesional (PWA instalable del panel, ver public/sw.js).
--
-- Es Web Push estándar (VAPID, RFC 8291), no FCM: el navegador entrega una suscripción con un
-- endpoint propio del fabricante (Google, Mozilla, Apple) más dos claves, y con eso la Edge
-- Function send-notification cifra y manda el aviso. Por eso no hay ninguna dependencia de
-- Firebase en el proyecto y todo el camino sigue siendo Supabase.
--
-- El canal nuevo se suma al enum que ya existía desde 0001 y reusa notification_queue igual que
-- hizo el correo en 0027: misma cola, mismo cron, mismos reintentos. Los triggers que encolan
-- están en 0046 y no acá porque Postgres no permite USAR un valor de enum en la misma
-- transacción en que se agrega.
alter type notification_channel add value if not exists 'push';

-- Una fila por dispositivo, no por persona: el mismo profesional puede tener el aviso activo en
-- su celular y no en el computador del mesón. El endpoint es único global -- si el navegador
-- reinstala la app genera uno nuevo, y el viejo queda muerto hasta que un 404/410 lo borre
-- (send-notification lo hace solo).
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  professional_id uuid not null references professionals (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null, -- clave pública del navegador (base64url)
  auth text not null,   -- secreto de autenticación de la suscripción (base64url)
  user_agent text,
  enabled boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_professional_idx on push_subscriptions (professional_id) where enabled;

create trigger push_subscriptions_set_updated_at before update on push_subscriptions
  for each row execute function set_updated_at();

alter table push_subscriptions enable row level security;

-- Cada profesional administra únicamente sus propios dispositivos. Ni siquiera un admin del
-- salón tiene por qué ver los endpoints de sus empleados: son identificadores del teléfono
-- personal de cada uno, no información del negocio (mismo criterio que 0039 con la ficha de
-- clientes por profesional).
create policy push_subscriptions_own_read on push_subscriptions for select
  using (professional_id = current_professional_id());
create policy push_subscriptions_own_insert on push_subscriptions for insert
  with check (professional_id = current_professional_id() and tenant_id = current_tenant_id());
create policy push_subscriptions_own_update on push_subscriptions for update
  using (professional_id = current_professional_id())
  with check (professional_id = current_professional_id());
create policy push_subscriptions_own_delete on push_subscriptions for delete
  using (professional_id = current_professional_id());

-- RLS no basta: PostgREST se conecta como 'authenticated' y sin el grant no tiene permiso ni a
-- nivel de tabla. anon queda afuera por completo -- un visitante del sitio público no se suscribe
-- a nada.
grant select, insert, update, delete on push_subscriptions to authenticated;

-- Alta de la suscripción vía función security definer y no con un upsert directo del cliente por
-- un caso muy concreto de barbería: el computador del mesón es compartido. El endpoint identifica
-- al NAVEGADOR, no a la persona, así que si María se suscribe ahí y después entra Camila, el
-- upsert de Camila chocaría con la fila de María y RLS lo rechazaría (no es suya) dejándole un
-- error sin salida. Acá la suscripción simplemente cambia de dueño: manda quien está con la
-- sesión abierta en ese navegador.
create or replace function save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_professional uuid := current_professional_id();
  v_tenant uuid := current_tenant_id();
begin
  if v_professional is null or v_tenant is null then
    raise exception 'no hay una sesión de panel activa';
  end if;

  delete from push_subscriptions where endpoint = p_endpoint and professional_id is distinct from v_professional;

  insert into push_subscriptions (tenant_id, professional_id, endpoint, p256dh, auth, user_agent)
  values (v_tenant, v_professional, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        enabled = true,
        last_error = null,
        updated_at = now();
end;
$$;
revoke all on function save_push_subscription(text, text, text, text) from public, anon;
grant execute on function save_push_subscription(text, text, text, text) to authenticated;
