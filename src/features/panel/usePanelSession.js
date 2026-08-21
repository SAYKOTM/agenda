import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

const initialState = { loading: true, session: null, professional: null, tenant: null, error: null };

// Sesión del panel: además del JWT de Supabase Auth, resuelve el registro de `professionals`
// (y su tenant) que ese usuario representa. Todo el panel opera dentro de ese único tenant.
export function usePanelSession() {
  const [state, setState] = useState(initialState);

  const loadProfessional = useCallback(async (session) => {
    if (!session) {
      setState({ loading: false, session: null, professional: null, tenant: null, error: null });
      return;
    }
    const { data, error } = await supabase
      .from('professionals')
      .select('id, tenant_id, name, role_title, initials, avatar_url, bio, instagram, whatsapp, role, active, email, tenants(*)')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (error) {
      setState({ loading: false, session, professional: null, tenant: null, error: error.message });
      return;
    }
    if (!data || !data.active) {
      setState({ loading: false, session, professional: null, tenant: null, error: 'sin_acceso' });
      return;
    }
    const { tenants, ...professional } = data;
    setState({ loading: false, session, professional, tenant: tenants, error: null });
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) loadProfessional(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) loadProfessional(session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfessional]);

  const refresh = useCallback(() => {
    if (state.session) loadProfessional(state.session);
  }, [state.session, loadProfessional]);

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  return { ...state, refresh, signOut };
}
