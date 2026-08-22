import { useCallback, useEffect, useRef, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { supabase } from '../../lib/supabaseClient';

const SELECT = 'id, professional_id, customer_id, client_name, client_phone, client_email, notes, internal_note, status, start_at, end_at, buffer_before_min, buffer_after_min, total_price_clp, loyalty_discount_clp, loyalty_tier_applied, payment_method, public_token, created_at, professionals(name), booking_items(id, service_id, name_snapshot, price_snapshot, duration_snapshot, services(color)), customers(visits_count)';

// Reservas de un rango [from, to) de fechas locales del tenant. scopeAll trae todo el equipo;
// si no, solo las del profesional dado. Se usa tanto para la agenda (día/semana/mes) como para
// resolver la cita abierta en el drawer.
export function usePanelAppointments({ tenantId, timeZone, professionalId, scopeAll, from, to }) {
  const [state, setState] = useState({ loading: true, error: null, bookings: [] });

  const load = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const fromInstant = Temporal.PlainDate.from(from).toZonedDateTime({ timeZone }).toInstant().toString();
    const toInstant = Temporal.PlainDate.from(to).toZonedDateTime({ timeZone }).toInstant().toString();

    let query = supabase.from('bookings').select(SELECT).eq('tenant_id', tenantId).gte('start_at', fromInstant).lt('start_at', toInstant).order('start_at', { ascending: true });
    if (!scopeAll) query = query.eq('professional_id', professionalId);

    query.then(({ data, error }) => {
      if (cancelled) return;
      if (error) setState({ loading: false, error: error.message, bookings: [] });
      else setState({ loading: false, error: null, bookings: data || [] });
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

  return { ...state, reload: load };
}
