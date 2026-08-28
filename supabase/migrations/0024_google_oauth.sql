-- Fase 6b: login con Google, además de email/contraseña.
--
-- `professionals.auth_user_id` siempre apunta a una fila de auth.users que ya existía ANTES de
-- que la persona use Google (se crea al invitarla -- invite-professional -- o al auto-registrarse
-- -- signup-tenant). Si Supabase enlaza automáticamente la identidad de Google a esa cuenta
-- existente (mismo email verificado), auth.uid() no cambia y no hace falta nada más. Pero eso es
-- un comportamiento de la plataforma que no controlamos desde el código, así que agregamos una
-- red de seguridad explícita: claim_invited_professional() enlaza a mano cualquier caso que haya
-- quedado suelto.
--
-- create_tenant_for_current_user() cubre al usuario 100% nuevo que entra por Google sin invitación
-- previa: mismo trabajo que create_tenant_with_owner (migración 0023), pero tomando auth.uid()/
-- auth.jwt() de la sesión ya autenticada en vez de recibirlos como parámetro desde una Edge
-- Function -- porque acá la persona ya tiene sesión, no hace falta pasar por signup-tenant.

-- guard_professional_privileged_fields (0010, extendido en 0018) bloquea cualquier cambio a
-- auth_user_id salvo que quien ejecuta ya sea 'admin' de un tenant -- exactamente el problema del
-- huevo y la gallina que claim_invited_professional necesita resolver: la persona recién
-- autenticada todavía no aparece como profesional de ningún tenant (current_professional_role()
-- da null) hasta que esta misma función la enlaza. Se agrega una excepción acotada: alguien puede
-- enlazar SU PROPIA identidad (auth.uid()) a una fila que todavía no tiene dueño (auth_user_id
-- null), siempre que ningún otro campo privilegiado (role/active/tenant_id/commission_pct) esté
-- cambiando a la vez -- no es una escalada de privilegios, son los valores que ya fijó quien
-- invitó, y solo se puede reclamar una fila sin dueño.
create or replace function guard_professional_privileged_fields() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or current_professional_role() = 'admin' then
    return new;
  end if;
  if old.auth_user_id is null and new.auth_user_id = auth.uid()
    and new.role is not distinct from old.role
    and new.active is not distinct from old.active
    and new.tenant_id is not distinct from old.tenant_id
    and new.commission_pct is not distinct from old.commission_pct then
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

-- ---------- enlazar una invitación pendiente a la sesión de Google que recién llegó ----------
-- Solo puede "reclamar" filas con auth_user_id todavía nulo: nunca puede pisar una cuenta que ya
-- está enlazada a otra persona, así que no hay forma de secuestrar un panel ajeno con esto.
create or replace function claim_invited_professional()
returns professionals
language plpgsql
security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_result professionals;
begin
  if v_email = '' then
    return null;
  end if;

  update professionals
    set auth_user_id = auth.uid()
    where auth_user_id is null
      and active = true
      and lower(email) = v_email
    returning * into v_result;

  return v_result;
end;
$$;
grant execute on function claim_invited_professional() to authenticated;

-- ---------- crear un tenant nuevo para quien ya tiene sesión pero ningún panel ----------
create or replace function create_tenant_for_current_user(p_name text, p_slug text, p_owner_name text)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_name text := trim(coalesce(p_name, ''));
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_owner_name text;
  v_tenant_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if exists (select 1 from professionals where auth_user_id = v_auth_user_id) then
    raise exception 'Esta cuenta ya tiene un panel asociado' using errcode = 'P0001';
  end if;
  if length(v_name) < 2 then
    raise exception 'Ingresa el nombre del local' using errcode = 'P0001';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) < 3 or length(v_slug) > 40 then
    raise exception 'El link solo puede tener minúsculas, números y guiones (3 a 40 caracteres)' using errcode = 'P0001';
  end if;
  if v_slug = any (array[
    'registro', 'crear-salon', 'panel', 'api', 'admin', 'auth', 'login', 'logout', 'app',
    'static', 'assets', 'home', 'www', 'soporte', 'ayuda', 'terminos', 'privacidad', 'signup',
    'dashboard', 'public', 'null', 'undefined'
  ]) then
    raise exception 'Ese link está reservado, elige otro' using errcode = 'P0001';
  end if;
  if exists (select 1 from tenants where slug = v_slug) then
    raise exception 'Ese link ya está en uso' using errcode = 'P0001';
  end if;

  v_owner_name := coalesce(nullif(trim(p_owner_name), ''), v_name);

  insert into tenants (slug, name, mark)
  values (v_slug, v_name, upper(left(v_name, 2)))
  returning id into v_tenant_id;

  insert into professionals (tenant_id, auth_user_id, name, initials, role, email, active)
  values (v_tenant_id, v_auth_user_id, v_owner_name, upper(left(v_owner_name, 2)), 'admin', v_email, true);

  return jsonb_build_object('tenantId', v_tenant_id, 'slug', v_slug);
end;
$$;
grant execute on function create_tenant_for_current_user(text, text, text) to authenticated;
