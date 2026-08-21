import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// Ficha de cliente compartida por todo el equipo del tenant (mismo alcance que
// servicios/profesionales: catálogo del salón, no "mis clientes"). Ver migración
// 0014_customers_and_loyalty.sql.
export function usePanelClients(tenantId) {
  const [state, setState] = useState({ loading: true, error: null, customers: [] });

  const load = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('last_visit_at', { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setState({ loading: false, error: error.message, customers: [] });
        else setState({ loading: false, error: null, customers: data || [] });
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => load(), [load]);

  return { ...state, reload: load };
}

// Historial de reservas de un cliente puntual, para la ficha de detalle.
export function usePanelClientHistory(customerId) {
  const [state, setState] = useState({ loading: true, error: null, bookings: [] });

  useEffect(() => {
    if (!customerId) {
      setState({ loading: false, error: null, bookings: [] });
      return;
    }
    let cancelled = false;
    setState({ loading: true, error: null, bookings: [] });
    supabase
      .from('bookings')
      .select('id, status, start_at, total_price_clp, payment_method, professionals(name), booking_items(name_snapshot)')
      .eq('customer_id', customerId)
      .order('start_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setState({ loading: false, error: error.message, bookings: [] });
        else setState({ loading: false, error: null, bookings: data || [] });
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return state;
}
