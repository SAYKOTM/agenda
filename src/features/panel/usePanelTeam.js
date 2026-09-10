import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { readCache, writeCache } from '../../lib/offlineStore';
import { withTimeout } from '../../lib/withTimeout';

// Lista del equipo del salón (lectura pública de `professionals`, ver 0003_grants.sql) para el
// selector de columnas de la agenda y el toggle "Solo yo / Todo el equipo".
//
// Se guarda copia local porque la vista de día de la agenda dibuja UNA COLUMNA POR PROFESIONAL:
// sin equipo no hay columnas y la agenda se ve vacía aunque las citas estén cacheadas. El equipo
// de un salón cambia una vez cada varios meses, así que servir la copia guardada sin red no tiene
// prácticamente riesgo de mostrar algo desactualizado.
const QUERY_TIMEOUT_MS = 6000;

export function usePanelTeam(tenantId) {
  const [team, setTeam] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `team:${tenantId}`;

    withTimeout(
      supabase.from('professionals').select('id, name, role_title, initials').eq('tenant_id', tenantId).eq('active', true),
      QUERY_TIMEOUT_MS
    ).then(({ data, error, timedOut }) => {
      if (cancelled) return;
      if (timedOut || error || !data) {
        readCache(cacheKey).then((cached) => {
          if (!cancelled && cached) setTeam(cached);
        });
        return;
      }
      setTeam(data);
      writeCache(cacheKey, data);
    });

    // Copia local mientras tanto, para no dejar la agenda sin columnas durante la espera.
    readCache(cacheKey).then((cached) => {
      if (!cancelled && cached) setTeam((current) => (current.length ? current : cached));
    });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return team;
}
