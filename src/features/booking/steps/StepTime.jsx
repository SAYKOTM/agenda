import SlotPicker from '../../../components/SlotPicker';
import { durLabel, hhmm, dateLine, capitalize } from '../../../lib/format';
import { Temporal } from '@js-temporal/polyfill';

export default function StepTime({ tenant, professionalId, serviceIds, totalDurationMin, proLabel, stepIndex, stepCount, date, slot, onPick, onNext }) {
  const pickedLine = !slot
    ? 'Elige una hora'
    : `${capitalize(dateLine(Temporal.PlainDate.from(date)))} · ${hhmm(slot.startMinute)} h`;

  return (
    <>
      <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth flex flex-col gap-4 px-4.5 pb-5 pt-4 [animation:fadeUp_.28s_ease]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">
            Paso {stepIndex} de {stepCount} · {durLabel(totalDurationMin)} en total
          </div>
          <h2 className="mt-1.5 text-[23px] font-extrabold tracking-tight">Fecha y hora</h2>
        </div>
        <SlotPicker
          tenantSlug={tenant.slug}
          professionalId={professionalId}
          serviceIds={serviceIds}
          timeZone={tenant.timezone}
          proLabel={proLabel}
          date={date}
          slot={slot}
          onPick={onPick}
        />
      </div>
      <div className="flex-shrink-0 flex items-center gap-3 border-t border-[var(--t-border)] bg-[var(--t-bg)] px-4.5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-3">
        <div className="min-w-0 flex-1 text-[12.5px] text-[var(--t-sub)]">{pickedLine}</div>
        <button
          type="button"
          onClick={onNext}
          disabled={!slot}
          className="min-h-11 flex-none rounded-[16px] px-4 text-[13.5px] font-bold disabled:cursor-not-allowed"
          style={{ background: slot ? 'var(--t-accent)' : 'var(--t-border)', color: slot ? 'var(--t-accent-ink)' : 'var(--t-sub)' }}
        >
          Continuar
        </button>
      </div>
    </>
  );
}
