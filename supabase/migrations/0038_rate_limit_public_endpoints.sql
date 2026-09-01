-- Limita abuso de endpoints públicos sensibles (auditoría de seguridad, hallazgo "sin
-- rate-limiting"). Cubre en particular lookup_customer_tier: es un oráculo que revela si un
-- teléfono es cliente de un tenant y su nivel de fidelidad sin necesitar login -- sin límite,
-- alguien puede escanear muchos teléfonos rápido. create-booking y signup-tenant (Edge Functions)
-- usan la misma tabla desde Deno, pasando la IP del caller como key.

create table rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (key, window_start)
);

-- Ventana fija (no deslizante): agrupa cada request en el bucket de p_window_seconds que le
-- corresponde por reloj -- mucho más simple que una ventana deslizante real, y alcanza para
-- frenar abuso (no busca ser exacta al segundo).
create or replace function enforce_rate_limit(p_key text, p_max_count integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer set search_path = public as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limit_hits (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start) do update set count = rate_limit_hits.count + 1
  returning count into v_count;

  return v_count <= p_max_count;
end;
$$;

-- housekeeping: ninguna fila necesita vivir más de un par de horas.
select cron.schedule('purge-rate-limit-hits', '17 * * * *', $$delete from rate_limit_hits where window_start < now() - interval '2 hours';$$);

-- ---------- lookup_customer_tier: máximo 20 consultas cada 5 min por IP ----------
-- Misma lógica que la versión de 0035_professional_loyalty_tiers.sql, solo se agrega el chequeo
-- de rate limit al principio. request.headers lo setea PostgREST -- si la función se llama fuera
-- de ese contexto (nunca pasa en producción) v_caller_ip cae a 'unknown', que igual rate-limitea
-- correctamente a quien sea que llegue sin ese header.
-- Ya no es "stable": ahora escribe (enforce_rate_limit inserta en rate_limit_hits). PostgREST
-- corre las funciones "stable"/"immutable" en una transacción de solo lectura sin importar el
-- método HTTP -- dejarla como stable rompía el insert con "cannot execute INSERT in a read-only
-- transaction".
create or replace function lookup_customer_tier(p_tenant_id uuid, p_professional_id uuid, p_phone text) returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_customer_id uuid;
  v_visits int;
  v_tier text;
  v_discount_pct numeric(5, 2) := 0;
  v_tenant tenants;
  v_caller_ip text;
begin
  v_caller_ip := coalesce(
    nullif(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1), ''),
    'unknown'
  );
  if not enforce_rate_limit('lookup_customer_tier:' || v_caller_ip, 20, 300) then
    raise exception 'demasiadas solicitudes, intenta de nuevo en unos minutos' using errcode = '42901';
  end if;

  select id into v_customer_id from customers where tenant_id = p_tenant_id and phone = p_phone;

  select count(*) into v_visits
    from bookings
    where professional_id = p_professional_id and customer_id = v_customer_id and status = 'completada';

  select * into v_tenant from tenants where id = p_tenant_id;
  if v_tenant.enable_loyalty_discounts then
    select plt.tier, plt.discount_pct into v_tier, v_discount_pct from professional_loyalty_tier(p_professional_id, v_visits) plt;
  else
    select plt.tier into v_tier from professional_loyalty_tier(p_professional_id, v_visits) plt;
  end if;

  return jsonb_build_object('tier', v_tier, 'discountPct', coalesce(v_discount_pct, 0));
end;
$$;
grant execute on function lookup_customer_tier(uuid, uuid, text) to anon, authenticated;
