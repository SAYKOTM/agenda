-- Logo del negocio: bucket público de Storage + logo_url en tenants. Reusado por el header del
-- correo de notificaciones (0027) cuando existe; si no, el correo sigue cayendo al nombre en texto.
alter table tenants add column logo_url text;

insert into storage.buckets (id, name, public)
values ('tenant-logos', 'tenant-logos', true)
on conflict (id) do nothing;

-- Convención de path: tenant-logos/<tenant_id>/logo.<ext> -- el primer segmento del path ES el
-- tenant_id, así que se puede validar contra current_tenant_id() sin una tabla de mapeo aparte
-- (mismo truco que la convención professional_id = nombre de instancia de Evolution en 0025).
create policy "tenant_logos_public_read"
  on storage.objects for select
  using (bucket_id = 'tenant-logos');

create policy "tenant_logos_admin_write"
  on storage.objects for insert
  with check (
    bucket_id = 'tenant-logos'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and current_professional_role() = 'admin'
  );

create policy "tenant_logos_admin_update"
  on storage.objects for update
  using (bucket_id = 'tenant-logos' and (storage.foldername(name))[1] = current_tenant_id()::text)
  with check (bucket_id = 'tenant-logos' and (storage.foldername(name))[1] = current_tenant_id()::text and current_professional_role() = 'admin');

create policy "tenant_logos_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'tenant-logos'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and current_professional_role() = 'admin'
  );
