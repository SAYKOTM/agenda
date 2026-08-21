-- Panel analítico: cierre de mes (ingresos por día, top servicios por ingresos, desglose por
-- método de pago), clientes atendidos en el mes y tasa de conversión (vistas del link público
-- vs. reservas creadas). tenant_link_views se llena desde la landing pública (track_link_view,
-- anon) y solo se lee a través de panel_month_summary (security definer) -- no expone RLS
-- propia porque nada necesita leerla directo desde el cliente.

create table tenant_link_views (
  tenant_id uuid not null references tenants (id) on delete cascade,
  viewed_on date not null,
  views integer not null default 0,
  primary key (tenant_id, viewed_on)
);
alter table tenant_link_views enable row level security;

create or replace function track_link_view(p_tenant_id uuid) returns void
language plpgsql
security definer set search_path = public as $$
begin
  insert into tenant_link_views (tenant_id, viewed_on, views)
  values (p_tenant_id, current_date, 1)
  on conflict (tenant_id, viewed_on) do update set views = tenant_link_views.views + 1;
end;
$$;
grant execute on function track_link_view(uuid) to anon, authenticated;

-- Mismo guard de rol que panel_period_metrics/panel_team_ranking (0008/0012): un profesional
-- solo puede pedir sus propios números; el agregado del salón o los de otro profesional exigen
-- 'admin'. p_time_zone se necesita para agrupar "por día" en el día local del tenant, no en UTC.
create or replace function panel_month_summary(p_professional_id uuid, p_from timestamptz, p_to timestamptz, p_time_zone text)
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
  revenue_by_day as (
    select (date_trunc('day', start_at at time zone p_time_zone))::date as day, sum(total_price_clp) as revenue
    from scoped where status in ('confirmada', 'completada')
    group by 1 order by 1
  ),
  top_services as (
    select bi.name_snapshot as name, sum(bi.price_snapshot) as revenue
    from booking_items bi
    join scoped b on b.id = bi.booking_id
    where b.status in ('confirmada', 'completada')
    group by bi.name_snapshot
    order by revenue desc
    limit 5
  ),
  payment_breakdown as (
    select payment_method as method, sum(total_price_clp) as revenue
    from scoped
    where status in ('confirmada', 'completada') and payment_method is not null
    group by payment_method
  ),
  customers_served as (
    select count(distinct customer_id) as n from scoped where status = 'completada' and customer_id is not null
  ),
  created_in_range as (
    select count(*) as n from bookings b
    where b.tenant_id = v_tenant_id
      and (p_professional_id is null or b.professional_id = p_professional_id)
      and b.created_at >= p_from and b.created_at < p_to
  ),
  views_in_range as (
    -- p_from/p_to::date usarían el timezone de la SESIÓN de Postgres (no el del tenant): con
    -- "at time zone p_time_zone" se obtiene el día correcto sin importar la zona de la sesión.
    select coalesce(sum(views), 0) as n from tenant_link_views
    where tenant_id = v_tenant_id
      and viewed_on >= (p_from at time zone p_time_zone)::date
      and viewed_on < (p_to at time zone p_time_zone)::date
  )
  select jsonb_build_object(
    'revenueByDay', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'revenue', revenue)) from revenue_by_day), '[]'::jsonb),
    'topServices', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'revenue', revenue)) from top_services), '[]'::jsonb),
    'paymentBreakdown', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'revenue', revenue)) from payment_breakdown), '[]'::jsonb),
    'customersServed', (select n from customers_served),
    'bookingsCreated', (select n from created_in_range),
    'views', (select n from views_in_range)
  ) into v_result;

  return v_result;
end;
$$;
grant execute on function panel_month_summary(uuid, timestamptz, timestamptz, text) to authenticated;
