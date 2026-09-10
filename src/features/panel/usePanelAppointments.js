import { useCallback, useEffect, useRef, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { supabase } from '../../lib/supabaseClient';
import { readCache, writeCache } from '../../lib/offlineStore';
import { withTimeout } from '../../lib/withTimeout';

const SELECT = 'id, professional_id, customer_id, client_name, client_phone, client_email, notes, internal_note, status, start_at, end_at, buffer_before_min, buffer_after_min, total_price_clp, loyalty_discount_clp, loyalty_tier_applied, payment_method, public_token, created_at, professionals(name), booking_items(id, service_id, name_snapshot, price_snapshot, duration_snapshot, services(color)), customers(visits_count)';

// Plazo de la consulta: sin red PostgREST no rechaza, se queda colgado (ver src/lib/withTimeout.js).
const QUERY_TIMEOUT_MS = 6000;

// Reservas de un rango [from, to) de fechas locales del tenant. scopeAll trae todo el equipo;
// si no, solo las del profesional dado. Se usa tanto para la agenda (día/semana/mes) como para
// resolver la cita abierta en el drawer.
export function usePanelAppointments({ tenantId, timeZone, professionalId, scopeAll, from, to }) {
  const [state, setState] = useState({ loading: true, error: null, bookings: [], stale: false });

  const load = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const fromInstant = Temporal.PlainDate.from(from).toZonedDateTime({ timeZone }).toInstant().toString();
    const toInstant = Temporal.PlainDate.from(to).toZonedDateTime({ timeZone }).toInstant().toString();

    // Clave por tenant + alcance + rango: la agenda de la semana del equipo y la de hoy de un
    // profesional son consultas distintas y cada una guarda su propia copia.
    const cacheKey = `bookings:${tenantId}:${scopeAll ? 'all' : professionalId}:${from}:${to}`;

    // Copia local primero, para que la app instalada abra mostrando la agenda guardada en vez de
    // un esqueleto mientras espera (o mientras nunca llega) la respuesta del servidor. Se marca
    // loading:false a propósito -- si se dejara en true, sin red la vista se quedaría con el
    // "Cargando agenda…" puesto encima de datos que ya tiene.
    readCache(cacheKey).then((cached) => {
      if (cancelled || !cached) return;
      setState((s) => (s.loading ? { loading: false, error: null, bookings: cached, stale: true } : s));
    });

    let query = supabase.from('bookings').select(SELECT).eq('tenant_id', tenantId).gte('start_at', fromInstant).lt('start_at', toInstant).order('start_at', { ascending: true });
    if (!scopeAll) query = query.eq('professional_id', professionalId);

    withTimeout(query, QUERY_TIMEOUT_MS).then(({ data, error, timedOut }) => {
      if (cancelled) return;
      if (timedOut || error) {
        // Sin red, la última copia buena es mejor que un mensaje de error: se muestra marcada
        // como 'stale' para que la vista pueda avisar que está viendo datos guardados.
        readCache(cacheKey).then((cached) => {
          if (cancelled) return;
          if (cached) setState({ loading: false, error: null, bookings: cached, stale: true });
          else setState({ loading: false, error: error?.message || 'sin conexión', bookings: [], stale: false });
        });
        return;
      }
      setState({ loading: false, error: null, bookings: data || [], stale: false });
      writeCache(cacheKey, data || []);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, timeZone, professionalId, scopeAll, from, to]);

  useEffect(() => load(), [load]);

  // Tiempo real: cuando un cliente reserva desde la web pública (o cualquier profesional del
  // equipo confirma/reagenda/cancela una cita), la Agenda se refresca sola sin que el
  // profesional tenga que recargar la página. Se suscribe una sola vez por tenant -- vía ref
  // siempre dispara el `load` más reciente, así respeta el rango de fechas y el alcance
  // (día/semana/mes, solo yo/equipo) vigentes en cada momento sin tener que resuscribirse.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`panel-bookings-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `tenant_id=eq.${tenantId}` }, () => {
        loadRef.current();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  // Al volver la conexión, Realtime puede haberse perdido eventos mientras el socket estaba
  // caído: se recarga de una para que la agenda deje de estar 'stale'.
  useEffect(() => {
    const onOnline = () => loadRef.current();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  return { ...state, reload: load };
}
