-- Inserta una reserva y sus items de forma atómica. La llama la Edge Function create-booking
-- (con el cliente service_role, que bypassa RLS) después de resolver un profesional concreto
-- y de re-validar disponibilidad con el motor de slots. El constraint de exclusión de
-- "bookings" es la última línea de defensa contra condiciones de carrera: si otra reserva ganó
-- la carrera, esta función simplemente propaga el exclusion_violation (SQLSTATE 23P01) para
-- que la Edge Function la traduzca a un 409.
create or replace function create_booking(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_client_name text,
  p_client_phone text,
  p_client_email text,
  p_notes text,
  p_start_at timestamptz,
  p_items jsonb, -- [{service_id, name, price, duration_min, buffer_before_min, buffer_after_min, deposit_amount_clp}]
  p_payment_method payment_method,
  p_source booking_source default 'public'
) returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_core_span int;
  v_buffer_before int;
  v_buffer_after int;
  v_end_at timestamptz;
  v_total int;
  v_deposit int;
  v_item jsonb;
  v_sort int := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La reserva necesita al menos un servicio' using errcode = 'P0001';
  end if;

  select coalesce(sum((i ->> 'duration_min')::int), 0),
         coalesce(sum((i ->> 'price')::int), 0),
         coalesce(sum(coalesce((i ->> 'deposit_amount_clp')::int, 0)), 0)
    into v_core_span, v_total, v_deposit
    from jsonb_array_elements(p_items) i;

  v_buffer_before := coalesce((p_items -> 0 ->> 'buffer_before_min')::int, 0);
  v_buffer_after := coalesce((p_items -> -1 ->> 'buffer_after_min')::int, 0);
  v_end_at := p_start_at + make_interval(mins => v_core_span);

  insert into bookings (
    tenant_id, professional_id, client_name, client_phone, client_email, notes,
    start_at, end_at, buffer_before_min, buffer_after_min,
    total_price_clp, deposit_amount_clp, payment_method, source
  ) values (
    p_tenant_id, p_professional_id, p_client_name, p_client_phone, p_client_email, p_notes,
    p_start_at, v_end_at, v_buffer_before, v_buffer_after,
    v_total, v_deposit, p_payment_method, p_source
  ) returning * into v_booking;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into booking_items (
      booking_id, service_id, name_snapshot, price_snapshot, duration_snapshot,
      buffer_before_snapshot, buffer_after_snapshot, sort_order
    ) values (
      v_booking.id, (v_item ->> 'service_id')::uuid, v_item ->> 'name',
      (v_item ->> 'price')::int, (v_item ->> 'duration_min')::int,
      coalesce((v_item ->> 'buffer_before_min')::int, 0), coalesce((v_item ->> 'buffer_after_min')::int, 0),
      v_sort
    );
    v_sort := v_sort + 1;
  end loop;

  return v_booking;
end;
$$;
