import { useEffect, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { supabase } from '../../lib/supabaseClient';

// Ranking de profesionales del rango elegido (panel_team_ranking, migración 0009, con comisión
// agregada en 0018): agregado en la base, no en el cliente. `scope`: 'day' | 'week' | 'month'.
export function usePanelTeamRanking(timeZone, scope = 'week') {
  const [state, setState] = useState({ loading: true, error: null, ranking: [] });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const today = Temporal.Now.plainDateISO(timeZone);
    const weekStart = today.subtract({ days: today.dayOfWeek - 1 });
    const monthStart = today.with({ day: 1 });
    const [rangeStart, rangeEnd] =
      scope === 'day' ? [today, today.add({ days: 1 })]
      : scope === 'month' ? [monthStart, monthStart.add({ months: 1 })]
      : [weekStart, weekStart.add({ days: 7 })];
    const from = rangeStart.toZonedDateTime({ timeZone }).toInstant().toString();
    const to = rangeEnd.toZonedDateTime({ timeZone }).toInstant().toString();

    supabase
      .rpc('panel_team_ranking', { p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setState({ loading: false, error: error.message, ranking: [] });
        else setState({ loading: false, error: null, ranking: data || [] });
      });
    return () => {
      cancelled = true;
    };
  }, [timeZone, scope]);

  return state;
}
