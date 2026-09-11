import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// Lista de espera del salón: quién quedó esperando que se libere una hora, en orden de llegada.
// El alcance es el tenant completo, igual que la ficha de clientes: la gente se anota para un día,
// no para una persona, y quien tenga el hueco libre es quien le escribe.
export function usePanelWaitlist(tenantId) {
  const [state, setState] = useState({ loading: true, error: null, entries: [], serviceNames: {} });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const [entriesRes, servicesRes] = await Promise.all([
      supabase
        .from('waitlist_entries')
        .select('id, professional_id, client_name, client_phone, desired_date, service_ids, note, status, notified_at, created_at, professionals(name)')
        .eq('tenant_id', tenantId)
        .order('desired_date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('services').select('id, name').eq('tenant_id', tenantId),
    ]);
    if (entriesRes.error) {
      setState({ loading: false, error: entriesRes.error.message, entries: [], serviceNames: {} });
      return;
    }
    setState({
      loading: false,
      error: null,
      entries: entriesRes.data || [],
      serviceNames: Object.fromEntries((servicesRes.data || []).map((s) => [s.id, s.name])),
    });
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
