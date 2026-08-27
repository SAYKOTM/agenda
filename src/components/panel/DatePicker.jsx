import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Temporal } from '@js-temporal/polyfill';
import { MONTHS_LONG, monthLabel } from '../../lib/format';
import { useDismiss, useFloatingPosition } from './floating';

const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function CalendarGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <rect x="3" y="5" width="18" height="16" rx="4" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

// Reemplazo de <input type="date">: un botón con la fecha elegida que abre un calendario flotante
// (tarjeta de vidrio) para elegir el día, en vez del selector nativo del navegador.
export default function DatePicker({ value, onChange, placeholder = 'Elegir fecha' }) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => (value ? Temporal.PlainDate.from(value) : Temporal.Now.plainDateISO()).toPlainYearMonth());
  const anchorRef = useRef(null);
  const { pos, popRef } = useFloatingPosition(open, anchorRef);
  useDismiss(open, [popRef, anchorRef], () => setOpen(false));

  function toggle() {
    if (!open) setViewMonth((value ? Temporal.PlainDate.from(value) : Temporal.Now.plainDateISO()).toPlainYearMonth());
    setOpen((o) => !o);
  }

  function pick(day) {
    onChange(viewMonth.toPlainDate({ day }).toString());
    setOpen(false);
  }

  const firstOfMonth = viewMonth.toPlainDate({ day: 1 });
  const leadingBlanks = firstOfMonth.dayOfWeek - 1;
  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= viewMonth.daysInMonth; d++) cells.push(d);

  const selected = value ? Temporal.PlainDate.from(value) : null;

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        onClick={toggle}
        className={
          'flex min-h-11 w-full items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/70 px-3.5 text-left text-[13px] font-medium backdrop-blur-sm transition-colors hover:border-slate-300 ' +
          (value ? 'text-slate-800' : 'text-slate-400')
        }
      >
        <CalendarGlyph />
        {selected ? `${selected.day} de ${MONTHS_LONG[selected.month - 1]} de ${selected.year}` : placeholder}
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="z-[100] w-[280px] rounded-[26px] border border-white/70 bg-white/85 p-3.5 shadow-[0_24px_60px_-16px_rgba(15,23,42,0.28)] backdrop-blur-2xl"
          >
            <div className="mb-2.5 flex items-center justify-between">
              <button type="button" onClick={() => setViewMonth(viewMonth.subtract({ months: 1 }))} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-900/5 hover:text-slate-700">
                ‹
              </button>
              <span className="text-[13px] font-bold text-slate-800">{monthLabel(firstOfMonth)}</span>
              <button type="button" onClick={() => setViewMonth(viewMonth.add({ months: 1 }))} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-900/5 hover:text-slate-700">
                ›
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7">
              {WEEKDAYS_SHORT.map((w, i) => (
                <div key={i} className="text-center text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const iso = viewMonth.toPlainDate({ day: d }).toString();
                const isSelected = selected && iso === selected.toString();
                return (
                  <button
                    type="button"
                    key={i}
                    onClick={() => pick(d)}
                    className={
                      'mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[12.5px] font-medium transition-colors ' +
                      (isSelected ? 'bg-slate-900 font-bold text-white' : 'text-slate-700 hover:bg-slate-900/5')
                    }
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
