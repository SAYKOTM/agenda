-- Perfil público por profesional: link propio para compartir, galería de trabajos y corrección
-- del ranking de servicios (una reserva cancelada o todavía sin confirmar no es "demanda").

-- ---------- 1. link propio: /<slug-del-salon>/con/<public_slug> ----------
-- El profesional comparte SU link con sus clientes (ver "Tu link público" en Panel → Perfil).
-- El slug se genera una sola vez a partir del nombre; cambiar el nombre público después no lo
-- mueve, para no romper links ya repartidos por WhatsApp.
create or replace function slugify_text(p_text text)
returns text language sql immutable as $$
  select nullif(
    trim(both '-' from regexp_replace(
      lower(translate(coalesce(p_text, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
      '[^a-z0-9]+', '-', 'g')),
    '');
$$;

alter table professionals add column public_slug text;

-- Backfill: slug del nombre, con sufijo numérico si dos personas del mismo salón colisionan.
with numbered as (
  select
    id,
    coalesce(slugify_text(name), 'pro') as base,
    row_number() over (partition by tenant_id, coalesce(slugify_text(name), 'pro') order by created_at, id) as n
  from professionals
)
update professionals p
set public_slug = case when n.n = 1 then n.base else n.base || '-' || n.n end
from numbered n
where n.id = p.id;

alter table professionals alter column public_slug set not null;
create unique index professionals_public_slug_idx on professionals (tenant_id, public_slug);

-- Altas nuevas (onboarding, invitación a un profesional): el slug se arma solo.
create or replace function professionals_fill_public_slug()
returns trigger language plpgsql as $$
declare
  v_base text := coalesce(slugify_text(new.name), 'pro');
  v_slug text := v_base;
  v_n integer := 1;
begin
  if new.public_slug is not null and new.public_slug <> '' then
    return new;
  end if;
  while exists (select 1 from professionals where tenant_id = new.tenant_id and public_slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  new.public_slug := v_slug;
  return new;
end;
$$;

create trigger professionals_public_slug_biu
  before insert on professionals
  for each row execute function professionals_fill_public_slug();

-- ---------- 2. galería de trabajos del profesional ----------
-- Mismo criterio que tenants.gallery_urls (0036): un array de URLs ordenado alcanza, la primera
-- es la portada. Bucket propio para no mezclar el ciclo de vida con la foto de perfil (0030).
alter table professionals add column gallery_urls text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('professional-gallery', 'professional-gallery', true)
on conflict (id) do nothing;

-- Convención de path: professional-gallery/<tenant_id>/<professional_id>/<uuid>.<ext>.
create policy "professional_gallery_public_read"
  on storage.objects for select
  using (bucket_id = 'professional-gallery');

create policy "professional_gallery_write"
  on storage.objects for insert
  with check (
    bucket_id = 'professional-gallery'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and ((storage.foldername(name))[2] = current_professional_id()::text or current_professional_role() = 'admin')
  );

create policy "professional_gallery_delete"
  on storage.objects for delete
  using (
    bucket_id = 'professional-gallery'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and ((storage.foldername(name))[2] = current_professional_id()::text or current_professional_role() = 'admin')
  );

-- ---------- 3. "servicios más solicitados" cuenta demanda real ----------
-- Antes contaba TODAS las reservas del período, incluidas las canceladas y las que todavía
-- esperan confirmación: un servicio pedido y cancelado el mismo día encabezaba el ranking. Ahora
-- solo suma lo que el profesional ya confirmó (o completó), igual que ingresos y ticket promedio.
-- (Redefine la versión de 0012_rbac_team_metrics.sql; el resto del cuerpo va idéntico.)
create or replace function panel_period_metrics(p_professional_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable
security definer set search_path = public as $$
declare
  v_tenant_id uuid := current_tenant_id();
  v_result jsonb;
begin
  if v_tenant_id is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if (p_professional_id is null or p_professional_id <> current_professional_id())
    and current_professional_role() <> 'admin' then
    raise exception 'Solo un administrador puede ver las métricas de otro profesional o del salón' using errcode = '42501';
  end if;
  if p_professional_id is not null and not exists (
    select 1 from professionals where id = p_professional_id and tenant_id = v_tenant_id
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  with scoped as (
    select b.* from bookings b
    where b.tenant_id = v_tenant_id
      and (p_professional_id is null or b.professional_id = p_professional_id)
      and b.start_at >= p_from and b.start_at < p_to
  ),
  first_booking as (
    select client_phone, min(start_at) as first_at
    from bookings
    where tenant_id = v_tenant_id and status <> 'cancelada'
    group by client_phone
  ),
  top_services as (
    select bi.name_snapshot as name, count(*) as n
    from booking_items bi
    join scoped b on b.id = bi.booking_id
    where b.status in ('confirmada', 'completada')
    group by bi.name_snapshot
    order by count(*) desc
    limit 4
  )
  select jsonb_build_object(
    'revenue', coalesce((select sum(total_price_clp) from scoped where status in ('confirmada', 'completada')), 0),
    'bookingsCount', (select count(*) from scoped),
    'paidCount', (select count(*) from scoped where status in ('confirmada', 'completada')),
    'cancelNoShowCount', (select count(*) from scoped where status in ('cancelada', 'no-show')),
    'newCustomers', (select count(*) from scoped s join first_booking f on f.client_phone = s.client_phone
                       where f.first_at = s.start_at and s.status <> 'cancelada'),
    'bookedMinutes', coalesce((
      select sum(bi.duration_snapshot) from booking_items bi
      join scoped b on b.id = bi.booking_id where b.status <> 'cancelada'
    ), 0),
    'topServices', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n)) from top_services), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
