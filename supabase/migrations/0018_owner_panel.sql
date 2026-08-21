-- Panel completo del rol Owner/Admin: comisiones por profesional, estaciones con estado y
-- asignación, política de reserva editable, y ranking del equipo con desglose de comisión.
--
-- Nota de nomenclatura: este esquema ya distinguía dos roles en professional_role ('admin' y
-- 'professional'). "Owner"/"Admin" y "Staff" del pedido del producto son las mismas dos
-- etiquetas de negocio -- no se agrega un tercer rol 'owner' porque en ningún punto del pedido
-- se necesita distinguirlo de 'admin' (el propio pedido solo permite editar el rol entre
-- "Admin / Staff"). Todo guard nuevo reusa current_professional_role() = 'admin', igual que el
-- resto del panel (0009/0010/0012/0017).
--
-- Nota de nomenclatura 2: se extiende la tabla 'stations' ya existente (fase 4, usada en RLS,
-- grants y PanelStations.jsx) en vez de crear una tabla 'workstations' paralela -- mismo
-- concepto de negocio, evita duplicar una tabla ya en producción.

-- ---------- comisión por profesional ----------
alter table professionals add column commission_pct numeric(5, 2) not null default 0 check (commission_pct >= 0 and commission_pct <= 100);

-- guard_professional_privileged_fields (0010) ya impide que un 'professional' cambie su propio
-- role/active/tenant_id/auth_user_id; se extiende para que tampoco pueda subirse la comisión.
create or replace function guard_professional_privileged_fields() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or current_professional_role() = 'admin' then
    return new;
  end if;
  if new.role is distinct from old.role
    or new.active is distinct from old.active
    or new.tenant_id is distinct from old.tenant_id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.commission_pct is distinct from old.commission_pct then
    raise exception 'Solo un administrador puede cambiar permisos, estado, comisión o tenant de un profesional' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------- estaciones: estado operativo + profesional asignado (opcional) ----------
alter table stations add column status text not null default 'disponible' check (status in ('disponible', 'mantenimiento', 'inactiva'));
alter table stations add column professional_id uuid references professionals (id) on delete set null;
create index stations_professional_idx on stations (professional_id);

-- ---------- política de reserva visible en el booking público (ver StepPay.jsx) ----------
alter table tenants add column cancellation_policy_text text not null default 'Cancelación gratuita hasta 4 horas antes.';

-- ---------- ranking del equipo: se agrega comisión por profesional y neto del salón ----------
-- Mismo guard admin-only que ya tenía (0009/0012): sigue siendo la única vía para "datos
-- consolidados de todo el equipo" -- un professional nunca puede pedir el de otro ni el global.
-- create or replace no permite agregar columnas al RETURNS TABLE de una función existente
-- (SQLSTATE 42P13): hay que dropearla y recrearla, y por lo tanto reotorgar el grant.
drop function panel_team_ranking(timestamptz, timestamptz);
create function panel_team_ranking(p_from timestamptz, p_to timestamptz)
returns table (
  professional_id uuid, name text, initials text,
  revenue bigint, bookings_count bigint,
  commission_pct numeric, commission_clp bigint
)
language plpgsql stable
security definer set search_path = public as $$
declare
  v_tenant_id uuid := current_tenant_id();
begin
  if v_tenant_id is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if current_professional_role() <> 'admin' then
    raise exception 'Solo un administrador puede ver el ranking del equipo' using errcode = '42501';
  end if;

  return query
    select
      p.id, p.name, p.initials,
      coalesce(sum(b.total_price_clp) filter (where b.status in ('confirmada', 'completada')), 0)::bigint as revenue,
      count(b.id)::bigint as bookings_count,
      p.commission_pct,
      round(coalesce(sum(b.total_price_clp) filter (where b.status in ('confirmada', 'completada')), 0) * p.commission_pct / 100)::bigint as commission_clp
    from professionals p
    left join bookings b on b.professional_id = p.id and b.start_at >= p_from and b.start_at < p_to
    where p.tenant_id = v_tenant_id and p.active = true
    group by p.id, p.name, p.initials, p.commission_pct
    order by 4 desc;
end;
$$;
grant execute on function panel_team_ranking(timestamptz, timestamptz) to authenticated;
