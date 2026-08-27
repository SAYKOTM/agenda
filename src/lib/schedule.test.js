import { describe, expect, it } from 'vitest';
import { applyLunchBreakToDayBlocks, splitBlockForLunch } from './schedule';

describe('splitBlockForLunch', () => {
  it('divide el bloque en dos cuando la colación cae estrictamente adentro', () => {
    const block = { id: 'b1', weekday: 0, start_min: 600, end_min: 1200 }; // 10:00-20:00
    const result = splitBlockForLunch(block, 840, 900); // 14:00-15:00
    expect(result).toEqual([
      { id: 'b1', weekday: 0, start_min: 600, end_min: 840 },
      { id: 'b1', weekday: 0, start_min: 900, end_min: 1200 },
    ]);
  });

  it('no toca el bloque si la colación empieza justo en el borde de inicio', () => {
    const block = { start_min: 600, end_min: 1200 };
    expect(splitBlockForLunch(block, 600, 660)).toEqual([block]);
  });

  it('no toca el bloque si la colación termina justo en el borde de fin', () => {
    const block = { start_min: 600, end_min: 1200 };
    expect(splitBlockForLunch(block, 1140, 1200)).toEqual([block]);
  });

  it('no toca el bloque si la colación queda completamente fuera de su rango', () => {
    const block = { start_min: 600, end_min: 780 }; // 10:00-13:00
    expect(splitBlockForLunch(block, 840, 900)).toEqual([block]); // 14:00-15:00
  });

  it('no toca el bloque si la colación solo se solapa parcialmente en un extremo', () => {
    const block = { start_min: 600, end_min: 870 }; // 10:00-14:30
    expect(splitBlockForLunch(block, 840, 900)).toEqual([block]); // 14:00-15:00 se sale por el final
  });
});

describe('applyLunchBreakToDayBlocks', () => {
  it('un día cerrado (sin bloques) no genera ningún bloque', () => {
    expect(applyLunchBreakToDayBlocks([], 840, 900)).toEqual([]);
  });

  it('en un turno partido solo divide el bloque que realmente contiene la colación', () => {
    const dayBlocks = [
      { id: 'a', start_min: 540, end_min: 780 }, // 09:00-13:00, no contiene la colación
      { id: 'b', start_min: 900, end_min: 1140 }, // 15:00-19:00, no contiene la colación
    ];
    expect(applyLunchBreakToDayBlocks(dayBlocks, 840, 900)).toEqual(dayBlocks); // 14:00-15:00
  });

  it('divide únicamente el bloque afectado dejando el resto del día igual', () => {
    const dayBlocks = [
      { id: 'a', start_min: 600, end_min: 1200 }, // 10:00-20:00
      { id: 'b', start_min: 1230, end_min: 1320 }, // 20:30-22:00, turno extra manual
    ];
    expect(applyLunchBreakToDayBlocks(dayBlocks, 840, 900)).toEqual([
      { id: 'a', start_min: 600, end_min: 840 },
      { id: 'a', start_min: 900, end_min: 1200 },
      { id: 'b', start_min: 1230, end_min: 1320 },
    ]);
  });
});
