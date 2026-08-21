import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePanelTeamManage } from '../../features/panel/usePanelTeamManage';
import { usePanelServices } from '../../features/panel/usePanelServices';
import { useToast } from '../../components/Toast';
import InviteProfessionalModal from '../../components/panel/InviteProfessionalModal';
import EditProfessionalModal from '../../components/panel/EditProfessionalModal';
import { money } from '../../lib/format';

export default function PanelTeam() {
  const { tenant, professional: me } = useOutletContext();
  const toast = useToast();
  const canSeeFinancials = me.role === 'admin';
  const { loading, error, team, ranking, reload } = usePanelTeamManage(tenant.id, tenant.timezone, canSeeFinancials);
  const { services } = usePanelServices(tenant.id);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(null);

  const statsByPro = Object.fromEntries(ranking.map((r) => [r.professional_id, r]));

  async function toggleActive(p) {
    if (p.id === me.id) {
      toast('No puedes suspender tu propia cuenta');
      return;
    }
    const { error } = await supabase.from('professionals').update({ active: !p.active }).eq('id', p.id);
    if (error) toast('No pudimos actualizar el estado');
    else {
      toast(p.active ? 'Profesional suspendido' : 'Profesional reactivado');
      reload();
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Equipo</h1>
          <p className="mt-0.5 text-[12.5px] text-[#64748B]">{team.length} profesionales</p>
        </div>
        <button type="button" onClick={() => setInviting(true)} className="min-h-9 rounded-[9px] bg-[#0F172A] px-3.5 text-[12.5px] font-bold text-white">+ Invitar profesional</button>
      </div>

      {error && <p className="text-sm text-[#C0402B]">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-[#64748B]">Cargando…</p>}

      {!loading && !error && (
        <div className="flex flex-col gap-2.5">
          {team.map((p) => {
            const stats = statsByPro[p.id];
            return (
              <div key={p.id} className="flex flex-col gap-3 rounded-[14px] border border-[#E2E5EC] bg-white p-3.5 @[700px]:flex-row @[700px]:items-center">
                <div className="flex flex-1 items-center gap-3">
                  <span
                    className="flex h-9.5 w-9.5 flex-none items-center justify-center rounded-[12px] text-[12px] font-bold"
                    style={{ backgroundImage: 'repeating-linear-gradient(115deg, rgba(100,116,139,.2) 0 2px, transparent 2px 9px)' }}
                  >
                    {p.initials}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-bold">{p.name}</span>
                      <span className={'rounded-[7px] px-2 py-0.5 text-[10.5px] font-bold ' + (p.active ? 'bg-[#E7F4EC] text-[#1E6B43]' : 'bg-[#F2F4F7] text-[#64748B]')}>{p.active ? 'Activo' : 'Suspendido'}</span>
                      {p.role === 'admin' && <span className="rounded-[7px] bg-[#E9EBFD] px-2 py-0.5 text-[10.5px] font-bold text-[#3730A3]">Admin</span>}
                    </div>
                    <div className="truncate text-[11.5px] text-[#64748B]">{p.role_title || '—'} · {(p.professional_services || []).length} servicios</div>
                  </div>
                </div>
                {canSeeFinancials && (
                  <div className="flex items-center gap-4 text-[12px] @[700px]:flex-none">
                    <div><div className="text-[10.5px] text-[#94A3B8]">Semana</div><span className="font-mono">{stats ? stats.bookings_count + ' citas' : '—'}</span></div>
                    <div><div className="text-[10.5px] text-[#94A3B8]">Ingresos</div><span className="font-mono font-medium">{stats ? money(stats.revenue, tenant.currency) : '—'}</span></div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(p)} className="min-h-9 flex-1 rounded-[9px] border border-[#E2E5EC] px-2.5 text-[12px] font-semibold @[700px]:flex-none">Permisos</button>
                  <button
                    type="button"
                    onClick={() => toggleActive(p)}
                    disabled={p.id === me.id}
                    title={p.id === me.id ? 'No puedes suspender tu propia cuenta' : undefined}
                    className="min-h-9 flex-1 rounded-[9px] border border-[#E2E5EC] px-2.5 text-[12px] font-semibold disabled:opacity-40 @[700px]:flex-none"
                  >
                    {p.active ? 'Baja' : 'Reactivar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {inviting && <InviteProfessionalModal onClose={() => setInviting(false)} onInvited={reload} />}
      {editing && <EditProfessionalModal professional={editing} allServices={services} isSelf={editing.id === me.id} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}
