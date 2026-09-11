import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// Exportación de los datos del salón a CSV.
//
// Sirve para dos cosas a la vez: que el negocio pueda llevarse sus clientes y su historial si se
// va (un SaaS que retiene los datos como rehén se nota y se cuenta), y responder una solicitud de
// portabilidad de la Ley 21.719 sin tener que abrir Supabase Studio a mano.
//
// Se arma en el navegador y no en una Edge Function a propósito: las políticas RLS ya filtran por
// tenant y por rol, así que la consulta devuelve exactamente lo que esa persona puede ver. Una
// función con service_role tendría que reimplementar ese filtro, que es justo donde se cometen los
// errores de aislamiento.

// PostgREST corta en 1000 filas por respuesta (max_rows en supabase/config.toml). Un salón con dos
// años de historia pasa ese número sin despeinarse, así que hay que paginar o el archivo saldría
// silenciosamente incompleto -- el peor resultado posible en una exportación.
const PAGE_SIZE = 1000;

async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export function csvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Comillas dobles duplicadas es el escape del formato; se entrecomilla siempre que aparezca el
  // separador, comillas o un salto de línea (las notas del profesional traen saltos de línea).
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(columns, rows) {
  const head = columns.map((c) => csvValue(c.label)).join(';');
  const body = rows.map((row) => columns.map((c) => csvValue(c.value(row))).join(';'));
  // Separador ';' y BOM al inicio: es lo que hace que Excel en español abra el archivo en columnas
  // y muestre bien las tildes y la ñ. Con ',' y sin BOM se ve todo en una sola columna y con
  // caracteres rotos, que es como la mayoría de la gente descubre que una exportación "no sirve".
  return '﻿' + [head, ...body].join('\r\n');
}

function download(filename, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

// 'sv-SE' da "2026-09-10 15:30": ordenable como texto y sin la ambigüedad de si el mes va primero.
function localDateTime(iso, timeZone) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function usePanelExport({ tenant }) {
  const [exporting, setExporting] = useState(null); // clave del archivo en curso, o null
  const [error, setError] = useState(null);

  const run = useCallback(async (key, task) => {
    setError(null);
    setExporting(key);
    try {
      const count = await task();
      return count;
    } catch (e) {
      console.error('[EXPORT]', e);
      setError('No pudimos generar el archivo. Intentá de nuevo en un momento.');
      return null;
    } finally {
      setExporting(null);
    }
  }, []);

  const exportCustomers = useCallback(
    () =>
      run('clientes', async () => {
        const rows = await fetchAll(() =>
          supabase
            .from('customers')
            .select('name, phone, email, visits_count, total_spent_clp, last_visit_at, tier, created_at')
            .eq('tenant_id', tenant.id)
            .order('name')
        );
        download(
          `clientes-${tenant.slug}-${dateStamp()}.csv`,
          buildCsv(
            [
              { label: 'Nombre', value: (r) => r.name },
              { label: 'Teléfono', value: (r) => r.phone },
              { label: 'Email', value: (r) => r.email },
              { label: 'Visitas', value: (r) => r.visits_count },
              { label: 'Total gastado', value: (r) => r.total_spent_clp },
              { label: 'Última visita', value: (r) => localDateTime(r.last_visit_at, tenant.timezone) },
              { label: 'Nivel', value: (r) => r.tier },
              { label: 'Cliente desde', value: (r) => localDateTime(r.created_at, tenant.timezone) },
            ],
            rows
          )
        );
        return rows.length;
      }),
    [run, tenant]
  );

  const exportBookings = useCallback(
    () =>
      run('reservas', async () => {
        const rows = await fetchAll(() =>
          supabase
            .from('bookings')
            .select(
              'start_at, end_at, status, client_name, client_phone, client_email, notes, total_price_clp, loyalty_discount_clp, payment_method, payment_status, source, created_at, professionals(name), booking_items(name_snapshot, price_snapshot)'
            )
            .eq('tenant_id', tenant.id)
            .order('start_at', { ascending: false })
        );
        download(
          `reservas-${tenant.slug}-${dateStamp()}.csv`,
          buildCsv(
            [
              { label: 'Fecha y hora', value: (r) => localDateTime(r.start_at, tenant.timezone) },
              { label: 'Termina', value: (r) => localDateTime(r.end_at, tenant.timezone) },
              { label: 'Profesional', value: (r) => r.professionals?.name || '' },
              { label: 'Servicios', value: (r) => (r.booking_items || []).map((i) => i.name_snapshot).join(' + ') },
              { label: 'Estado', value: (r) => r.status },
              { label: 'Cliente', value: (r) => r.client_name },
              { label: 'Teléfono', value: (r) => r.client_phone },
              { label: 'Email', value: (r) => r.client_email },
              { label: 'Total', value: (r) => r.total_price_clp },
              { label: 'Descuento fidelidad', value: (r) => r.loyalty_discount_clp },
              { label: 'Método de pago', value: (r) => r.payment_method },
              { label: 'Estado del pago', value: (r) => r.payment_status },
              { label: 'Origen', value: (r) => (r.source === 'public' ? 'web pública' : 'panel') },
              { label: 'Notas', value: (r) => r.notes },
              { label: 'Reservada el', value: (r) => localDateTime(r.created_at, tenant.timezone) },
            ],
            rows
          )
        );
        return rows.length;
      }),
    [run, tenant]
  );

  const exportServices = useCallback(
    () =>
      run('servicios', async () => {
        const rows = await fetchAll(() =>
          supabase
            .from('services')
            .select('name, price_clp, duration_min, buffer_before_min, buffer_after_min, active, professionals(name), categories(name)')
            .eq('tenant_id', tenant.id)
            .order('name')
        );
        download(
          `servicios-${tenant.slug}-${dateStamp()}.csv`,
          buildCsv(
            [
              { label: 'Servicio', value: (r) => r.name },
              { label: 'Categoría', value: (r) => r.categories?.name || '' },
              { label: 'Profesional', value: (r) => r.professionals?.name || 'Todo el equipo' },
              { label: 'Precio', value: (r) => r.price_clp },
              { label: 'Duración (min)', value: (r) => r.duration_min },
              { label: 'Holgura antes (min)', value: (r) => r.buffer_before_min },
              { label: 'Holgura después (min)', value: (r) => r.buffer_after_min },
              { label: 'Activo', value: (r) => (r.active ? 'sí' : 'no') },
            ],
            rows
          )
        );
        return rows.length;
      }),
    [run, tenant]
  );

  return { exporting, error, exportCustomers, exportBookings, exportServices };
}
