import { useCallback, useEffect, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { supabase } from '../../lib/supabaseClient';

// Equipo completo del tenant (activos e inactivos) con su propio catálogo de servicios (cada
// servicio pertenece a un único profesional, ver 0020_professional_owned_services.sql), más
// citas e ingresos de la semana por profesional (panel_team_ranking, migración 0009).
//
// RBAC: panel_team_ranking es admin-only a nivel de RLS/función (migración 0012) -- un
// 'professional' que la llamara igual recibiría un error de Postgres. `canSeeFinancials` evita
// ni siquiera intentar la llamada para ese caso (hoy inalcanzable desde la UI porque la ruta
// /panel/equipo ya está bloqueada por <RequireAdmin>, pero así el hook nunca depende de esa
// única capa) y deja el resto del roster (nombre, estado, permisos) disponible igual.
export function usePanelTeamManage(tenantId, timeZone, canSeeFinancials) {
  const [state, setState] = useState({ loading: true, error: null, team: [], ranking: [] });

  const load = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const today = Temporal.Now.plainDateISO(timeZone);
    const weekStart = today.subtract({ days: today.dayOfWeek - 1 });
    const weekEnd = weekStart.add({ days: 7 });
    const from = weekStart.toZonedDateTime({ timeZone }).toInstant().toString();
    const to = weekEnd.toZonedDateTime({ timeZone }).toInstant().toString();

    Promise.all([
      supabase.from('professionals').select('*, services(id)').eq('tenant_id', tenantId).order('created_at'),
      canSeeFinancials ? supabase.rpc('panel_team_ranking', { p_from: from, p_to: to }) : Promise.resolve({ data: [], error: null }),
    ]).then(([teamRes, rankRes]) => {
      if (cancelled) return;
      const error = teamRes.error?.message || rankRes.error?.message || null;
      setState({ loading: false, error, team: teamRes.data || [], ranking: rankRes.data || [] });
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, timeZone, canSeeFinancials]);

  useEffect(() => load(), [load]);

  return { ...state, reload: load };
}
