import { money, durLabel } from '../../../lib/format';

export default function StepServices({ categories, selectedIds, onToggle, proLabel, stepIndex, stepCount, currency, onNext }) {
  const allServices = categories.flatMap((c) => c.services);
  const selected = selectedIds.map((id) => allServices.find((s) => s.id === id)).filter(Boolean);
  const totalPrice = selected.reduce((a, s) => a + s.price_clp, 0);
  const totalDur = selected.reduce((a, s) => a + s.duration_min, 0);

  return (
    <>
      <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth flex flex-col gap-4 px-4.5 pb-5 pt-4 [animation:fadeUp_.28s_ease]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">
            Paso {stepIndex} de {stepCount} · con {proLabel}
          </div>
          <h2 className="mt-1.5 text-[23px] font-extrabold tracking-tight">Elige tus servicios</h2>
          <p className="mt-1.5 text-[12.5px] text-[var(--t-sub)]">Puedes combinar más de uno en la misma reserva.</p>
        </div>

        {categories.map((cat) => (
          <div key={cat.id} className="flex flex-col gap-2">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">{cat.name}</div>
            {cat.services.map((s) => {
              const on = selectedIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onToggle(s.id)}
                  aria-pressed={on}
                  className={
                    'flex min-h-15 items-start gap-3 rounded-[18px] border px-3.5 py-3 text-left ' +
                    (on ? 'border-[var(--t-accent)] bg-[color-mix(in_srgb,var(--t-accent)_12%,transparent)]' : 'border-[var(--t-border)] bg-[var(--t-panel)]')
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{s.name}</span>
                    {s.description && <span className="mt-0.5 block text-[11.5px] text-[var(--t-sub)]">{s.description}</span>}
                    <span className="mt-1.5 block font-mono text-[11px] text-[var(--t-sub)]">
                      {durLabel(s.duration_min)} · {money(s.price_clp, currency)}
                    </span>
                  </span>
                  <span
                    className={
                      'flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[13px] font-bold ' +
                      (on ? 'border-[var(--t-accent)] bg-[var(--t-accent)] text-[var(--t-accent-ink)]' : 'border-[var(--t-border)] text-[var(--t-sub)]')
                    }
                  >
                    {on ? '✓' : '+'}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex-shrink-0 flex items-center gap-3 border-t border-[var(--t-border)] bg-[var(--t-bg)] px-4.5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--t-sub)]">
            {selected.length ? `${selected.length} ${selected.length > 1 ? 'servicios' : 'servicio'} · ${durLabel(totalDur)}` : 'Nada seleccionado aún'}
          </div>
          <div className="font-mono text-lg font-medium">{money(totalPrice, currency)}</div>
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={!selected.length}
          className="min-h-11 flex-none rounded-[16px] px-4 text-[13.5px] font-bold disabled:cursor-not-allowed"
          style={{
            background: selected.length ? 'var(--t-accent)' : 'var(--t-border)',
            color: selected.length ? 'var(--t-accent-ink)' : 'var(--t-sub)',
          }}
        >
          Ver horarios
        </button>
      </div>
    </>
  );
}
