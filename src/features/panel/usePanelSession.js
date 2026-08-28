import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

const initialState = { loading: true, session: null, professional: null, tenant: null, error: null, needsOnboarding: false };
const PROFESSIONAL_SELECT =
  'id, tenant_id, name, role_title, initials, avatar_url, bio, instagram, whatsapp, role, active, email, rating_avg, rating_count, tenants(*)';

// Sesión del panel: además del JWT de Supabase Auth, resuelve el registro de `professionals`
// (y su tenant) que ese usuario representa. Todo el panel opera dentro de ese único tenant.
export function usePanelSession() {
  const [state, setState] = useState(initialState);

  const loadProfessional = useCallback(async (session) => {
    if (!session) {
      setState({ loading: false, session: null, professional: null, tenant: null, error: null, needsOnboarding: false });
      return;
    }
    let { data, error } = await supabase.from('professionals').select(PROFESSIONAL_SELECT).eq('auth_user_id', session.user.id).maybeSingle();
    if (error) {
      setState({ loading: false, session, professional: null, tenant: null, error: error.message, needsOnboarding: false });
      return;
    }
    // Sin fila por auth_user_id: puede ser una invitación pendiente con el mismo email (Google
    // como primer login) que todavía no quedó enlazada -- se intenta una vez antes de rendirse.
    if (!data) {
      const { data: claimed } = await supabase.rpc('claim_invited_professional');
      if (claimed) {
        ({ data, error } = await supabase.from('professionals').select(PROFESSIONAL_SELECT).eq('auth_user_id', session.user.id).maybeSingle());
        if (error) {
          setState({ loading: false, session, professional: null, tenant: null, error: error.message, needsOnboarding: false });
          return;
        }
      }
    }
    if (!data) {
      // Ni invitación pendiente ni panel propio: cuenta autenticada nueva (típicamente Google
      // sin registro previo) que todavía necesita crear su salón (ver PanelOnboarding).
      setState({ loading: false, session, professional: null, tenant: null, error: null, needsOnboarding: true });
      return;
    }
    if (!data.active) {
      setState({ loading: false, session, professional: null, tenant: null, error: 'sin_acceso', needsOnboarding: false });
      return;
    }
    const { tenants, ...professional } = data;
    setState({ loading: false, session, professional, tenant: tenants, error: null, needsOnboarding: false });
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
