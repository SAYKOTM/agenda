-- Sistema de reseñas: el cliente califica a su profesional desde el link de gestión de su
-- reserva (public_token), una vez que la reserva quedó 'completada'. Sin cuenta de cliente,
-- la única vía de escritura es la Edge Function submit-review (cliente service_role, calca el
-- patrón sin-login de cancel-booking/reschedule-booking) -- por eso "reviews" no tiene policy
-- de insert para anon/authenticated: nunca se escribe con RLS activo salvo el bypass del
-- service_role.

create table reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  professional_id uuid not null references professionals (id) on delete cascade,
  booking_id uuid not null unique references bookings (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
create index reviews_professional_idx on reviews (professional_id);

alter table professionals add column rating_avg numeric(2, 1);
alter table professionals add column rating_count integer not null default 0;

create or replace function sync_professional_rating() returns trigger
language plpgsql as $$
begin
  update professionals p set
    rating_avg = agg.avg_rating,
    rating_count = agg.n
  from (
    select round(avg(rating)::numeric, 1) as avg_rating, count(*) as n
    from reviews
    where professional_id = new.professional_id
  ) agg
  where p.id = new.professional_id;
  return new;
end;
$$;
create trigger reviews_sync_professional_rating after insert on reviews
  for each row execute function sync_professional_rating();

alter table reviews enable row level security;
create policy reviews_public_read on reviews for select using (true);
grant select on reviews to anon, authenticated;
