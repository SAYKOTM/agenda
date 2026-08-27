-- Suscripción SaaS del tenant a la plataforma (lo que la barbería le paga a Agenda SaaS), vía
-- Stripe. Esto es un concepto totalmente distinto de `tenant_payment_methods` (cómo el CLIENTE
-- final le paga a la barbería) -- no se tocan ni se mezclan.
--
-- Modelo elegido: el trial es local y arranca al crear el tenant (no requiere tarjeta ni tocar
-- Stripe todavía). Cuando el tenant agrega una tarjeta desde create-checkout-session, el checkout
-- continúa ese mismo trial (ver `trial_period_days` calculado ahí) en vez de reiniciarlo -- así
-- nunca se duplica el período de prueba. Desde que existe una suscripción de Stripe, esta pasa a
-- ser la fuente de verdad y el webhook (stripe-webhook) mantiene `tenants` sincronizado.
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'unpaid');

alter table tenants
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column subscription_status subscription_status not null default 'trialing',
  -- default no constante (usa now()): cada tenant nuevo arranca su propio trial de 7 días desde
  -- el momento en que se inserta la fila, sin necesidad de un trigger separado.
  add column trial_ends_at timestamptz not null default (now() + interval '7 days'),
  add column current_period_end timestamptz;

create unique index tenants_stripe_customer_id_key on tenants (stripe_customer_id) where stripe_customer_id is not null;
create unique index tenants_stripe_subscription_id_key on tenants (stripe_subscription_id) where stripe_subscription_id is not null;

-- Única fuente de verdad de la regla de acceso (objetivo 4): trialing solo cuenta mientras no haya
-- vencido; past_due es el período de gracia (siguen entrando mientras se reintenta el cobro);
-- canceled/unpaid bloquean. Ver mismo criterio reescrito en JS en src/lib/subscription.js -- ese
-- archivo es solo para la UI (ocultar/mostrar), la regla que de verdad importa vive acá.
create or replace function tenant_has_active_access(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select case
    when t.subscription_status in ('active', 'past_due') then true
    when t.subscription_status = 'trialing' then t.trial_ends_at > now()
    else false
  end
  from tenants t
  where t.id = p_tenant_id;
$$;

-- Defensa en profundidad para las columnas de billing: `tenants_self_update` (migración 0002) ya
-- permite que el propio tenant actualice su fila (nombre, tema, etc.), pero las columnas de Stripe
-- solo las debe tocar el service_role (create-checkout-session / stripe-webhook), nunca el panel
-- autenticado directamente. RLS no puede restringir columnas específicas dentro de una policy de
-- UPDATE, así que se hace con un trigger que solo actúa cuando quien ejecuta es 'authenticated'
-- (el service_role tiene bypassrls pero los triggers igual corren para él, por eso el chequeo de
-- rol explícito de abajo, no basta con RLS).
create or replace function prevent_tenant_billing_self_update()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' and (
    new.stripe_customer_id is distinct from old.stripe_customer_id or
    new.stripe_subscription_id is distinct from old.stripe_subscription_id or
    new.subscription_status is distinct from old.subscription_status or
    new.trial_ends_at is distinct from old.trial_ends_at or
    new.current_period_end is distinct from old.current_period_end
  ) then
    raise exception 'las columnas de suscripción solo las puede modificar la plataforma';
  end if;
  return new;
end;
$$;

create trigger tenants_prevent_billing_self_update
  before update on tenants
  for each row
  execute function prevent_tenant_billing_self_update();
