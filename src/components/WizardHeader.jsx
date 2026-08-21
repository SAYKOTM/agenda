export default function WizardHeader({ tenant, onBack, stepIndex, stepCount }) {
  const showCrumbs = stepIndex != null && stepCount != null;
  // flex-shrink-0: dentro del shell (flex-col, h-dvh) el header no se achica ni se scrollea;
  // solo el bloque de contenido entre header y footer tiene overflow-y-auto propio.
  return (
    <div className="flex-shrink-0 bg-[var(--t-bg)] @[520px]:rounded-t-[28px]">
      <div className="flex items-center gap-3 border-b border-[var(--t-border)] px-4.5 py-4">
        <div className="flex h-9.5 w-9.5 flex-none items-center justify-center rounded-[14px] bg-[var(--t-accent)] text-base font-extrabold text-[var(--t-accent-ink)]">
          {tenant.mark}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold leading-tight tracking-tight">{tenant.name}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-[var(--t-sub)]">{tenant.tagline}</div>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="flex h-8.5 w-8.5 flex-none items-center justify-center rounded-[10px] border border-[var(--t-border)] text-[15px] text-[var(--t-ink)]"
          >
            ←
          </button>
        )}
      </div>
      {showCrumbs && (
        <div className="flex gap-1.5 px-4.5 py-3">
          {Array.from({ length: stepCount }).map((_, i) => (
            <div
              key={i}
              className={'h-[3px] flex-1 rounded-full ' + (i < stepIndex ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border)]')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
