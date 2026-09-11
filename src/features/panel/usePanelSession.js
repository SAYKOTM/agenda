import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { clearCache, readCache, writeCache } from '../../lib/offlineStore';
import { withTimeout } from '../../lib/withTimeout';

const initialState = { loading: true, session: null, professional: null, tenant: null, error: null, needsOnboarding: false, offline: false };

// Última sesión resuelta con éxito, guardada para poder abrir el panel sin red. Se guardan el
// profesional y su tenant, NO los tokens: esos ya viven donde tienen que vivir (el storage de
// supabase-js) y duplicarlos solo agrandaría la superficie si alguien se lleva el teléfono.
const SESSION_CACHE_KEY = 'panel-session';
// Cuánto se espera a que conteste la red antes de abrir con la copia local. Sin este plazo el
// panel instalado se queda en "Cargando…" para siempre cuando no hay señal: ni getSession() ni la
// consulta de professionals fallan rápido -- verificado en Chrome con la red cortada, se quedan
// colgadas sin rechazar la promesa.
const OFFLINE_RESCUE_MS = 3000;
const PROFESSIONAL_SELECT =
  'id, tenant_id, name, role_title, initials, avatar_url, bio, instagram, whatsapp, gallery_urls, public_slug, role, active, email, rating_avg, rating_count, tenants(*)';

// Sesión del panel: además del JWT de Supabase Auth, resuelve el registro de `professionals`
// (y su tenant) que ese usuario representa. Todo el panel opera dentro de ese único tenant.
export function usePanelSession() {
  const [state, setState] = useState(initialState);
  // Espejo de state.loading para que el temporizador de rescate pueda consultarlo sin volver a
  // montarse en cada render.
  const loadingRef = useRef(true);
  useEffect(() => {
    loadingRef.current = state.loading;
  }, [state.loading]);

  // Abre el panel con la última sesión conocida. Es deliberado que no verifique nada contra el
  // servidor: sin red no hay nada que verificar, los datos que se muestran salen de la caché de
  // este mismo dispositivo, y en cuanto vuelve la señal el camino normal la reemplaza. Cualquier
  // escritura falla igual del lado de Supabase, así que no abre ninguna puerta.
  const hydrateFromCache = useCallback(async (session) => {
    const cached = await readCache(SESSION_CACHE_KEY);
    if (!cached?.professional || !cached?.tenant) return false;
    setState({
      loading: false,
      session: session || { user: { email: cached.email } },
      professional: cached.professional,
      tenant: cached.tenant,
      error: null,
      needsOnboarding: false,
      offline: true,
    });
    return true;
  }, []);

  const loadProfessional = useCallback(async (session) => {
    if (!session) {
      setState({ loading: false, session: null, professional: null, tenant: null, error: null, needsOnboarding: false, offline: false });
      return;
    }
    let { data, error, timedOut } = await withTimeout(
      supabase.from('professionals').select(PROFESSIONAL_SELECT).eq('auth_user_id', session.user.id).maybeSingle(),
      OFFLINE_RESCUE_MS
    );
    if (timedOut || error) {
      // Un fallo de red no es "esta cuenta no tiene acceso": si hay copia local, se abre con ella.
      if (await hydrateFromCache(session)) return;
      setState({ loading: false, session, professional: null, tenant: null, error: error?.message || 'sin conexión', needsOnboarding: false, offline: false });
      return;
    }
    // Sin fila por auth_user_id: puede ser una invitación pendiente con el mismo email (Google
    // como primer login) que todavía no quedó enlazada -- se intenta una vez antes de rendirse.
    if (!data) {
      const { data: claimed } = await supabase.rpc('claim_invited_professional');
      if (claimed) {
        ({ data, error } = await supabase.from('professionals').select(PROFESSIONAL_SELECT).eq('auth_user_id', session.user.id).maybeSingle());
        if (error) {
          if (await hydrateFromCache(session)) return;
          setState({ loading: false, session, professional: null, tenant: null, error: error.message, needsOnboarding: false, offline: false });
          return;
        }
      }
    }
    if (!data) {
      // Ni invitación pendiente ni panel propio: cuenta autenticada nueva (típicamente Google
      // sin registro previo) que todavía necesita crear su salón (ver PanelOnboarding).
      setState({ loading: false, session, professional: null, tenant: null, error: null, needsOnboarding: true, offline: false });
      return;
    }
    if (!data.active) {
      setState({ loading: false, session, professional: null, tenant: null, error: 'sin_acceso', needsOnboarding: false, offline: false });
      return;
    }
    const { tenants, ...professional } = data;
    setState({ loading: false, session, professional, tenant: tenants, error: null, needsOnboarding: false, offline: false });
    writeCache(SESSION_CACHE_KEY, { professional, tenant: tenants, email: session.user.email });
  }, [hydrateFromCache]);

  useEffect(() => {
    let cancelled = false;

    // Rescate sin red (ver OFFLINE_RESCUE_MS): si a los 3 segundos el panel sigue en "Cargando…",
    // se abre con la copia local. Se mira el estado y no si la red contestó, porque el punto donde
    // se cuelga puede ser cualquiera de los dos (getSession o la consulta de professionals). Si
    // después la red contesta, loadProfessional pisa este estado con los datos frescos.
    const rescue = setTimeout(() => {
      if (!cancelled && loadingRef.current) hydrateFromCache(null);
    }, OFFLINE_RESCUE_MS);

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) loadProfessional(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) loadProfessional(session);
    });
    return () => {
      cancelled = true;
      clearTimeout(rescue);
      sub.subscription.unsubscribe();
    };
  }, [loadProfessional, hydrateFromCache]);

  const refresh = useCallback(() => {
    if (state.session) loadProfessional(state.session);
  }, [state.session, loadProfessional]);

  // Al cerrar sesión se vacía la caché offline: son reservas y datos de clientes del salón, no
  // corresponde que queden en el teléfono de alguien que ya salió del panel.
  const signOut = useCallback(async () => {
    await clearCache();
    return supabase.auth.signOut();
  }, []);

  return { ...state, refresh, signOut };
}
