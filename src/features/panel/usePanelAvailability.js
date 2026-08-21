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
