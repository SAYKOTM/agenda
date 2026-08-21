export function validateClientForm(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Necesitamos tu nombre para la reserva.';
  if (!/^[0-9+\s()-]{8,}$/.test(form.phone.trim())) errors.phone = 'Ingresa un teléfono válido.';
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Ingresa un email válido.';
  return errors;
}

export default function StepForm({ form, onChange, errors, stepIndex, stepCount, onNext }) {
  const field = (key) => (e) => onChange({ ...form, [key]: e.target.value });

  return (
    <>
      <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth flex flex-col gap-3.5 px-4.5 pb-5 pt-4 [animation:fadeUp_.28s_ease]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">
            Paso {stepIndex} de {stepCount}
          </div>
          <h2 className="mt-1.5 text-[23px] font-extrabold tracking-tight">Tus datos</h2>
          <p className="mt-1.5 text-[12.5px] text-[var(--t-sub)]">No necesitas crear cuenta. Te enviamos la confirmación por WhatsApp y email.</p>
        </div>

        <Field label="Nombre y apellido *" error={errors.name}>
          <input value={form.name} onChange={field('name')} placeholder="Camila Aguirre" className={inputClass(!!errors.name)} />
        </Field>
        <Field label="Teléfono *" error={errors.phone}>
          <input value={form.phone} onChange={field('phone')} placeholder="+56 9 1234 5678" className={inputClass(!!errors.phone)} inputMode="tel" />
        </Field>
        <Field label="Email *" error={errors.email}>
          <input value={form.email} onChange={field('email')} placeholder="camila@correo.cl" className={inputClass(!!errors.email)} type="email" />
        </Field>
        <Field label="Notas para el profesional">
          <textarea
            value={form.notes}
            onChange={field('notes')}
            rows={3}
            placeholder="Alergias, preferencias, referencia de corte…"
            className="min-h-21 w-full resize-y rounded-[14px] border border-[#D3D7E0] bg-white px-3.5 py-3 text-[16px] text-slate-900 @[520px]:text-[14px]"
          />
        </Field>
      </div>
      <div className="flex-shrink-0 border-t border-[var(--t-border)] bg-[var(--t-bg)] px-4.5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={onNext} className="min-h-13 w-full rounded-[18px] text-[15px] font-bold" style={{ background: 'var(--t-accent)', color: 'var(--t-accent-ink)' }}>
          Ir al resumen
        </button>
      </div>
    </>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold">{label}</span>
      {children}
      {error && (
        <span role="alert" className="text-[11.5px] text-[#C0402B]">
          {error}
        </span>
      )}
    </label>
  );
}

function inputClass(bad) {
  // 16px de tamaño de fuente en móvil evita el zoom automático de iOS al enfocar el input.
  return (
    'min-h-12 w-full rounded-[14px] border bg-white px-3.5 text-[16px] text-slate-900 @[520px]:text-[14.5px] ' +
    (bad ? 'border-[#C0402B]' : 'border-[#D3D7E0]')
  );
}
