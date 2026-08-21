-- Los datos de la cuenta bancaria deben mostrarse al cliente público cuando elige "transferencia"
-- como método de pago (igual que cualquier negocio los publica para recibir transferencias):
-- no son credenciales, son el destino del pago. Se corrige la política inicial, que por error
-- los había dejado como privados junto con el resto de la configuración del tenant.
drop policy tenant_bank_accounts_manage on tenant_bank_accounts;

create policy tenant_bank_accounts_public_read on tenant_bank_accounts for select using (true);
create policy tenant_bank_accounts_manage_ins on tenant_bank_accounts for insert with check (tenant_id = current_tenant_id());
create policy tenant_bank_accounts_manage_upd on tenant_bank_accounts for update using (tenant_id = current_tenant_id());
create policy tenant_bank_accounts_manage_del on tenant_bank_accounts for delete using (tenant_id = current_tenant_id());

grant select on tenant_bank_accounts to anon, authenticated;
