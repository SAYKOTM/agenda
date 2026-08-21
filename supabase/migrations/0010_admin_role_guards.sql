-- Fase 4 introduce pantallas de nivel salón (ajustes del tenant, métodos de pago, estaciones,
-- permisos del equipo) que el README reserva al rol 'admin' ("professional: solo su agenda,
-- sus servicios asignados, su disponibilidad y su perfil"). Las políticas de la migración 0002
-- solo aislaban por tenant, sin distinguir rol dentro del mismo tenant -- cualquier profesional
-- autenticado podía editar la configuración del salón entero. Esta migración cierra esa brecha.

-- ---------- tenants: solo un admin puede editar la identidad/slug del salón ----------
drop policy tenants_self_update on tenants;
create policy tenants_self_update on tenants for update
  using (id = current_tenant_id() and current_professional_role() = 'admin');

-- ---------- tenant_payment_methods: solo un admin configura los métodos de pago ----------
drop policy tenant_payment_methods_manage on tenant_payment_methods;
create policy tenant_payment_methods_manage on tenant_payment_methods for all
  using (tenant_id = current_tenant_id() and current_professional_role() = 'admin')
  with check (tenant_id = current_tenant_id() and current_professional_role() = 'admin');

-- ---------- tenant_bank_accounts: solo un admin edita el destino de las transferencias ----------
drop policy tenant_bank_accounts_manage_ins on tenant_bank_accounts;
drop policy tenant_bank_accounts_manage_upd on tenant_bank_accounts;
drop policy tenant_bank_accounts_manage_del on tenant_bank_accounts;
create policy tenant_bank_accounts_manage on tenant_bank_accounts for all
  using (tenant_id = current_tenant_id() and current_professional_role() = 'admin')
  with check (tenant_id = current_tenant_id() and current_professional_role() = 'admin');

-- ---------- stations: solo un admin gestiona sillas/estaciones ----------
drop policy stations_manage on stations;
create policy stations_manage on stations for all
  using (tenant_id = current_tenant_id() and current_professional_role() = 'admin')
  with check (tenant_id = current_tenant_id() and current_professional_role() = 'admin');

-- ---------- professional_services: solo un admin asigna qué servicios hace cada quien ----------
drop policy professional_services_manage on professional_services;
create policy professional_services_manage on professional_services for all
  using (exists (
    select 1 from professionals p where p.id = professional_services.professional_id
      and p.tenant_id = current_tenant_id() and current_professional_role() = 'admin'
  ))
  with check (exists (
    select 1 from professionals p where p.id = professional_services.professional_id
      and p.tenant_id = current_tenant_id() and current_professional_role() = 'admin'
  ));

-- ---------- professionals: un 'professional' solo edita su propia fila (perfil); un admin
-- edita cualquier fila de su tenant (permisos, baja/alta del equipo) ----------
drop policy professionals_manage_upd on professionals;
create policy professionals_manage_upd on professionals for update
  using (
    tenant_id = current_tenant_id()
    and (auth_user_id = auth.uid() or current_professional_role() = 'admin')
  );

drop policy professionals_manage_del on professionals;
create policy professionals_manage_del on professionals for delete
  using (tenant_id = current_tenant_id() and current_professional_role() = 'admin');

-- ---------- professionals: evita que un 'professional' se autoasigne permisos de admin ----------
-- RLS por sí sola no puede restringir columnas dentro de un mismo UPDATE permitido; se necesita
-- un trigger para bloquear el escalamiento de privilegios (cambiar su propio role/active/tenant)
-- aunque la fila sea la suya propia. Un admin sigue pudiendo editar cualquier fila de su tenant
-- (incluida la propia); un profesional sin ese rol solo edita los campos de su perfil público.
create or replace function guard_professional_privileged_fields() returns trigger
language plpgsql as $$
begin
  -- auth.uid() es null fuera de una sesión autenticada por PostgREST (migraciones, seed,
  -- Edge Functions con service_role): esos contextos ya bypassan RLS por diseño, así que
  -- confiamos en ellos igual que el resto del esquema. Solo se guarda al rol 'authenticated'.
  if auth.uid() is null or current_professional_role() = 'admin' then
    return new;
  end if;
  if new.role is distinct from old.role
    or new.active is distinct from old.active
    or new.tenant_id is distinct from old.tenant_id
    or new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Solo un administrador puede cambiar permisos, estado o tenant de un profesional' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger professionals_guard_privileged before update on professionals
  for each row execute function guard_professional_privileged_fields();
