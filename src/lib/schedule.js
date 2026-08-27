import { Temporal } from '@js-temporal/polyfill';

// Misma lógica que supabase/functions/_shared/slotEngine.ts (effectiveWindowsForDate), reescrita
// en JS de navegador para poder pintar en la UI (Agenda del panel, selector de fecha del
// cliente) los mismos bloques no laborales que usa el backend para calcular cupos reales -- sin
// duplicar la fuente de verdad de disponibilidad, solo su representación visual.

function normalizeWindows(windows) {
  const sorted = windows
    .filter((w) => w.end > w.start)
    .map((w) => ({ start: Math.max(0, w.start), end: Math.min(1440, w.end) }))
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else out.push({ ...w });
  }
  return out;
}

function subtractWindow(windows, cut) {
  const out = [];
  for (const w of windows) {
    if (cut.end <= w.start || cut.start >= w.end) {
      out.push(w);
      continue;
    }
    if (cut.start > w.start) out.push({ start: w.start, end: Math.min(cut.start, w.end) });
    if (cut.end < w.end) out.push({ start: Math.max(cut.end, w.start), end: w.end });
  }
  return out;
}

// weeklyBlocks: [{weekday, start_min, end_min}], exceptions: [{date, type, start_min, end_min}]
export function effectiveWindowsForDate(weeklyBlocks, exceptions, date) {
  const plainDate = typeof date === 'string' ? Temporal.PlainDate.from(date) : date;
  const weekday = plainDate.dayOfWeek - 1; // 0=lunes .. 6=domingo

  let windows = normalizeWindows(
    (weeklyBlocks || []).filter((b) => b.weekday === weekday).map((b) => ({ start: b.start_min, end: b.end_min }))
  );

  const iso = plainDate.toString();
  const dayExceptions = (exceptions || []).filter((e) => e.date === iso);
  for (const ex of dayExceptions.filter((e) => e.type === 'blocked')) {
    const range = ex.start_min == null || ex.end_min == null ? { start: 0, end: 1440 } : { start: ex.start_min, end: ex.end_min };
    windows = subtractWindow(windows, range);
  }
  for (const ex of dayExceptions.filter((e) => e.type === 'extra')) {
    if (ex.start_min == null || ex.end_min == null) continue;
    windows = normalizeWindows(windows.concat([{ start: ex.start_min, end: ex.end_min }]));
  }
  return normalizeWindows(windows);
}

export function isWorkingDay(weeklyBlocks, exceptions, date) {
  return effectiveWindowsForDate(weeklyBlocks, exceptions, date).length > 0;
}

// Divide un bloque {start_min, end_min} en dos si el intervalo de colación [lunchStart, lunchEnd)
// queda estrictamente adentro (con margen a ambos lados). Si la colación no cabe completa dentro
// del bloque -- el día está cerrado (sin bloques), el bloque es más corto que la colación, o solo
// se solapa parcialmente en un borde -- se devuelve el bloque sin tocar: nunca se genera un
// bloque de duración cero ni se recorta un bloque que no puede alojar la colación completa.
export function splitBlockForLunch(block, lunchStart, lunchEnd) {
  if (lunchStart <= block.start_min || lunchEnd >= block.end_min) return [block];
  return [
    { ...block, end_min: lunchStart },
    { ...block, start_min: lunchEnd },
  ];
}

// Aplica la colación a todos los bloques de un mismo día: cada bloque se evalúa por separado, así
// que un turno partido armado a mano (p. ej. 09:00-13:00 y 15:00-19:00) solo se divide en el
// bloque que efectivamente contiene la colación -- el resto queda intacto.
export function applyLunchBreakToDayBlocks(dayBlocks, lunchStart, lunchEnd) {
  return dayBlocks.flatMap((b) => splitBlockForLunch(b, lunchStart, lunchEnd));
}

// Tramos NO laborales dentro de [dayStartMin, dayEndMin), para pintar overlays grises en la
// grilla de horas de la Agenda del panel.
export function closedRangesWithin(weeklyBlocks, exceptions, date, dayStartMin, dayEndMin) {
  const working = effectiveWindowsForDate(weeklyBlocks, exceptions, date);
  const closed = [];
  let cursor = dayStartMin;
  for (const w of working) {
    const s = Math.max(w.start, dayStartMin);
    const e = Math.min(w.end, dayEndMin);
    if (s > cursor) closed.push({ start: cursor, end: Math.min(s, dayEndMin) });
    cursor = Math.max(cursor, e);
  }
  if (cursor < dayEndMin) closed.push({ start: cursor, end: dayEndMin });
  return closed.filter((r) => r.end > r.start);
}
