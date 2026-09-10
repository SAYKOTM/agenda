import { useState } from 'react';
import { Link } from 'react-router-dom';
import { money } from '../../../lib/format';
import { paymentMethodLabel } from '../../../lib/paymentLabels';

const PAY_DESCRIPTIONS = {
  efectivo: 'Pagas al llegar. Se reserva sin cargo.',
  transferencia: 'Te mostramos los datos para transferir.',
  online: 'Tarjeta de crédito o débito, seguro.',
};

export default function StepPay({
  proLabel,
  pickedLine,
  items,
  totalPrice,
  loyaltyPreview,
  cancellationPolicy,
  currency,
  paymentMethods,
  bankAccount,
  selectedMethod,
  onSelectMethod,
  stepIndex,
  stepCount,
  onPay,
  submitting,
}) {
  const [consent, setConsent] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const gateway = paymentMethods.find((m) => m.method === 'online')?.gateway;
  const discountPct = Number(loyaltyPreview?.discountPct) || 0;
  const discountAmount = discountPct > 0 ? Math.round((totalPrice * discountPct) / 100) : 0;
  const finalTotal = totalPrice - discountAmount;

  return (
    <>
      <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth flex flex-col gap-4 px-4.5 pb-5 pt-4 [animation:fadeUp_.28s_ease]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">
            Paso {stepIndex} de {stepCount}
          </div>
          <h2 className="mt-1.5 text-[23px] font-extrabold tracking-tight">Resumen y pago</h2>
        </div>

        <div className="flex flex-col gap-2.5 rounded-[20px] border border-[var(--t-border)] bg-[var(--t-panel)] p-3.5">
          <Row label="Profesional" value={proLabel} />
          <Row label="Fecha" value={pickedLine} />
          <div className="h-px bg-[var(--t-border)]" />
          {items.map((it) => (
            <div key={it.id} className="flex justify-between text-[13px]">
              <span>{it.name}</span>
              <span className="font-mono text-[12.5px]">{money(it.price_clp, currency)}</span>
            </div>
          ))}
          <div className="h-px bg-[var(--t-border)]" />
          {discountAmount > 0 && (
            <div className="flex justify-between text-[13px]" style={{ color: 'var(--t-accent)' }}>
              <span>Descuento de fidelidad · {loyaltyPreview.tier} ({discountPct}%)</span>
              <span className="font-mono text-[12.5px]">-{money(discountAmount, currency)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-bold">Total</span>
            <span className="font-mono text-[19px] font-medium">{money(finalTotal, currency)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">Método de pago</div>
          {paymentMethods.map((m) => {
            const def = { label: paymentMethodLabel(m.method, gateway), desc: PAY_DESCRIPTIONS[m.method] };
            const on = selectedMethod === m.method;
            return (
              <div key={m.method}>
                <button
                  type="button"
                  onClick={() => onSelectMethod(m.method)}
                  aria-pressed={on}
                  className={
                    'flex min-h-15 w-full items-center gap-3 rounded-[18px] border px-3.5 py-3 text-left ' +
                    (on ? 'border-[var(--t-accent)] bg-[color-mix(in_srgb,var(--t-accent)_12%,transparent)]' : 'border-[var(--t-border)] bg-[var(--t-panel)]')
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{def.label}</span>
                    <span className="mt-0.5 block text-[11.5px] text-[var(--t-sub)]">{def.desc}</span>
                  </span>
                  <span
                    className={
                      'flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[13px] font-bold ' +
                      (on ? 'border-[var(--t-accent)] bg-[var(--t-accent)] text-[var(--t-accent-ink)]' : 'border-[var(--t-border)] text-[var(--t-sub)]')
                    }
                  >
                    {on ? '✓' : ''}
                  </span>
                </button>
                {m.method === 'transferencia' && on && bankAccount && (
                  <div className="mt-2 rounded-[15px] border border-[var(--t-border)] px-3.5 py-3 font-mono text-[11.5px] leading-[1.7]">
                    <div>{bankAccount.holder}</div>
                    <div>
                      {bankAccount.bank} · {bankAccount.account_type}
                    </div>
                    <div>Cuenta {bankAccount.account_number}</div>
                    <div>RUT {bankAccount.rut}</div>
                    <div>{bankAccount.notice_email}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <label className="flex items-start gap-2.5 text-[12px] text-[var(--t-sub)]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none accent-[var(--t-accent)]"
          />
          <span>
            Acepto la{' '}
            <Link to="/privacidad" target="_blank" className="font-semibold underline" style={{ color: 'var(--t-accent)' }}>
              política de privacidad
            </Link>{' '}
            y el tratamiento de mis datos para gestionar esta reserva.
          </span>
        </label>

        <label className="flex items-start gap-2.5 text-[12px] text-[var(--t-sub)]">
          <input
            type="checkbox"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none accent-[var(--t-accent)]"
          />
          <span>Confirmo que soy mayor de edad, o el adulto responsable de la persona que recibirá el servicio.</span>
        </label>
      </div>
      <div className="flex-shrink-0 border-t border-[var(--t-border)] bg-[var(--t-bg)] px-4.5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={onPay}
          disabled={!selectedMethod || !consent || !ageConfirmed || submitting}
          className="min-h-13 w-full rounded-[18px] text-[15px] font-bold disabled:cursor-not-allowed"
          style={{
            background: selectedMethod && consent && ageConfirmed && !submitting ? 'var(--t-accent)' : 'var(--t-border)',
            color: selectedMethod && consent && ageConfirmed && !submitting ? 'var(--t-accent-ink)' : 'var(--t-sub)',
          }}
        >
          {submitting ? 'Confirmando…' : selectedMethod === 'online' ? `Pagar ${money(finalTotal, currency)}` : 'Confirmar reserva'}
        </button>
        <p className="mt-2 text-center text-[11px] text-[var(--t-sub)]">{cancellationPolicy || 'Cancelación gratuita hasta 4 horas antes.'}</p>
      </div>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-[var(--t-sub)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
