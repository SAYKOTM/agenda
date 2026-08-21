import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// Lista del equipo del salón (lectura pública de `professionals`, ver 0003_grants.sql) para el
// selector de columnas de la agenda y el toggle "Solo yo / Todo el equipo".
export function usePanelTeam(tenantId) {
  const [team, setTeam] = useState([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('professionals')
      .select('id, name, role_title, initials')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .then(({ data }) => {
        if (!cancelled) setTeam(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return team;
}
