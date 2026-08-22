import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export function usePanelAvailability(professionalId) {
  const [state, setState] = useState({ loading: true, error: null, blocks: [], exceptions: [] });

  const load = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    Promise.all([
      supabase.from('availability_blocks').select('*').eq('professional_id', professionalId).order('weekday').order('start_min'),
      supabase.from('availability_exceptions').select('*').eq('professional_id', professionalId).order('date'),
    ]).then(([blocksRes, excRes]) => {
      if (cancelled) return;
      const error = blocksRes.error?.message || excRes.error?.message || null;
      setState({ loading: false, error, blocks: blocksRes.data || [], exceptions: excRes.data || [] });
    });
    return () => {
      cancelled = true;
    };
  }, [professionalId]);

  useEffect(() => load(), [load]);

  return { ...state, reload: load };
}

// Disponibilidad de varios profesionales a la vez (usado por la Agenda para pintar días/bloques
// no laborales tanto en la vista "solo yo" como en la de equipo). Devuelve mapas
// professional_id -> filas, listos para pasarle a src/lib/schedule.js.
export function usePanelTeamAvailability(professionalIds) {
  const idsKey = professionalIds.join(',');
  const [state, setState] = useState({ loading: true, error: null, blocksByPro: new Map(), exceptionsByPro: new Map() });

  useEffect(() => {
    let cancelled = false;
    if (!professionalIds.length) {
      setState({ loading: false, error: null, blocksByPro: new Map(), exceptionsByPro: new Map() });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    Promise.all([
      supabase.from('availability_blocks').select('*').in('professional_id', professionalIds),
      supabase.from('availability_exceptions').select('*').in('professional_id', professionalIds),
    ]).then(([blocksRes, excRes]) => {
      if (cancelled) return;
      const error = blocksRes.error?.message || excRes.error?.message || null;
      const blocksByPro = new Map();
      for (const b of blocksRes.data || []) {
        if (!blocksByPro.has(b.professional_id)) blocksByPro.set(b.professional_id, []);
        blocksByPro.get(b.professional_id).push(b);
      }
      const exceptionsByPro = new Map();
      for (const e of excRes.data || []) {
        if (!exceptionsByPro.has(e.professional_id)) exceptionsByPro.set(e.professional_id, []);
        exceptionsByPro.get(e.professional_id).push(e);
      }
      setState({ loading: false, error, blocksByPro, exceptionsByPro });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey ya representa professionalIds
  }, [idsKey]);

  return state;
}
