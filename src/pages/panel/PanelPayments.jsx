import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../components/Toast';

const inputCls = 'min-h-11 w-full rounded-[10px] border border-[#D3D7E0] bg-white px-3 text-[14px] text-[#0F172A]';
const METHODS = [
  { key: 'efectivo', name: 'Efectivo en el local', desc: 'El cliente paga al llegar' },
  { key: 'transferencia', name: 'Transferencia bancaria', desc: 'Se muestran los datos al confirmar' },
  { key: 'online', name: 'Pago online', desc: 'Tarjeta de crédito o débito' },
];
const GATEWAYS = ['Mercado Pago', 'Stripe', 'Webpay', 'Khipu'];

export default function PanelPayments() {
  const { tenant } = useOutletContext();
  const toast = useToast();
  const [methods, setMethods] = useState([]);
  const [bank, setBank] = useState(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([
      supabase.from('tenant_payment_methods').select('*').eq('tenant_id', tenant.id),
      supabase.from('tenant_bank_accounts').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    ]).then(([m, b]) => {
      setMethods(m.data || []);
      setBank(b.data);
      setLoading(false);
    });
  }
  useEffect(load, [tenant.id]);

  const byKey = Object.fromEntries(methods.map((m) => [m.method, m]));

  async function toggleMethod(key) {
    const current = byKey[key];
    const { error } = await supabase.from('tenant_payment_methods').upsert(
      { tenant_id: tenant.id, method: key, enabled: !current?.enabled, gateway: current?.gateway ?? null },
      { onConflict: 'tenant_id,method' }
    );
    if (error) toast('No pudimos actualizar el método de pago');
    else load();
  }

  async function setGateway(gateway) {
    const { error } = await supabase.from('tenant_payment_methods').upsert(
      { tenant_id: tenant.id, method: 'online', enabled: byKey.online?.enabled ?? false, gateway },
      { onConflict: 'tenant_id,method' }
    );
    if (error) toast('No pudimos actualizar la pasarela');
    else load();
  }

  async function saveBank(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const payload = {
      tenant_id: tenant.id,
      holder: form.get('holder'),
      bank: form.get('bank'),
      account_type: form.get('account_type'),
      account_number: form.get('account_number'),
      rut: form.get('rut'),
      notice_email: form.get('notice_email'),
    };
    const { error } = await supabase.from('tenant_bank_accounts').upsert(payload, { onConflict: 'tenant_id' });
    if (error) toast('No pudimos guardar los datos bancarios');
    else {
      toast('Datos bancarios guardados');
      load();
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Métodos de pago</h1>
        <p className="mt-0.5 text-[12.5px] text-[#64748B]">Lo que el cliente podrá elegir al reservar</p>
      </div>

      {loading && <p className="py-8 text-center text-sm text-[#64748B]">Cargando…</p>}

      {!loading && (
        <div className="grid grid-cols-1 items-start gap-3 @[900px]:grid-cols-2">
          <div className="overflow-hidden rounded-[16px] border border-[#E2E5EC] bg-white">
            <div className="border-b border-[#E2E5EC] px-3.5 py-3 text-[13.5px] font-bold">Métodos habilitados</div>
            {METHODS.map((m) => {
              const on = !!byKey[m.key]?.enabled;
              return (
                <div key={m.key} className="flex items-center gap-3 border-b border-[#F1F2F5] px-3.5 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{m.name}</div>
                    <div className="text-[11.5px] text-[#64748B]">{m.desc}</div>
                  </div>
                  <button type="button" onClick={() => toggleMethod(m.key)} aria-pressed={on} className={'relative h-6 w-10 flex-none rounded-full ' + (on ? 'bg-[#0F172A]' : 'bg-[#D3D7E0]')}>
                    <span className={'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ' + (on ? 'left-[19px]' : 'left-0.5')} />
                  </button>
                </div>
              );
            })}
            <div className="px-3.5 py-3.5">
              <div className="mb-2 text-[11.5px] font-bold text-[#475569]">Pasarela de pago</div>
              <div className="flex flex-wrap gap-1.5">
                {GATEWAYS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGateway(g)}
                    className={'rounded-[9px] border px-2.5 py-1.5 text-[12px] ' + (byKey.online?.gateway === g ? 'border-[#0F172A] bg-[#0F172A] text-white' : 'border-[#E2E5EC]')}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={saveBank} className="rounded-[16px] border border-[#E2E5EC] bg-white p-3.5">
            <div className="mb-2.5 text-[13.5px] font-bold">Datos para transferencia</div>
            <div className="grid grid-cols-1 gap-2.5 @[500px]:grid-cols-2">
              <Field label="Titular" name="holder" defaultValue={bank?.holder} />
              <Field label="Banco" name="bank" defaultValue={bank?.bank} />
              <Field label="Tipo de cuenta" name="account_type" defaultValue={bank?.account_type} />
              <Field label="Número" name="account_number" defaultValue={bank?.account_number} />
              <Field label="RUT" name="rut" defaultValue={bank?.rut} />
              <Field label="Email de aviso" name="notice_email" defaultValue={bank?.notice_email} />
            </div>
            <button type="submit" className="mt-3 min-h-10 w-full rounded-[10px] bg-[#0F172A] text-[13px] font-bold text-white">Guardar datos bancarios</button>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, name, defaultValue }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-bold text-[#475569]">{label}</span>
      <input name={name} defaultValue={defaultValue || ''} className={inputCls} />
    </label>
  );
}
