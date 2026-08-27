import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hhmm } from '../../lib/format';
import { useDismiss, useFloatingPosition } from './floating';

const ITEM_H = 36;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function minuteOptions(step) {
  return Array.from({ length: Math.floor(60 / step) }, (_, i) => i * step);
}

// Una columna del selector estilo "tambor" (iOS): scroll-snap centra siempre una opción en el
// medio, con padding vertical de (alto visible - un ítem) / 2 para que la primera y última
// opción también puedan llegar al centro. commit() redondea al ítem más cercano tras cada scroll.
function Wheel({ options, value, onSettle }) {
  const ref = useRef(null);
  const settleTimer = useRef(null);
  const resumeTimer = useRef(null);
  // Mientras es true, los eventos "scroll" se ignoran: tanto el posicionamiento inicial como
  // cada scrollTo({behavior:'smooth'}) programático (al hacer click en un ítem) disparan eventos
  // de scroll intermedios que, sin este freno, el propio handleScroll interpretaría como arrastre
  // del usuario y "corregiría" a mitad de la animación -- cancelándola de vuelta al valor previo.
  const ignoreScroll = useRef(true);

  useLayoutEffect(() => {
    const idx = Math.max(0, options.indexOf(value));
    ref.current.scrollTop = idx * ITEM_H;
    const t = setTimeout(() => {
      ignoreScroll.current = false;
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- posiciona solo al montar el popover
  }, []);

  useEffect(() => () => {
    clearTimeout(settleTimer.current);
    clearTimeout(resumeTimer.current);
  }, []);

  function commit(idx) {
    const clamped = Math.max(0, Math.min(options.length - 1, idx));
    ignoreScroll.current = true;
    clearTimeout(resumeTimer.current);
    ref.current.scrollTo({ top: clamped * ITEM_H, behavior: 'smooth' });
    onSettle(options[clamped]);
    resumeTimer.current = setTimeout(() => {
      ignoreScroll.current = false;
    }, 400);
  }

  function handleScroll() {
    if (ignoreScroll.current) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => commit(Math.round(ref.current.scrollTop / ITEM_H)), 120);
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="hide-scrollbar h-[180px] w-16 snap-y snap-mandatory overflow-y-auto"
      style={{ paddingTop: PAD, paddingBottom: PAD }}
    >
      {options.map((opt) => (
        <button
          type="button"
          key={opt}
          onClick={() => commit(options.indexOf(opt))}
          className={
            'flex h-9 w-full snap-center items-center justify-center text-[17px] tabular-nums transition-colors ' +
            (opt === value ? 'font-bold text-slate-900' : 'text-slate-400')
          }
        >
          {String(opt).padStart(2, '0')}
        </button>
      ))}
    </div>
  );
}

// Reemplazo de <input type="time">: un botón que muestra "HH:MM" y abre un popover flotante con
// dos tambores (horas / minutos en pasos de `step`), al estilo del selector de hora de iOS.
export default function TimeWheelPicker({ value, onChange, step = 15, label }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const anchorRef = useRef(null);
  const { pos, popRef } = useFloatingPosition(open, anchorRef);
  useDismiss(open, [popRef, anchorRef], () => confirm());

  function openPicker() {
    setDraft(value);
    setOpen(true);
  }

  function confirm() {
    setOpen(false);
    setDraft((d) => {
      if (d !== value) onChange(d);
      return d;
    });
  }

  const minOpts = minuteOptions(step);

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        aria-label={label}
        onClick={() => (open ? confirm() : openPicker())}
        className="rounded-full px-1 font-mono text-[13px] font-semibold tabular-nums text-slate-700 transition-colors hover:text-slate-950"
      >
        {hhmm(value)}
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="z-[100] rounded-[26px] border border-white/70 bg-white/85 p-3 shadow-[0_24px_60px_-16px_rgba(15,23,42,0.28)] backdrop-blur-2xl"
          >
            <div className="relative flex items-center justify-center gap-1">
              <div className="pointer-events-none absolute inset-x-1 top-1/2 -z-10 h-9 -translate-y-1/2 rounded-2xl bg-indigo-50" />
              <Wheel options={HOURS} value={Math.floor(draft / 60)} onSettle={(h) => setDraft((d) => h * 60 + (d % 60))} />
              <span className="z-10 text-[17px] font-bold text-slate-300">:</span>
              <Wheel options={minOpts} value={draft % 60} onSettle={(m) => setDraft((d) => Math.floor(d / 60) * 60 + m)} />
            </div>
            <button type="button" onClick={confirm} className="mt-2.5 w-full rounded-2xl bg-slate-900 py-2 text-[12.5px] font-bold text-white">
              Listo
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
