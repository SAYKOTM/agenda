// Motor de cálculo de horarios disponibles ("slots") para un profesional en una fecha dada.
//
// Reglas de negocio implementadas (ver README de la fase 1 en el repo para el detalle):
// - Disponibilidad recurrente semanal por profesional, en múltiples bloques por día.
// - Excepciones de tipo "blocked" (restan disponibilidad, día completo o un rango) y
//   "extra" (suman disponibilidad puntual, por ejemplo abrir un domingo).
// - Buffers antes/después de servicio: se aplican solo en los bordes del combo completo
//   (antes del primer servicio y después del último), no entre servicios internos.
// - Lead time mínimo: no se puede reservar un slot que empiece antes de `now + minLeadTimeMin`.
// - Los solapamientos con reservas existentes se calculan sobre el rango "bloqueado"
//   (servicio + buffers) tanto del candidato como de la reserva existente.
// - Todo el cálculo de instantes usa Temporal.ZonedDateTime para ser correcto en cambios de
//   horario de verano: los slots se generan en minutos de reloj local y se convierten a
//   instantes absolutos por separado para cada slot, nunca sumando duraciones en UTC.
import { Temporal } from '@js-temporal/polyfill';

export type TimeWindow = { start: number; end: number }; // minutos desde medianoche local, [start, end)

export type WeeklyBlock = { weekday: number; start: number; end: number }; // weekday: 0=lunes .. 6=domingo

export type AvailabilityException = {
  date: string; // 'YYYY-MM-DD' en la fecha local del tenant
  type: 'blocked' | 'extra';
  start?: number | null; // null + end null => día completo (solo válido para "blocked")
  end?: number | null;
};

export type ServiceSpec = {
  id: string;
  durationMin: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
};

export type ExistingBooking = {
  id?: string;
  startInstant: string; // ISO instant, inicio del servicio (sin buffer)
  endInstant: string; // ISO instant, fin del servicio (sin buffer)
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  status: string;
};

export type ComputeSlotsInput = {
  timeZone: string;
  date: string; // 'YYYY-MM-DD' fecha local
  services: ServiceSpec[]; // en el orden en que se realizan
  weeklyBlocks: WeeklyBlock[];
  exceptions?: AvailabilityException[];
  existingBookings?: ExistingBooking[];
  minLeadTimeMin?: number;
  slotIntervalMin?: number;
  now?: string; // ISO instant; por defecto el momento actual
};

export type Slot = {
  startMinute: number;
  startInstant: string;
  endInstant: string;
  blockedStartInstant: string;
  blockedEndInstant: string;
};

const CANCELLED_STATUSES = new Set(['cancelada']);

function normalizeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = windows
    .filter((w) => w.end > w.start)
    .map((w) => ({ start: Math.max(0, w.start), end: Math.min(1440, w.end) }))
    .sort((a, b) => a.start - b.start);
  const out: TimeWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else out.push({ ...w });
  }
  return out;
}

function subtractWindow(windows: TimeWindow[], cut: TimeWindow): TimeWindow[] {
  const out: TimeWindow[] = [];
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

export function effectiveWindowsForDate(
  weeklyBlocks: WeeklyBlock[],
  exceptions: AvailabilityException[],
  date: string
): TimeWindow[] {
  const plainDate = Temporal.PlainDate.from(date);
  const weekday = plainDate.dayOfWeek - 1; // Temporal: 1=lunes..7=domingo -> 0=lunes..6=domingo
  let windows = normalizeWindows(
    weeklyBlocks.filter((b) => b.weekday === weekday).map((b) => ({ start: b.start, end: b.end }))
  );

  const dayExceptions = exceptions.filter((e) => e.date === date);
  for (const ex of dayExceptions.filter((e) => e.type === 'blocked')) {
    const range: TimeWindow =
      ex.start == null || ex.end == null ? { start: 0, end: 1440 } : { start: ex.start, end: ex.end };
    windows = subtractWindow(windows, range);
  }
  for (const ex of dayExceptions.filter((e) => e.type === 'extra')) {
    if (ex.start == null || ex.end == null) continue;
    windows = normalizeWindows(windows.concat([{ start: ex.start, end: ex.end }]));
  }
  return normalizeWindows(windows);
}

function localMinutesToInstant(timeZone: string, date: string, minutes: number): Temporal.Instant {
  const plainDate = Temporal.PlainDate.from(date);
  const dayOverflow = Math.floor(minutes / 1440);
  const minuteOfDay = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const zdt = plainDate.toZonedDateTime({
    timeZone,
    plainTime: Temporal.PlainTime.from({ hour, minute }),
  });
  return dayOverflow ? zdt.add({ days: dayOverflow }).toInstant() : zdt.toInstant();
}

export function computeAvailableSlots(input: ComputeSlotsInput): Slot[] {
  const {
    timeZone,
    date,
    services,
    weeklyBlocks,
    exceptions = [],
    existingBookings = [],
    minLeadTimeMin = 0,
    slotIntervalMin = 30,
    now,
  } = input;

  if (!services.length) return [];

  const bufferBefore = services[0].bufferBeforeMin || 0;
  const bufferAfter = services[services.length - 1].bufferAfterMin || 0;
  const coreSpan = services.reduce((sum, s) => sum + s.durationMin, 0);

  const windows = effectiveWindowsForDate(weeklyBlocks, exceptions, date);
  if (!windows.length) return [];

  const nowInstant = now ? Temporal.Instant.from(now) : Temporal.Now.instant();
  const earliestInstant = nowInstant.add({ minutes: minLeadTimeMin });

  const bookingRanges = existingBookings
    .filter((b) => !CANCELLED_STATUSES.has(b.status))
    .map((b) => ({
      start: Temporal.Instant.from(b.startInstant).subtract({ minutes: b.bufferBeforeMin || 0 }),
      end: Temporal.Instant.from(b.endInstant).add({ minutes: b.bufferAfterMin || 0 }),
    }));

  const slots: Slot[] = [];
  for (const w of windows) {
    let m = Math.ceil(w.start / slotIntervalMin) * slotIntervalMin;
    while (m - bufferBefore < w.start) m += slotIntervalMin;

    for (; m + coreSpan + bufferAfter <= w.end; m += slotIntervalMin) {
      const blockedStart = localMinutesToInstant(timeZone, date, m - bufferBefore);
      const startInstant = localMinutesToInstant(timeZone, date, m);
      const endInstant = localMinutesToInstant(timeZone, date, m + coreSpan);
      const blockedEnd = localMinutesToInstant(timeZone, date, m + coreSpan + bufferAfter);

      if (Temporal.Instant.compare(startInstant, earliestInstant) < 0) continue;

      const overlaps = bookingRanges.some(
        (r) =>
          Temporal.Instant.compare(blockedStart, r.end) < 0 && Temporal.Instant.compare(r.start, blockedEnd) < 0
      );
      if (overlaps) continue;

      slots.push({
        startMinute: m,
        startInstant: startInstant.toString(),
        endInstant: endInstant.toString(),
        blockedStartInstant: blockedStart.toString(),
        blockedEndInstant: blockedEnd.toString(),
      });
    }
  }
  return slots;
}
