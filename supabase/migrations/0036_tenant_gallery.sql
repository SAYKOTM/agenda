-- Galería de fotos del salón (la que se ve en la landing pública, hoy solo placeholders). Un
-- array de URLs alcanza: no hace falta una tabla aparte, no se ordena por drag-and-drop en esta
-- primera versión (se sube en el orden que se quiere que aparezca, se puede eliminar y resubir).
alter table tenants add column gallery_urls text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('tenant-gallery', 'tenant-gallery', true)
on conflict (id) do nothing;

-- Misma convención que tenant-logos (0028): primer segmento del path = tenant_id.
create policy "tenant_gallery_public_read"
  on storage.objects for select
  using (bucket_id = 'tenant-gallery');

create policy "tenant_gallery_admin_write"
  on storage.objects for insert
  with check (
    bucket_id = 'tenant-gallery'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and current_professional_role() = 'admin'
  );

create policy "tenant_gallery_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'tenant-gallery'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and current_professional_role() = 'admin'
  );
