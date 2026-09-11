import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../Toast';
import { TENANT_THEMES, themeMatchesPreset } from '../../lib/tenantThemes';

// Paletas del link público (tenants.theme): tres pensadas para barbería y tres para salón de
// belleza. Vive acá, y no dentro de Ajustes, porque se muestra en dos pantallas: Ajustes (el
// salón completo) y Perfil (donde el profesional está justamente mirando cómo lo ven sus
// clientes). Cambiar la paleta es cosa del salón entero, así que solo un admin puede guardarla
// -- RLS lo exige igual (tenants_self_update, 0010_admin_role_guards.sql); a un profesional se
// le muestra cuál está activa y a quién pedirle el cambio.
export default function ThemePicker({ tenant, refresh, canEdit = true }) {
  const toast = useToast();
  const [savingTheme, setSavingTheme] = useState(null); // id del preset que se está guardando

  async function applyTheme(preset) {
    if (!canEdit) return;
    setSavingTheme(preset.id);
    const { error } = await supabase.from('tenants').update({ theme: preset.colors }).eq('id', tenant.id);
    setSavingTheme(null);
    if (error) { toast('No pudimos aplicar la paleta'); return; }
    toast(`Paleta "${preset.label}" aplicada`);
    refresh();
  }

  return (
    <>
      <ThemeGroup title="Barbería" themes={TENANT_THEMES.filter((t) => t.group === 'barberia')} tenant={tenant} savingTheme={savingTheme} canEdit={canEdit} onPick={applyTheme} />
      <ThemeGroup title="Salón de belleza" themes={TENANT_THEMES.filter((t) => t.group === 'salon')} tenant={tenant} savingTheme={savingTheme} canEdit={canEdit} onPick={applyTheme} />
    </>
  );
}

function ThemeGroup({ title, themes, tenant, savingTheme, canEdit, onPick }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[#94A3B8]">{title}</div>
      <div className="flex flex-wrap gap-2.5">
        {themes.map((t) => (
          <ThemeSwatch
            key={t.id}
            theme={t}
            active={themeMatchesPreset(tenant.theme, t)}
            saving={savingTheme === t.id}
            canEdit={canEdit}
            onPick={() => onPick(t)}
          />
        ))}
      </div>
    </div>
  );
}

function ThemeSwatch({ theme, active, saving, canEdit, onPick }) {
  const { bg, panel, accent, ink } = theme.colors;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={saving || !canEdit}
      aria-pressed={active}
      className={
        'flex w-28 flex-col items-start gap-2 rounded-[13px] border-2 p-2.5 text-left disabled:opacity-60 ' +
        (active ? 'border-[#0F172A]' : 'border-[#E2E5EC]')
      }
    >
      <div className="flex h-11 w-full overflow-hidden rounded-[8px]" style={{ background: bg }}>
        <div className="h-full w-1/2" style={{ background: panel }} />
        <div className="flex h-full w-1/2 items-center justify-center" style={{ background: accent }}>
          <span className="h-3 w-3 rounded-full" style={{ background: ink }} />
        </div>
      </div>
      <span className="text-[11.5px] font-semibold text-[#0F172A]">{active ? `✓ ${theme.label}` : theme.label}</span>
    </button>
  );
}
