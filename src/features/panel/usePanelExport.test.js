// El escape de CSV falla en silencio: un archivo mal citado se abre igual, con las columnas
// corridas, y nadie lo nota hasta que alguien importa esos clientes en otro sistema. Estos casos
// son justamente los que aparecen en datos reales de un salón.
import { describe, expect, it } from 'vitest';
import { buildCsv, csvValue } from './usePanelExport';

describe('csvValue', () => {
  it('deja pasar el texto simple sin comillas', () => {
    expect(csvValue('Camila Aguirre')).toBe('Camila Aguirre');
    expect(csvValue(18000)).toBe('18000');
  });

  it('entrecomilla cuando aparece el separador', () => {
    // "Corte; barba" en el nombre de un servicio partiría la fila en dos columnas.
    expect(csvValue('Corte; barba')).toBe('"Corte; barba"');
  });

  it('duplica las comillas dobles', () => {
    expect(csvValue('Corte "degradado"')).toBe('"Corte ""degradado"""');
  });

  it('entrecomilla las notas con salto de línea', () => {
    expect(csvValue('Alergia al tinte\nprefiere shampoo neutro')).toBe('"Alergia al tinte\nprefiere shampoo neutro"');
  });

  it('convierte null y undefined en celda vacía', () => {
    expect(csvValue(null)).toBe('');
    expect(csvValue(undefined)).toBe('');
  });
});

describe('buildCsv', () => {
  const columns = [
    { label: 'Cliente', value: (r) => r.name },
    { label: 'Servicios', value: (r) => r.items.join(' + ') },
    { label: 'Total', value: (r) => r.total },
  ];

  it('arma encabezado y filas separadas por ;', () => {
    const csv = buildCsv(columns, [{ name: 'Camila', items: ['Corte'], total: 12000 }]);
    const [head, row] = csv.split('\r\n');
    expect(head).toBe('﻿Cliente;Servicios;Total');
    expect(row).toBe('Camila;Corte;12000');
  });

  it('empieza con BOM para que Excel en español muestre bien las tildes', () => {
    const csv = buildCsv(columns, []);
    expect(csv.startsWith('﻿')).toBe(true);
  });

  it('mantiene una fila por reserva aunque el texto traiga separadores', () => {
    const csv = buildCsv(columns, [
      { name: 'Ignacio; Pardo', items: ['Corte "clásico"', 'Barba'], total: 21000 },
      { name: 'Rocío', items: ['Color'], total: 45000 },
    ]);
    expect(csv.split('\r\n')).toHaveLength(3); // encabezado + 2 reservas
  });
});
