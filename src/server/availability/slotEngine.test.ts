import { describe, expect, it } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import { computeAvailableSlots, effectiveWindowsForDate, type WeeklyBlock } from './slotEngine';

const TZ = 'America/Santiago';

// Lunes a viernes 10:00-20:00, sábado 10:00-16:00, domingo cerrado (igual que Roble Barbería).
const ROBLE_BLOCKS: WeeklyBlock[] = [
  { weekday: 0, start: 600, end: 1200 },
  { weekday: 1, start: 600, end: 1200 },
  { weekday: 2, start: 600, end: 1200 },
  { weekday: 3, start: 600, end: 1200 },
  { weekday: 4, start: 600, end: 1200 },
  { weekday: 5, start: 600, end: 960 },
];

const CORTE = { id: 'corte', durationMin: 35, bufferBeforeMin: 0, bufferAfterMin: 10 };
const BARBA = { id: 'barba', durationMin: 20, bufferBeforeMin: 0, bufferAfterMin: 5 };

// 2026-08-19 es miércoles (weekday=2). 2026-08-22 es sábado, 2026-08-23 domingo.
const WED = '2026-08-19';
const SAT = '2026-08-22';
const SUN = '2026-08-23';

function farPastNow() {
  return '2000-01-01T00:00:00Z';
}

describe('effectiveWindowsForDate', () => {
  it('múltiples bloques por día: turno partido se respeta sin fusionar el hueco', () => {
    const blocks: WeeklyBlock[] = [
      { weekday: 2, start: 540, end: 780 }, // 09:00-13:00
      { weekday: 2, start: 900, end: 1140 }, // 15:00-19:00
    ];
    const windows = effectiveWindowsForDate(blocks, [], WED);
    expect(windows).toEqual([
      { start: 540, end: 780 },
      { start: 900, end: 1140 },
    ]);
  });

  it('excepción de bloqueo total elimina toda la disponibilidad del día', () => {
    const windows = effectiveWindowsForDate(
      ROBLE_BLOCKS,
      [{ date: WED, type: 'blocked', start: null, end: null }],
      WED
    );
    expect(windows).toEqual([]);
  });

  it('excepción de bloqueo parcial resta solo el rango indicado', () => {
    const windows = effectiveWindowsForDate(
      ROBLE_BLOCKS,
      [{ date: WED, type: 'blocked', start: 840, end: 960 }], // 14:00-16:00
      WED
    );
    expect(windows).toEqual([
      { start: 600, end: 840 },
      { start: 960, end: 1200 },
    ]);
  });

  it('excepción de disponibilidad extra abre un día normalmente cerrado', () => {
    const windows = effectiveWindowsForDate(
      ROBLE_BLOCKS,
      [{ date: SUN, type: 'extra', start: 660, end: 900 }], // 11:00-15:00
      SUN
    );
    expect(windows).toEqual([{ start: 660, end: 900 }]);
  });
});

describe('computeAvailableSlots', () => {
  it('respeta múltiples bloques por día (no ofrece slots en el hueco del turno partido)', () => {
    const blocks: WeeklyBlock[] = [
      { weekday: 2, start: 540, end: 780 },
      { weekday: 2, start: 900, end: 1140 },
    ];
    const slots = computeAvailableSlots({
      timeZone: TZ,
      date: WED,
      services: [{ id: 'x', durationMin: 30 }],
      weeklyBlocks: blocks,
      now: farPastNow(),
    });
    expect(slots.every((s) => s.startMinute + 30 <= 780 || s.startMinute >= 900)).toBe(true);
    expect(slots.some((s) => s.startMinute >= 780 && s.startMinute < 900)).toBe(false);
  });

  it('un bloqueo total del día deja la agenda sin cupos', () => {
    const slots = computeAvailableSlots({
      timeZone: TZ,
      date: WED,
      services: [CORTE],
      weeklyBlocks: ROBLE_BLOCKS,
      exceptions: [{ date: WED, type: 'blocked' }],
      now: farPastNow(),
    });
    expect(slots).toEqual([]);
  });

  it('una excepción de disponibilidad extra habilita cupos un domingo cerrado', () => {
    const slots = computeAvailableSlots({
      timeZone: TZ,
      date: SUN,
      services: [{ id: 'x', durationMin: 30 }],
      weeklyBlocks: ROBLE_BLOCKS,
      exceptions: [{ date: SUN, type: 'extra', start: 660, end: 900 }],
      now: farPastNow(),
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.startMinute >= 660 && s.startMinute < 900)).toBe(true);
  });

  it('aplica el buffer solo en los bordes del combo, no entre servicios internos', () => {
    const slots = computeAvailableSlots({
      timeZone: TZ,
      date: WED,
      services: [CORTE, BARBA], // 35+20=55 min núcleo, buffer 0 antes / 5 después (del último)
      weeklyBlocks: ROBLE_BLOCKS,
      slotIntervalMin: 30,
      now: farPastNow(),
    });
    const first = slots[0];
    expect(first.startMinute).toBe(600);
    const start = Temporal.Instant.from(first.startInstant);
    const end = Temporal.Instant.from(first.endInstant);
    expect(start.until(end).total('minutes')).toBe(55); // sin buffer intermedio de 10 (el de CORTE)
    const blockedEnd = Temporal.Instant.from(first.blockedEndInstant);
    expect(end.until(blockedEnd).total('minutes')).toBe(5); // buffer del último servicio (BARBA)
  });

  it('un buffer "después" impide agendar un slot que empalme con el buffer del anterior', () => {
    const svc = { id: 's', durationMin: 30, bufferAfterMin: 20 };
    const slots = computeAvailableSlots({
      timeZone: TZ,
      date: WED,
      services: [svc],
      weeklyBlocks: [{ weekday: 2, start: 600, end: 660 }], // ventana corta de 1h
      slotIntervalMin: 15,
      now: farPastNow(),
    });
    // núcleo 30 + buffer 20 = 50 min bloqueados; en una ventana de 60 min solo cabe un slot (10:00)
    expect(slots.map((s) => s.startMinute)).toEqual([600]);
  });

  it('lead time mínimo excluye slots demasiado próximos a "ahora"', () => {
    // 19 ago 2026 10:00 America/Santiago -> instante:
    const tenMin = '2026-08-19T14:00:00Z'; // offset -04:00 => 10:00 local
    const slots = computeAvailableSlots({
      timeZone: TZ,
      date: WED,
      services: [{ id: 'x', durationMin: 30 }],
      weeklyBlocks: ROBLE_BLOCKS,
      minLeadTimeMin: 90,
      now: tenMin,
    });
    // con 90 min de anticipación, el primer slot válido debería ser 11:30 (690), no 10:00/10:30
    expect(slots[0].startMinute).toBe(690);
    expect(slots.some((s) => s.startMinute < 690)).toBe(false);
  });

  it('excluye slots que se solapan con una reserva existente (considerando sus buffers)', () => {
    const existing = {
      startInstant: '2026-08-19T15:00:00Z', // 11:00 local
      endInstant: '2026-08-19T15:35:00Z', // 11:35 local (35 min)
      bufferAfterMin: 10,
      status: 'confirmada',
    };
    const slots = computeAvailableSlots({
      timeZone: TZ,
      date: WED,
      services: [{ id: 'x', durationMin: 30 }],
      weeklyBlocks: ROBLE_BLOCKS,
      existingBookings: [existing],
      slotIntervalMin: 30,
      now: farPastNow(),
    });
    // ocupado real: 11:00-11:45 (con buffer). 11:00 solapa directo; 10:30-11:00 es adyacente
    // (termina justo cuando empieza lo ocupado) y por lo tanto sigue disponible.
    expect(slots.some((s) => s.startMinute === 660)).toBe(false); // 11:00 solapa directo
    expect(slots.some((s) => s.startMinute === 630)).toBe(true); // 10:30-11:00, adyacente, no solapa
    expect(slots.some((s) => s.startMinute === 720)).toBe(true); // 12:00 libre, después del buffer
  });

  it('cancelar una reserva libera su horario', () => {
    const base = {
      timeZone: TZ,
      date: WED,
      services: [{ id: 'x', durationMin: 30 }],
      weeklyBlocks: ROBLE_BLOCKS,
      slotIntervalMin: 30,
      now: farPastNow(),
    };
    const occupied = {
      startInstant: '2026-08-19T15:00:00Z',
      endInstant: '2026-08-19T15:30:00Z',
      status: 'confirmada',
    };
    const withBooking = computeAvailableSlots({ ...base, existingBookings: [occupied] });
    expect(withBooking.some((s) => s.startMinute === 660)).toBe(false);

    const cancelled = { ...occupied, status: 'cancelada' };
    const afterCancel = computeAvailableSlots({ ...base, existingBookings: [cancelled] });
    expect(afterCancel.some((s) => s.startMinute === 660)).toBe(true);
  });

  it('combos de varios servicios exigen que el bloque completo quepa en una sola ventana', () => {
    // ventana corta de 90 min; combo de 100 min núcleo no debe caber
    const slots = computeAvailableSlots({
      timeZone: TZ,
      date: WED,
      services: [
        { id: 'a', durationMin: 60 },
        { id: 'b', durationMin: 40 },
      ],
      weeklyBlocks: [{ weekday: 2, start: 600, end: 690 }],
      now: farPastNow(),
    });
    expect(slots).toEqual([]);
  });

  it('cambio de horario de verano: el motor usa tiempo real (Instant), no aritmética ingenua en UTC', () => {
    // Busca en el tzdb real un día con transición de horario de verano para America/Santiago,
    // escaneando varios años históricos para no depender de una fecha memorizada a mano.
    function findTransitionDate(): string | null {
      for (let year = 2008; year <= 2016; year++) {
        let prevOffset: number | null = null;
        for (let day = 1; day <= 365; day++) {
          const pd = Temporal.PlainDate.from({ year, month: 1, day: 1 }).add({ days: day - 1 });
          if (pd.year !== year) break;
          const zdt = pd.toZonedDateTime({ timeZone: TZ, plainTime: Temporal.PlainTime.from({ hour: 12 }) });
          const offset = zdt.offsetNanoseconds;
          if (prevOffset !== null && offset !== prevOffset) return pd.toString();
          prevOffset = offset;
        }
      }
      return null;
    }

    const transitionDate = findTransitionDate();
    expect(transitionDate).not.toBeNull();
    const dayBefore = Temporal.PlainDate.from(transitionDate!).subtract({ days: 1 }).toString();

    const blocks: WeeklyBlock[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: 540, end: 1080 })); // 09:00-18:00 todos los días

    const slotsBefore = computeAvailableSlots({
      timeZone: TZ,
      date: dayBefore,
      services: [{ id: 'x', durationMin: 30 }],
      weeklyBlocks: blocks,
      now: farPastNow(),
    });
    const slotsAfter = computeAvailableSlots({
      timeZone: TZ,
      date: transitionDate!,
      services: [{ id: 'x', durationMin: 30 }],
      weeklyBlocks: blocks,
      now: farPastNow(),
    });

    // La cantidad de slots en horario local no cambia por el DST: el negocio sigue abriendo
    // 09:00-18:00 en hora de pared, sin importar el corrimiento de huso horario.
    expect(slotsAfter.length).toBe(slotsBefore.length);

    // Pero el offset UTC real sí cambió (si no, el test no estaría probando nada).
    const offsetBefore = Temporal.PlainDate.from(dayBefore)
      .toZonedDateTime({ timeZone: TZ, plainTime: Temporal.PlainTime.from({ hour: 12 }) })
      .offsetNanoseconds;
    const offsetAfter = Temporal.PlainDate.from(transitionDate!)
      .toZonedDateTime({ timeZone: TZ, plainTime: Temporal.PlainTime.from({ hour: 12 }) })
      .offsetNanoseconds;
    expect(offsetAfter).not.toBe(offsetBefore);

    // El lead time debe medirse en tiempo real transcurrido: fijar "now" exactamente
    // `minLeadTimeMin` antes del instante real del primer slot post-transición debe incluirlo,
    // un minuto menos debe excluirlo, incluso cruzando el cambio de huso horario.
    const firstSlotInstant = Temporal.Instant.from(slotsAfter[0].startInstant);
    const minLeadTimeMin = 60;
    const nowJustEnough = firstSlotInstant.subtract({ minutes: minLeadTimeMin }).toString();
    const nowTooLate = firstSlotInstant.subtract({ minutes: minLeadTimeMin - 1 }).toString();

    const includesAtBoundary = computeAvailableSlots({
      timeZone: TZ,
      date: transitionDate!,
      services: [{ id: 'x', durationMin: 30 }],
      weeklyBlocks: blocks,
      minLeadTimeMin,
      now: nowJustEnough,
    });
    const excludesPastBoundary = computeAvailableSlots({
      timeZone: TZ,
      date: transitionDate!,
      services: [{ id: 'x', durationMin: 30 }],
      weeklyBlocks: blocks,
      minLeadTimeMin,
      now: nowTooLate,
    });
    expect(includesAtBoundary.some((s) => s.startInstant === slotsAfter[0].startInstant)).toBe(true);
    expect(excludesPastBoundary.some((s) => s.startInstant === slotsAfter[0].startInstant)).toBe(false);
  });
});
