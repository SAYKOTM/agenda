-- Seed de los dos tenants de ejemplo: Roble Barbería y Lumière Salón.
-- IDs fijos (no gen_random_uuid) para que el seed sea reproducible y para poder referenciarlos
-- desde tests (p.ej. supabase/tests/tenant_isolation.sql).

-- ============ TENANTS ============
-- hours_label se asigna aquí directamente (no solo en la migración 0007) porque en un
-- `db reset` las migraciones corren ANTES que este seed: el UPDATE de esa migración se ejecuta
-- contra una tabla `tenants` todavía vacía y no encuentra fila que actualizar.
insert into tenants (id, slug, name, mark, tagline, headline, address, phone, instagram, timezone, rating, reviews_count, theme, min_lead_time_min, slot_interval_min, hours_label)
values
  ('a0000000-0000-0000-0000-000000000000', 'roble-barberia', 'Roble Barbería', 'R',
   'Barbería clásica · Providencia', 'Cortes de oficio, sin apuros.',
   'Av. Italia 1420, Providencia, Santiago', '+56 2 2345 6789', '@roblesalon',
   'America/Santiago', 4.9, 212,
   '{"bg":"#0F1219","panel":"#171C26","ink":"#F3F5F8","sub":"#8B96A6","border":"#242C39","accent":"#FF5A2B","accentInk":"#0F1219"}'::jsonb,
   60, 30, 'Lun a Vie 10:00–20:00 · Sáb 10:00–16:00'),
  ('b0000000-0000-0000-0000-000000000000', 'lumiere-salon', 'Lumière Salón', 'L',
   'Color y estilismo · Vitacura', 'Color hecho a tu medida.',
   'Alonso de Córdova 3250, Vitacura, Santiago', '+56 2 2345 6789', '@lumieresalon',
   'America/Santiago', 4.8, 348,
   '{"bg":"#F7F7FA","panel":"#FFFFFF","ink":"#131722","sub":"#737C8D","border":"#E6E8F0","accent":"#6D4DF6","accentInk":"#FFFFFF"}'::jsonb,
   60, 30, 'Mar a Sáb 09:30–19:30');

insert into tenant_bank_accounts (tenant_id, holder, bank, account_type, account_number, rut, notice_email) values
  ('a0000000-0000-0000-0000-000000000000', 'Roble SpA', 'Banco de Chile', 'Cuenta Corriente', '000-12345678-01', '77.412.900-5', 'pagos@roblebarberia.cl'),
  ('b0000000-0000-0000-0000-000000000000', 'Lumière Estilismo Ltda.', 'Banco Santander', 'Cuenta Vista', '0-000-9988771-2', '76.550.310-K', 'reservas@lumiere.cl');

insert into tenant_payment_methods (tenant_id, method, enabled, gateway) values
  ('a0000000-0000-0000-0000-000000000000', 'efectivo', true, null),
  ('a0000000-0000-0000-0000-000000000000', 'transferencia', true, null),
  ('a0000000-0000-0000-0000-000000000000', 'online', true, 'Mercado Pago'),
  ('b0000000-0000-0000-0000-000000000000', 'efectivo', true, null),
  ('b0000000-0000-0000-0000-000000000000', 'online', true, 'Webpay');

-- ============ CATEGORÍAS ============
insert into categories (id, tenant_id, name, sort_order) values
  ('a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000000', 'Cortes', 1),
  ('a0000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-000000000000', 'Barba', 2),
  ('a0000000-0000-0000-0000-0000000000c3', 'a0000000-0000-0000-0000-000000000000', 'Combos', 3),
  ('b0000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-000000000000', 'Corte y peinado', 1),
  ('b0000000-0000-0000-0000-0000000000c2', 'b0000000-0000-0000-0000-000000000000', 'Color', 2),
  ('b0000000-0000-0000-0000-0000000000c3', 'b0000000-0000-0000-0000-000000000000', 'Tratamientos', 3);

-- ============ SERVICIOS ============
-- buffer_after_min = 10 por defecto (tiempo de limpieza/orden entre citas); depósito exigido
-- desde $40.000 CLP: asunción documentada en la entrega de fase 1, a revisar por el cliente.
insert into services (id, tenant_id, category_id, name, description, duration_min, price_clp, buffer_before_min, buffer_after_min, deposit_required, deposit_amount_clp) values
  ('a0000000-0000-0000-0000-000000000e01', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000c1', 'Corte clásico', 'Tijera y máquina, lavado incluido', 35, 12000, 0, 10, false, null),
  ('a0000000-0000-0000-0000-000000000e02', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000c1', 'Fade a máquina', 'Degradado limpio, terminación a navaja', 30, 11000, 0, 10, false, null),
  ('a0000000-0000-0000-0000-000000000e03', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000c1', 'Corte niño', 'Hasta 12 años', 25, 9000, 0, 10, false, null),
  ('a0000000-0000-0000-0000-000000000e04', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000c2', 'Perfilado de barba', 'Diseño y aceite', 20, 7000, 0, 10, false, null),
  ('a0000000-0000-0000-0000-000000000e05', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000c2', 'Afeitado a navaja', 'Toalla caliente y bálsamo', 30, 10000, 0, 10, false, null),
  ('a0000000-0000-0000-0000-000000000e06', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000c3', 'Corte + barba', 'El más pedido del local', 60, 19000, 0, 10, false, null),
  ('a0000000-0000-0000-0000-000000000e07', 'a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000c3', 'Ritual toalla caliente', 'Corte, barba y masaje capilar', 75, 26000, 0, 10, false, null),
  ('b0000000-0000-0000-0000-000000000e01', 'b0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000c1', 'Corte y peinado', 'Diagnóstico, corte y styling', 50, 22000, 0, 10, false, null),
  ('b0000000-0000-0000-0000-000000000e02', 'b0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000c1', 'Brushing', 'Lavado y secado con forma', 30, 12000, 0, 10, false, null),
  ('b0000000-0000-0000-0000-000000000e03', 'b0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000c2', 'Balayage', 'Iluminación a mano alzada + matiz', 180, 95000, 0, 15, true, 20000),
  ('b0000000-0000-0000-0000-000000000e04', 'b0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000c2', 'Retoque de raíz', 'Color en raíz y sellado', 90, 48000, 0, 15, true, 15000),
  ('b0000000-0000-0000-0000-000000000e05', 'b0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000c3', 'Keratina sin formol', 'Alisado y brillo, dura 3 meses', 120, 65000, 0, 15, true, 20000),
  ('b0000000-0000-0000-0000-000000000e06', 'b0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000c3', 'Hidratación profunda', 'Ampolla y vapor', 45, 19000, 0, 10, false, null);

-- ============ PROFESIONALES ============
-- El primer profesional de cada tenant es el administrador del salón (regla tomada del
-- prototipo: team()[0].perms === 'Administrador').
insert into professionals (id, tenant_id, name, role_title, initials, role, active, email) values
  ('a0000000-0000-0000-0000-000000000f01', 'a0000000-0000-0000-0000-000000000000', 'Matías Fuentes', 'Corte clásico y navaja', 'MF', 'admin', true, 'matias@roblebarberia.cl'),
  ('a0000000-0000-0000-0000-000000000f02', 'a0000000-0000-0000-0000-000000000000', 'Nicolás Bravo', 'Fades y diseño', 'NB', 'professional', true, 'nicolas@roblebarberia.cl'),
  ('a0000000-0000-0000-0000-000000000f03', 'a0000000-0000-0000-0000-000000000000', 'Camilo Reyes', 'Barba y afeitado', 'CR', 'professional', true, 'camilo@roblebarberia.cl'),
  ('b0000000-0000-0000-0000-000000000f01', 'b0000000-0000-0000-0000-000000000000', 'Valentina Soto', 'Colorimetría y balayage', 'VS', 'admin', true, 'valentina@lumiere.cl'),
  ('b0000000-0000-0000-0000-000000000f02', 'b0000000-0000-0000-0000-000000000000', 'Antonia Cruz', 'Corte y peinado', 'AC', 'professional', true, 'antonia@lumiere.cl'),
  ('b0000000-0000-0000-0000-000000000f03', 'b0000000-0000-0000-0000-000000000000', 'Rocío Méndez', 'Tratamientos capilares', 'RM', 'professional', true, 'rocio@lumiere.cl'),
  ('b0000000-0000-0000-0000-000000000f04', 'b0000000-0000-0000-0000-000000000000', 'Ignacio Pardo', 'Corte masculino y barba', 'IP', 'professional', true, 'ignacio@lumiere.cl');

-- ============ CUENTAS DE AUTENTICACIÓN DEL PANEL ============
-- Un usuario de auth.users por profesional, con contraseña de demo compartida. Solo para
-- desarrollo local/seed: en producción cada salón invita a su equipo desde el panel (fase 4,
-- "+ Invitar profesional") y Supabase Auth envía el link de activación real.
do $$
declare
  v_password text := 'agenda2026';
  v_prof record;
  v_user_id uuid;
begin
  for v_prof in select id, email from professionals where email is not null loop
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_prof.email, crypt(v_password, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user_id, v_user_id::text, jsonb_build_object('sub', v_user_id::text, 'email', v_prof.email), 'email', now(), now(), now());

    update professionals set auth_user_id = v_user_id where id = v_prof.id;
  end loop;
end $$;

-- ============ SERVICIOS POR PROFESIONAL ============
-- El administrador realiza todos los servicios del salón; el resto según su especialidad
-- (asunción de seed, editable luego desde el panel).
insert into professional_services (professional_id, service_id)
select 'a0000000-0000-0000-0000-000000000f01', id from services where tenant_id = 'a0000000-0000-0000-0000-000000000000';
insert into professional_services (professional_id, service_id)
select 'a0000000-0000-0000-0000-000000000f02', id from services where tenant_id = 'a0000000-0000-0000-0000-000000000000'
  and category_id in ('a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000c3');
insert into professional_services (professional_id, service_id)
select 'a0000000-0000-0000-0000-000000000f03', id from services where tenant_id = 'a0000000-0000-0000-0000-000000000000'
  and category_id in ('a0000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-0000000000c3');

insert into professional_services (professional_id, service_id)
select 'b0000000-0000-0000-0000-000000000f01', id from services where tenant_id = 'b0000000-0000-0000-0000-000000000000';
insert into professional_services (professional_id, service_id)
select 'b0000000-0000-0000-0000-000000000f02', id from services where tenant_id = 'b0000000-0000-0000-0000-000000000000'
  and category_id = 'b0000000-0000-0000-0000-0000000000c1';
insert into professional_services (professional_id, service_id)
select 'b0000000-0000-0000-0000-000000000f03', id from services where tenant_id = 'b0000000-0000-0000-0000-000000000000'
  and category_id = 'b0000000-0000-0000-0000-0000000000c3';
insert into professional_services (professional_id, service_id)
select 'b0000000-0000-0000-0000-000000000f04', id from services where tenant_id = 'b0000000-0000-0000-0000-000000000000'
  and category_id = 'b0000000-0000-0000-0000-0000000000c1';

-- ============ DISPONIBILIDAD SEMANAL ============
-- weekday: 0=lunes .. 6=domingo. Roble: lun-vie 10:00-20:00, sáb 10:00-16:00, dom cerrado.
-- Lumière: mar-sáb 09:30-19:30, lun y dom cerrado. Se aplica el mismo horario a todo el
-- equipo del salón (simplificación de seed; cada profesional puede editar el suyo después).
insert into availability_blocks (professional_id, weekday, start_min, end_min)
select p.id, wd, case when wd = 5 then 600 else 600 end, case when wd = 5 then 960 else 1200 end
from professionals p, generate_series(0, 5) as wd
where p.tenant_id = 'a0000000-0000-0000-0000-000000000000';

insert into availability_blocks (professional_id, weekday, start_min, end_min)
select p.id, wd, 570, 1170
from professionals p, generate_series(1, 5) as wd
where p.tenant_id = 'b0000000-0000-0000-0000-000000000000';

-- ============ EXCEPCIONES DE DISPONIBILIDAD (ejemplo, sobre el admin de Roble) ============
insert into availability_exceptions (professional_id, date, type, start_min, end_min, reason) values
  ('a0000000-0000-0000-0000-000000000f01', '2026-08-26', 'blocked', null, null, 'Vacaciones'),
  ('a0000000-0000-0000-0000-000000000f01', '2026-08-29', 'extra', 660, 900, 'Disponibilidad extra (domingo)');
insert into availability_exceptions (professional_id, date, type, start_min, end_min, reason)
select id, '2026-09-18', 'blocked', null, null, 'Feriado'
from professionals where tenant_id = 'a0000000-0000-0000-0000-000000000000';

-- ============ ESTACIONES (fase 4) ============
insert into stations (tenant_id, name, sort_order) values
  ('a0000000-0000-0000-0000-000000000000', 'Estación 1', 1),
  ('a0000000-0000-0000-0000-000000000000', 'Estación 2', 2),
  ('a0000000-0000-0000-0000-000000000000', 'Estación 3', 3),
  ('b0000000-0000-0000-0000-000000000000', 'Estación 1', 1),
  ('b0000000-0000-0000-0000-000000000000', 'Estación 2', 2),
  ('b0000000-0000-0000-0000-000000000000', 'Estación 3', 3),
  ('b0000000-0000-0000-0000-000000000000', 'Estación 4', 4);

-- ============ RESERVAS DE EJEMPLO (agenda con volumen real, para probar el panel) ============
-- No es el generador determinista del prototipo (el handoff pide explícitamente no portarlo):
-- son INSERTs reales, uno por profesional/día/bloque, que respetan la disponibilidad semanal y
-- el constraint de exclusión de "bookings" igual que cualquier reserva creada por la app. Cubre
-- una semana centrada en la fecha real de ejecución del seed (3 días atrás a 3 adelante) con
-- ~70% de ocupación, como referencia de volumen (ver README: "7 días, 10-15 citas por día").
do $$
declare
  v_pro record;
  v_day date;
  v_today date;
  v_tz text;
  v_weekday int;
  v_block record;
  v_m int;
  v_svc record;
  v_svc_ids uuid[];
  v_svc_count int;
  v_seed int;
  v_status booking_status;
  v_pay payment_method;
  v_pays payment_method[] := array['efectivo', 'online', 'transferencia']::payment_method[];
  v_client text;
  v_names text[] := array['Camila Aguirre', 'Diego Salinas', 'Fernanda Rojas', 'Tomás Espinoza', 'Javiera Muñoz', 'Rodrigo Cáceres', 'Ignacia Vera', 'Sebastián Lagos', 'Paula Herrera', 'Andrés Núñez', 'Constanza Pinto', 'Matías Olivares'];
  v_start_at timestamptz;
  v_booking_id uuid;
begin
  for v_pro in select id, tenant_id from professionals loop
    select array_agg(service_id) into v_svc_ids from professional_services where professional_id = v_pro.id;
    v_svc_count := coalesce(array_length(v_svc_ids, 1), 0);
    continue when v_svc_count = 0;
    select timezone into v_tz from tenants where id = v_pro.tenant_id;
    -- "hoy" en la timezone del tenant, no la del servidor (mismo principio que el motor de
    -- slots): evita que un salón en UTC-3/-4 vea su día actual completo como "ya pasado".
    v_today := (now() at time zone v_tz)::date;

    for v_day in select generate_series(v_today - 3, v_today + 3, interval '1 day')::date loop
      v_weekday := mod(extract(isodow from v_day)::int + 6, 7); -- 0=lunes..6=domingo

      for v_block in select start_min, end_min from availability_blocks where professional_id = v_pro.id and weekday = v_weekday loop
        v_m := v_block.start_min;
        while v_m + 30 <= v_block.end_min loop
          v_seed := abs(hashtext(v_pro.id::text || v_day::text || v_m::text));

          if v_seed % 7 < 5 then -- ~70% ocupado; deja huecos igual que la disponibilidad real
            select id, duration_min, price_clp, buffer_after_min, name into v_svc
              from services where id = v_svc_ids[1 + v_seed % v_svc_count];

            v_status := case
              when v_day < v_today then (case when v_seed % 10 = 0 then 'no-show' else 'completada' end)
              when v_day = v_today then (case when v_seed % 3 = 0 then 'pendiente' else 'confirmada' end)
              else (case when v_seed % 4 = 0 then 'pendiente' else 'confirmada' end)
            end;
            v_client := v_names[1 + v_seed % array_length(v_names, 1)];
            v_pay := v_pays[1 + v_seed % 3];
            v_start_at := (v_day::text || ' ' || (v_m / 60) || ':' || lpad((v_m % 60)::text, 2, '0'))::timestamp at time zone v_tz;

            begin
              insert into bookings (
                tenant_id, professional_id, client_name, client_phone, client_email, status,
                start_at, end_at, buffer_before_min, buffer_after_min, total_price_clp,
                payment_method, payment_status, source
              ) values (
                v_pro.tenant_id, v_pro.id, v_client, '+569' || lpad((abs(hashtext(v_client)) % 100000000)::text, 8, '0'),
                lower(translate(v_client, ' áéíóúñ', '.aeioun')) || '@ejemplo.cl', v_status,
                v_start_at, v_start_at + make_interval(mins => v_svc.duration_min), 0, v_svc.buffer_after_min,
                v_svc.price_clp, v_pay, (case when v_status in ('completada', 'confirmada') then 'pagado' else 'pendiente' end)::payment_status, 'panel'
              ) returning id into v_booking_id;

              insert into booking_items (booking_id, service_id, name_snapshot, price_snapshot, duration_snapshot, buffer_before_snapshot, buffer_after_snapshot)
              values (v_booking_id, v_svc.id, v_svc.name, v_svc.price_clp, v_svc.duration_min, 0, v_svc.buffer_after_min);

              v_m := v_m + v_svc.duration_min + v_svc.buffer_after_min;
            exception when exclusion_violation then
              v_m := v_m + 30;
            end;
          else
            v_m := v_m + 30;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
end $$;
