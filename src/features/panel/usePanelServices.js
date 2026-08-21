import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// A diferencia de useTenantData (flujo público, solo servicios activos), el panel necesita ver
// y administrar también los inactivos.
export function usePanelServices(tenantId) {
  const [state, setState] = useState({ loading: true, error: null, categories: [], services: [] });

  const load = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    Promise.all([
      supabase.from('categories').select('id, name, sort_order').eq('tenant_id', tenantId).order('sort_order'),
      supabase.from('services').select('*').eq('tenant_id', tenantId).order('sort_order'),
    ]).then(([catsRes, svcRes]) => {
      if (cancelled) return;
      const error = catsRes.error?.message || svcRes.error?.message || null;
      setState({ loading: false, error, categories: catsRes.data || [], services: svcRes.data || [] });
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => load(), [load]);

  return { ...state, reload: load };
}
