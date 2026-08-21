import { useEffect, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { supabase } from '../../lib/supabaseClient';

// Ranking de profesionales de la semana actual (panel_team_ranking, migración 0009):
// agregado en la base, no en el cliente.
export function usePanelTeamRanking(timeZone) {
  const [state, setState] = useState({ loading: true, error: null, ranking: [] });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const today = Temporal.Now.plainDateISO(timeZone);
    const weekStart = today.subtract({ days: today.dayOfWeek - 1 });
    const weekEnd = weekStart.add({ days: 7 });
    const from = weekStart.toZonedDateTime({ timeZone }).toInstant().toString();
    const to = weekEnd.toZonedDateTime({ timeZone }).toInstant().toString();

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
  }, [timeZone]);

  return state;
}
