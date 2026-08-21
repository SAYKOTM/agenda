import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePanelTeam } from '../../features/panel/usePanelTeam';
import { useToast } from '../../components/Toast';

const STATUS_META = {
  disponible: { label: 'Disponible', bg: '#E7F4EC', ink: '#1E6B43' },
  mantenimiento: { label: 'En mantenimiento', bg: '#FEF2E0', ink: '#96540E' },
  inactiva: { label: 'Inactiva', bg: '#F2F4F7', ink: '#64748B' },
};

export default function PanelStations() {
  const { tenant } = useOutletContext();
  const toast = useToast();
  const team = usePanelTeam(tenant.id);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  function load() {
    setLoading(true);
    supabase
      .from('stations')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('sort_order')
      .then(({ data }) => {
        setStations(data || []);
        setLoading(false);
      });
  }
  useEffect(load, [tenant.id]);

  async function addStation() {
    if (!newName.trim()) return;
    const { error } = await supabase.from('stations').insert({ tenant_id: tenant.id, name: newName.trim(), sort_order: stations.length + 1 });
    if (error) toast('No pudimos crear la estación');
    else {
      setNewName('');
      toast('Estación creada');
      load();
    }
  }

  async function renameStation(s, name) {
    if (!name.trim() || name === s.name) return;
    const { error } = await supabase.from('stations').update({ name: name.trim() }).eq('id', s.id);
    if (error) toast('No pudimos renombrar la estación');
    else load();
  }

  async function setStatus(s, status) {
    const { error } = await supabase.from('stations').update({ status }).eq('id', s.id);
    if (error) toast('No pudimos actualizar el estado');
    else load();
  }

  async function assignProfessional(s, professionalId) {
    const { error } = await supabase.from('stations').update({ professional_id: professionalId || null }).eq('id', s.id);
    if (error) toast('No pudimos asignar el profesional');
    else load();
  }

  async function removeStation(s) {
    const { error } = await supabase.from('stations').delete().eq('id', s.id);
    if (error) toast('No pudimos eliminar la estación');
    else {
      toast('Estación eliminada');
      load();
    }
  }

  const activeCount = stations.filter((s) => s.status !== 'inactiva').length;

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Estaciones</h1>
        <p className="mt-0.5 text-[12.5px] text-[#64748B]">Sillas y puestos de trabajo del local</p>
      </div>

      {loading && <p className="py-8 text-center text-sm text-[#64748B]">Cargando…</p>}

      {!loading && (
        <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[13.5px] font-bold">Sillas y estaciones</span>
            <span className="text-[12px] text-[#64748B]">{stations.length} estaciones · {activeCount} en uso</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 @[700px]:grid-cols-2 @[1100px]:grid-cols-3">
            {stations.map((s) => {
              return (
                <div key={s.id} className="flex flex-col gap-2.5 rounded-[13px] border border-[#E2E5EC] p-3">
                  <div className="flex items-center gap-2">
                    <input
                      defaultValue={s.name}
                      onBlur={(e) => renameStation(s, e.target.value)}
                      className="min-w-0 flex-1 rounded-[8px] border border-transparent px-1.5 py-1 text-[13px] font-semibold focus:border-[#D3D7E0]"
                    />
                    <button type="button" onClick={() => removeStation(s)} aria-label="Eliminar estación" className="flex h-7 w-7 flex-none items-center justify-center rounded-[7px] border border-[#E2E5EC] text-[12px] text-[#A33421]">✕</button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(STATUS_META).map(([key, m]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setStatus(s, key)}
                        className="rounded-[7px] px-2 py-1 text-[10.5px] font-bold"
                        style={s.status === key ? { background: m.bg, color: m.ink } : { background: '#F7F8FA', color: '#94A3B8' }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="text-[10.5px] font-semibold text-[#94A3B8]">Profesional asignado</span>
                    <select
                      value={s.professional_id || ''}
                      onChange={(e) => assignProfessional(s, e.target.value)}
                      className="min-h-9 rounded-[8px] border border-[#D3D7E0] bg-white px-2 text-[12.5px]"
                    >
                      <option value="">Sin asignar</option>
                      {team.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStation()}
              placeholder="Nombre de la nueva estación"
              className="min-h-10 flex-1 rounded-[9px] border border-[#D3D7E0] bg-white px-3 text-[13px]"
            />
            <button type="button" onClick={addStation} className="min-h-10 rounded-[9px] bg-[#0F172A] px-3.5 text-[12.5px] font-bold text-white">+ Agregar</button>
          </div>
        </div>
      )}
    </div>
  );
}
