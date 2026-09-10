import { useEffect, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { supabase } from '../../lib/supabaseClient';
import { readCache, writeCache } from '../../lib/offlineStore';

function toInstant(timeZone, plainDate) {
  return plainDate.toZonedDateTime({ timeZone }).toInstant().toString();
}

// Todas las métricas del dashboard se calculan en la base (panel_period_metrics, migración
// 0008): este hook solo resuelve los límites de cada período en la timezone del tenant y arma
// las 6 llamadas (día/semana/mes, cada uno con su período anterior para el delta) más la
// ocupación. El % de delta y el ticket promedio son aritmética de presentación sobre números ya
// agregados, no una relectura de reservas.
// Plazo antes de rendirse y mostrar la copia local: sin red las RPC no rechazan, se cuelgan
// (ver src/lib/withTimeout.js). Importa especialmente acá porque "Hoy" es el start_url de la app
// instalada: es la pantalla con la que arranca el profesional al abrir el ícono.
const QUERY_TIMEOUT_MS = 6000;

// Temporal.PlainDate no sobrevive a IndexedDB (no es clonable), así que en la copia local las
// tres fechas viajan como texto ISO y se rearman al leer.
function serialize(data) {
  return { ...data, today: data.today.toString(), weekStart: data.weekStart.toString(), monthStart: data.monthStart.toString() };
}
function deserialize(cached) {
  return {
    ...cached,
    today: Temporal.PlainDate.from(cached.today),
    weekStart: Temporal.PlainDate.from(cached.weekStart),
    monthStart: Temporal.PlainDate.from(cached.monthStart),
  };
}

export function usePanelMetrics({ timeZone, tenantId, professionalId, scopeAll }) {
  const [state, setState] = useState({ loading: true, error: null, data: null, stale: false });

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    setState({ loading: true, error: null, data: null, stale: false });

    const cacheKey = `metrics:${tenantId}:${scopeAll ? 'all' : professionalId}`;
    const todayStr = Temporal.Now.plainDateISO(timeZone).toString();

    // Sin red: se muestran las métricas guardadas, pero SOLO si son de hoy. Enseñar los ingresos
    // de ayer bajo el título "Hoy" sería peor que decir que no hay conexión.
    async function fallback(reason) {
      const cached = await readCache(cacheKey);
      if (cancelled) return;
      if (cached?.today === todayStr) setState({ loading: false, error: null, data: deserialize(cached), stale: true });
      else setState({ loading: false, error: reason, data: null, stale: false });
    }

    const rescue = setTimeout(() => {
      if (!cancelled && !settled) fallback('Sin conexión: no pudimos actualizar tus métricas.');
    }, QUERY_TIMEOUT_MS);

    async function load() {
      const today = Temporal.Now.plainDateISO(timeZone);
      const weekStart = today.subtract({ days: today.dayOfWeek - 1 });
      const weekEnd = weekStart.add({ days: 7 });
      const monthStart = today.with({ day: 1 });
      const monthEnd = monthStart.add({ months: 1 });
      const prevWeekStart = weekStart.subtract({ days: 7 });
      const prevMonthStart = monthStart.subtract({ months: 1 });
      const proId = scopeAll ? null : professionalId;

      const ranges = {
        day: [today, today.add({ days: 1 })],
        week: [weekStart, weekEnd],
        month: [monthStart, monthEnd],
        prevDay: [today.subtract({ days: 1 }), today],
        prevWeek: [prevWeekStart, weekStart],
        prevMonth: [prevMonthStart, monthStart],
      };

      const entries = Object.entries(ranges);
      const results = await Promise.all(
        entries.map(([, [from, to]]) =>
          supabase.rpc('panel_period_metrics', {
            p_professional_id: proId,
            p_from: toInstant(timeZone, from),
            p_to: toInstant(timeZone, to),
          })
        )
      );
      const firstError = results.find((r) => r.error)?.error;
      if (cancelled) return;
      if (firstError) {
        await fallback(firstError.message);
        return;
      }
      const byKey = Object.fromEntries(entries.map(([key], i) => [key, results[i].data]));

      const { data: occupancyWeek, error: occErr } = await supabase.rpc('professional_available_minutes', {
        p_professional_id: proId,
        p_from: weekStart.toString(),
        p_to: weekEnd.subtract({ days: 1 }).toString(),
      });
      if (cancelled) return;
      if (occErr) {
        await fallback(occErr.message);
        return;
      }

      let nextUpQuery = supabase
        .from('bookings')
        .select('id, start_at, status, total_price_clp, client_name, booking_items(name_snapshot, services(color)), customers(visits_count)')
        .eq('tenant_id', tenantId);
      if (!scopeAll) nextUpQuery = nextUpQuery.eq('professional_id', professionalId);
      const { data: nextUp, error: nextErr } = await nextUpQuery
        .gte('start_at', toInstant(timeZone, today))
        .lt('start_at', toInstant(timeZone, today.add({ days: 1 })))
        .order('start_at', { ascending: true })
        .limit(5);
      if (cancelled) return;
      if (nextErr) {
        await fallback(nextErr.message);
        return;
      }

      const data = {
        today, weekStart, monthStart,
        day: byKey.day, week: byKey.week, month: byKey.month,
        prevDay: byKey.prevDay, prevWeek: byKey.prevWeek, prevMonth: byKey.prevMonth,
        occupancyBookedMin: byKey.week.bookedMinutes,
        occupancyAvailableMin: occupancyWeek,
        nextUp: nextUp || [],
      };
      settled = true;
      clearTimeout(rescue);
      setState({ loading: false, error: null, data, stale: false });
      writeCache(cacheKey, serialize(data));
    }

    load().catch((e) => {
      if (!cancelled) fallback(e.message);
    });
    return () => {
      cancelled = true;
      clearTimeout(rescue);
    };
  }, [timeZone, tenantId, professionalId, scopeAll]);

  return state;
}
