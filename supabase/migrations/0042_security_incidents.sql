-- Registro de incidentes/brechas de seguridad (auditoría Ley 21.719, art. 14 sexies inciso 2:
-- obligación de llevar constancia de vulneraciones aunque no se notifiquen). No hay un rol
-- "super-admin de la plataforma" en este esquema (ver 0041_privacy_requests.sql), así que esta
-- tabla es deliberadamente de solo service_role -- se llena y consulta desde Supabase Studio por
-- quien administra Agenda SaaS, no desde el panel de ningún tenant. RLS habilitada sin ninguna
-- policy para anon/authenticated equivale a denegar todo acceso vía la API pública.
create table security_incidents (
  id uuid primary key default gen_random_uuid(),
  detected_at timestamptz not null default now(),
  reported_by text,
  nature text not null,
  affected_data_categories text,
  affected_subjects_estimate text,
  measures_taken text not null,
  authority_notified boolean not null default false,
  subjects_notified boolean not null default false,
  status text not null default 'abierto' check (status in ('abierto', 'contenido', 'cerrado')),
  closed_at timestamptz,
  notes text
);

alter table security_incidents enable row level security;
