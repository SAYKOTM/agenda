import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// "Mis servicios" del profesional logueado: cada quien ve y administra únicamente su propio
// catálogo (servicios.professional_id), a diferencia de useTenantData (flujo público, un tenant
// entero pero solo servicios activos). Las categorías siguen siendo del tenant completo -- son
// la taxonomía compartida de la que cada profesional elige al crear un servicio propio.
export function usePanelServices(tenantId, professionalId) {
  const [state, setState] = useState({ loading: true, error: null, categories: [], services: [] });

  const load = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    Promise.all([
      supabase.from('categories').select('id, name, sort_order').eq('tenant_id', tenantId).order('sort_order'),
      supabase.from('services').select('*').eq('tenant_id', tenantId).eq('professional_id', professionalId).order('sort_order'),
    ]).then(([catsRes, svcRes]) => {
      if (cancelled) return;
      const error = catsRes.error?.message || svcRes.error?.message || null;
      setState({ loading: false, error, categories: catsRes.data || [], services: svcRes.data || [] });
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, professionalId]);

  useEffect(() => load(), [load]);

  return { ...state, reload: load };
}
