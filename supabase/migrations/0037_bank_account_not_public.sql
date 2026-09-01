-- Cierra la exposición pública de tenant_bank_accounts (auditoría de seguridad): la política
-- tenant_bank_accounts_public_read (0006_bank_accounts_public_read.sql) deja leer la tabla
-- ENTERA sin login -- cualquiera puede hacer GET /rest/v1/tenant_bank_accounts?select=* y volcar
-- el N° de cuenta y el RUT de TODOS los salones de una sola vez. El caso de uso real
-- (StepPay.jsx, mostrar los datos de transferencia al cliente que ya eligió ese método) solo
-- necesita leer UN tenant a la vez -- nunca la tabla completa -- así que se reemplaza el acceso
-- público directo a la tabla por una función que exige el tenant_id puntual.
--
-- El panel de administración (PanelPayments.jsx, ruta /panel/pagos, ya protegida por
-- RequireAdmin) no se ve afectado: sigue leyendo/escribiendo la tabla directo, autorizado por la
-- política tenant_bank_accounts_manage (0010_admin_role_guards.sql), que no depende de esta.

drop policy if exists tenant_bank_accounts_public_read on tenant_bank_accounts;
revoke select on tenant_bank_accounts from anon;

create or replace function public_bank_account(p_tenant_id uuid)
returns table (holder text, bank text, account_type text, account_number text, rut text, notice_email text)
language sql stable
security definer set search_path = public as $$
  select holder, bank, account_type, account_number, rut, notice_email
  from tenant_bank_accounts
  where tenant_id = p_tenant_id;
$$;
grant execute on function public_bank_account(uuid) to anon, authenticated;
