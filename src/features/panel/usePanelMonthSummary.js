import { useEffect, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { supabase } from '../../lib/supabaseClient';

// Cierre de mes para el panel analítico: ingresos por día, top servicios por ingresos,
// desglose por método de pago, clientes atendidos y conversión (vistas del link vs. reservas
// creadas). Todo se agrega en la base (panel_month_summary, migración 0016), igual que
// usePanelMetrics resuelve los límites del período en la timezone del tenant.
export function usePanelMonthSummary({ timeZone, professionalId, scopeAll }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });

    async function load() {
      const today = Temporal.Now.plainDateISO(timeZone);
      const monthStart = today.with({ day: 1 });
      const monthEnd = monthStart.add({ months: 1 });
      const p_from = monthStart.toZonedDateTime({ timeZone }).toInstant().toString();
      const p_to = monthEnd.toZonedDateTime({ timeZone }).toInstant().toString();

      const { data, error } = await supabase.rpc('panel_month_summary', {
        p_professional_id: scopeAll ? null : professionalId,
        p_from,
        p_to,
        p_time_zone: timeZone,
      });
      if (cancelled) return;
      if (error) {
        setState({ loading: false, error: error.message, data: null });
        return;
      }

      const revenueByDay = [];
      for (let d = monthStart; Temporal.PlainDate.compare(d, monthEnd) < 0; d = d.add({ days: 1 })) {
        const row = (data.revenueByDay || []).find((r) => r.date === d.toString());
        revenueByDay.push({ label: String(d.day), value: row ? Number(row.revenue) : 0 });
      }

      setState({
        loading: false,
        error: null,
        data: {
          revenueByDay,
          topServices: (data.topServices || []).map((s) => ({ ...s, revenue: Number(s.revenue) })),
          paymentBreakdown: (data.paymentBreakdown || []).map((p) => ({ ...p, revenue: Number(p.revenue) })),
          customersServed: Number(data.customersServed || 0),
          bookingsCreated: Number(data.bookingsCreated || 0),
          views: Number(data.views || 0),
        },
      });
    }

    load().catch((e) => {
      if (!cancelled) setState({ loading: false, error: e.message, data: null });
    });
    return () => {
      cancelled = true;
    };
  }, [timeZone, professionalId, scopeAll]);

  return state;
}
