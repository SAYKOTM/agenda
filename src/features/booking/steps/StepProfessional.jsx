export default function StepProfessional({ professionals, selected, onSelect }) {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth flex flex-col gap-3.5 px-4.5 py-4 [animation:fadeUp_.28s_ease]">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">Paso 1 de {professionals.length > 1 ? 5 : 4}</div>
        <h2 className="mt-1.5 text-[23px] font-extrabold tracking-tight">¿Con quién te atiendes?</h2>
      </div>
      <div className="flex flex-col gap-2">
        {professionals.map((p) => (
          <ProCard key={p.id} label={p.name} sub={p.role_title} initials={p.initials} on={selected === p.id} onClick={() => onSelect(p.id)} />
        ))}
        <ProCard label="Cualquiera disponible" sub="Te asignamos al primero con hora libre" initials="★" on={selected === 'any'} onClick={() => onSelect('any')} />
      </div>
    </div>
  );
}

function ProCard({ label, sub, initials, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'flex min-h-15 items-center gap-3 rounded-[18px] border px-3.5 py-3 text-left ' +
        (on ? 'border-[var(--t-accent)] bg-[color-mix(in_srgb,var(--t-accent)_12%,transparent)]' : 'border-[var(--t-border)] bg-[var(--t-panel)]')
      }
    >
      <span className="flex h-11.5 w-11.5 flex-none items-center justify-center rounded-[15px] bg-[var(--t-border)] text-sm font-bold">{initials}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold">{label}</span>
        {sub && <span className="mt-0.5 block text-xs text-[var(--t-sub)]">{sub}</span>}
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
  );
}
