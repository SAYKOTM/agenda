import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export function usePanelPrivacyRequests(tenantId) {
  const [state, setState] = useState({ loading: true, error: null, requests: [] });

  const load = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    supabase
      .from('privacy_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setState({ loading: false, error: error.message, requests: [] });
        else setState({ loading: false, error: null, requests: data || [] });
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => load(), [load]);

  async function updateStatus(id, status) {
    const { error } = await supabase
      .from('privacy_requests')
      .update({ status, resolved_at: status === 'resuelta' ? new Date().toISOString() : null })
      .eq('id', id);
    if (!error) load();
    return error;
  }

  return { ...state, reload: load, updateStatus };
}
