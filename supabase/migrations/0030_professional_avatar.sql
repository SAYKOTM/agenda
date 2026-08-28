-- Foto real del profesional (professionals.avatar_url ya existía, sin nada que lo llenara).
-- Bucket propio para no mezclar el ciclo de vida de fotos de profesionales con el logo del
-- negocio. Convención de path: professional-avatars/<tenant_id>/<professional_id>/avatar.<ext>.
insert into storage.buckets (id, name, public)
values ('professional-avatars', 'professional-avatars', true)
on conflict (id) do nothing;

create policy "professional_avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'professional-avatars');

-- Un profesional sube/reemplaza SU propia foto; un admin puede subir la de cualquiera de su
-- equipo (mismo criterio que EditProfessionalModal, donde el admin gestiona el resto del equipo).
create policy "professional_avatars_write"
  on storage.objects for insert
  with check (
    bucket_id = 'professional-avatars'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and ((storage.foldername(name))[2] = current_professional_id()::text or current_professional_role() = 'admin')
  );

create policy "professional_avatars_update"
  on storage.objects for update
  using (bucket_id = 'professional-avatars' and (storage.foldername(name))[1] = current_tenant_id()::text)
  with check (
    bucket_id = 'professional-avatars'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and ((storage.foldername(name))[2] = current_professional_id()::text or current_professional_role() = 'admin')
  );

create policy "professional_avatars_delete"
  on storage.objects for delete
  using (
    bucket_id = 'professional-avatars'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and ((storage.foldername(name))[2] = current_professional_id()::text or current_professional_role() = 'admin')
  );
