import { useEffect, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { supabase } from '../../lib/supabaseClient';

function toInstant(timeZone, plainDate) {
  return plainDate.toZonedDateTime({ timeZone }).toInstant().toString();
}

// Todas las métricas del dashboard se calculan en la base (panel_period_metrics, migración
// 0008): este hook solo resuelve los límites de cada período en la timezone del tenant y arma
// las 6 llamadas (día/semana/mes, cada uno con su período anterior para el delta) más la
// ocupación. El % de delta y el ticket promedio son aritmética de presentación sobre números ya
// agregados, no una relectura de reservas.
export function usePanelMetrics({ timeZone, tenantId, professionalId, scopeAll }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });

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
        setState({ loading: false, error: firstError.message, data: null });
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
        setState({ loading: false, error: occErr.message, data: null });
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
        setState({ loading: false, error: nextErr.message, data: null });
        return;
      }

      setState({
        loading: false,
        error: null,
        data: {
          today, weekStart, monthStart,
          day: byKey.day, week: byKey.week, month: byKey.month,
          prevDay: byKey.prevDay, prevWeek: byKey.prevWeek, prevMonth: byKey.prevMonth,
          occupancyBookedMin: byKey.week.bookedMinutes,
          occupancyAvailableMin: occupancyWeek,
          nextUp: nextUp || [],
        },
      });
    }

    load().catch((e) => {
      if (!cancelled) setState({ loading: false, error: e.message, data: null });
    });
    return () => {
      cancelled = true;
    };
  }, [timeZone, tenantId, professionalId, scopeAll]);

  return state;
}
