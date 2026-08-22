-- Los servicios dejan de ser un catálogo compartido del tenant que el admin reparte entre su
-- equipo (tabla puente `professional_services`, gestionable solo por admin desde 0010) y pasan a
-- pertenecer directamente a UN profesional: cada quien define su propio nombre, descripción,
-- duración, precio y color. El admin ya no asigna ni crea servicios de terceros -- solo sigue
-- gestionando alta/baja del profesional y su % de comisión (sin cambios en esa parte).
--
-- Migración de datos: hoy un mismo servicio puede estar en `professional_services` de varios
-- profesionales (p.ej. "Corte + barba" lo hacen 3 barberos). Como el nuevo modelo es 1 servicio
-- = 1 dueño, cada profesional adicional que ya lo ofrecía se queda con una COPIA propia del
-- servicio (mismo nombre/precio/duración/color de partida, editable después por su cuenta), y las
-- reservas ya tomadas se re-apuntan a la copia del profesional que efectivamente las atendió --
-- así la Agenda de cada quien sigue mostrando sus citas con los datos de servicio correctos.

alter table services add column professional_id uuid references professionals (id) on delete cascade;

do $$
declare
  v_svc record;
  v_pro record;
  v_first boolean;
  v_new_id uuid;
begin
  for v_svc in select id from services loop
    v_first := true;
    for v_pro in
      select professional_id from professional_services where service_id = v_svc.id order by professional_id
    loop
      if v_first then
        update services set professional_id = v_pro.professional_id where id = v_svc.id;
        v_first := false;
      else
        v_new_id := gen_random_uuid();
        insert into services (
          id, tenant_id, category_id, professional_id, name, description, duration_min, price_clp,
          buffer_before_min, buffer_after_min, deposit_required, deposit_amount_clp, active,
          sort_order, color, created_at, updated_at
        )
        select v_new_id, tenant_id, category_id, v_pro.professional_id, name, description, duration_min,
               price_clp, buffer_before_min, buffer_after_min, deposit_required, deposit_amount_clp,
               active, sort_order, color, created_at, updated_at
        from services where id = v_svc.id;

        update booking_items bi
        set service_id = v_new_id
        from bookings b
        where bi.booking_id = b.id
          and bi.service_id = v_svc.id
          and b.professional_id = v_pro.professional_id;
      end if;
    end loop;
  end loop;
end $$;

-- Servicios huérfanos (creados sin asignar a nadie, p.ej. de pruebas manuales): quedan con el
-- admin del tenant, el único rol que siempre existe.
update services s
set professional_id = (
  select p.id from professionals p
  where p.tenant_id = s.tenant_id and p.role = 'admin'
  order by p.created_at
  limit 1
)
where s.professional_id is null;

alter table services alter column professional_id set not null;
create index services_professional_idx on services (professional_id);

drop table professional_services;

-- ---------- RLS: cada profesional gestiona únicamente sus propios servicios ----------
drop policy services_manage_ins on services;
drop policy services_manage_upd on services;
drop policy services_manage_del on services;

create policy services_manage_ins on services for insert
  with check (professional_id = current_professional_id() and tenant_id = current_tenant_id());

create policy services_manage_upd on services for update
  using (professional_id = current_professional_id())
  with check (professional_id = current_professional_id() and tenant_id = current_tenant_id());

create policy services_manage_del on services for delete
  using (professional_id = current_professional_id());

-- services_public_read (0002_rls.sql, using (true)) no cambia: el flujo público y la agenda del
-- equipo siguen pudiendo LEER cualquier servicio del tenant, solo se restringe quién lo edita.
