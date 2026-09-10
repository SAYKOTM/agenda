-- Canal ARCOP (auditoría Ley 21.719, hallazgo "no existe ningún canal, formulario ni correo
-- dedicado para ejercer los derechos ARCOP"). Guarda las solicitudes de acceso, rectificación,
-- cancelación, oposición, portabilidad o bloqueo enviadas desde /solicitud-datos.
--
-- tenant_id queda null cuando la solicitud es sobre la cuenta de un dueño/profesional de la
-- plataforma (Agenda SaaS es responsable de esos datos); cuando el titular indica un salón
-- puntual, tenant_id apunta a ese tenant (el salón es responsable de los datos de sus propios
-- clientes, ver docs/auditoria-ley-21719.md §1) y su admin puede verla y resolverla desde el
-- panel. Las filas con tenant_id null solo son visibles con service_role (Supabase Studio) --
-- no existe un rol "super-admin de la plataforma" en este esquema.
create table privacy_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete set null,
  request_type text not null check (request_type in ('acceso', 'rectificacion', 'cancelacion', 'oposicion', 'portabilidad', 'bloqueo')),
  full_name text not null,
  email text not null,
  phone text,
  message text,
  status text not null default 'pendiente' check (status in ('pendiente', 'en_proceso', 'resuelta')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index privacy_requests_tenant_idx on privacy_requests (tenant_id);

alter table privacy_requests enable row level security;

-- Solo la Edge Function submit-privacy-request inserta (con service_role, valida y rate-limita
-- primero) -- mismo patrón que create-booking/signup-tenant. Sin policy de insert para
-- anon/authenticated a propósito.
create policy privacy_requests_admin_manage on privacy_requests for all
  using (tenant_id = current_tenant_id() and current_professional_role() = 'admin')
  with check (tenant_id = current_tenant_id() and current_professional_role() = 'admin');

-- RLS por sí sola no basta: PostgREST se conecta como el rol 'authenticated', que sin este grant
-- no tiene ni siquiera permiso a nivel de tabla (mismo patrón que 'customers' en
-- 0014_customers_and_loyalty.sql). Sin insert/delete: el alta es solo vía service_role desde la
-- Edge Function, y no hay caso de uso para que un admin borre una solicitud.
grant select, update on privacy_requests to authenticated;
