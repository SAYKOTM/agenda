import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../components/Toast';
import { geocodeAddress, ApiError } from '../../lib/api';
import { TENANT_THEMES, themeMatchesPreset } from '../../lib/tenantThemes';
import { usePanelExport } from '../../features/panel/usePanelExport';

const inputCls = 'min-h-11 w-full rounded-[10px] border border-[#D3D7E0] bg-white px-3 text-[14px] text-[#0F172A]';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_GALLERY_PHOTOS = 9;

export default function PanelSettings() {
  const { tenant, refresh } = useOutletContext();
  const toast = useToast();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [savingTheme, setSavingTheme] = useState(null); // id del preset que se está guardando
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const { exporting, error: exportError, exportCustomers, exportBookings, exportServices } = usePanelExport({ tenant });

  async function runExport(fn) {
    const count = await fn();
    if (count !== null) toast(count ? `Listo: ${count} ${count === 1 ? 'fila exportada' : 'filas exportadas'}` : 'No hay datos para exportar todavía');
  }

  async function uploadGalleryPhotos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const current = tenant.gallery_urls || [];
    const room = MAX_GALLERY_PHOTOS - current.length;
    if (room <= 0) { toast(`Ya tenés el máximo de ${MAX_GALLERY_PHOTOS} fotos`); return; }
    const toUpload = files.slice(0, room);
    if (files.length > room) toast(`Solo se suben ${room}: llegaste al máximo de ${MAX_GALLERY_PHOTOS} fotos`);

    setUploadingGallery(true);
    const newUrls = [];
    for (const file of toUpload) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_LOGO_BYTES) continue;
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${tenant.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('tenant-gallery').upload(path, file);
      if (upErr) continue;
      const { data: pub } = supabase.storage.from('tenant-gallery').getPublicUrl(path);
      newUrls.push(pub.publicUrl);
    }
    if (newUrls.length) {
      const { error: updErr } = await supabase.from('tenants').update({ gallery_urls: [...current, ...newUrls] }).eq('id', tenant.id);
      if (updErr) toast('Subimos las fotos pero no pudimos guardarlas en tu perfil');
    }
    setUploadingGallery(false);
    if (newUrls.length) { toast('Fotos agregadas'); refresh(); }
  }

  async function removeGalleryPhoto(url) {
    const next = (tenant.gallery_urls || []).filter((u) => u !== url);
    const { error } = await supabase.from('tenants').update({ gallery_urls: next }).eq('id', tenant.id);
    if (error) toast('No pudimos quitar la foto');
    else refresh();
  }

  async function applyTheme(preset) {
    setSavingTheme(preset.id);
    const { error } = await supabase.from('tenants').update({ theme: preset.colors }).eq('id', tenant.id);
    setSavingTheme(null);
    if (error) { toast('No pudimos aplicar la paleta'); return; }
    toast(`Paleta "${preset.label}" aplicada`);
    refresh();
  }

  async function locateOnMap() {
    setGeocoding(true);
    try {
      await geocodeAddress();
      toast('Ubicación actualizada en el mapa');
      refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'No pudimos ubicar la dirección');
    } finally {
      setGeocoding(false);
    }
  }

  async function uploadLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('El logo tiene que ser una imagen'); return; }
    if (file.size > MAX_LOGO_BYTES) { toast('El logo no puede pesar más de 2 MB'); return; }

    setUploadingLogo(true);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${tenant.id}/logo.${ext}`;
    const { error: upErr } = await supabase.storage.from('tenant-logos').upload(path, file, { upsert: true, cacheControl: '3600' });
    if (upErr) {
      setUploadingLogo(false);
      toast('No pudimos subir el logo');
      return;
    }
    const { data: pub } = supabase.storage.from('tenant-logos').getPublicUrl(path);
    // cache-bust: mismo nombre de archivo en upsert, así que sin esto el navegador (y el header
    // del correo) podrían seguir mostrando el logo viejo cacheado bajo la misma URL.
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    const { error: updErr } = await supabase.from('tenants').update({ logo_url: url }).eq('id', tenant.id);
    setUploadingLogo(false);
    if (updErr) { toast('Subimos el logo pero no pudimos guardarlo en tu perfil'); return; }
    toast('Logo actualizado');
    refresh();
  }
  const [draft, setDraft] = useState({
    name: tenant.name || '', address: tenant.address || '', phone: tenant.phone || '',
    instagram: tenant.instagram || '', hours_label: tenant.hours_label || '',
    cancellation_policy_text: tenant.cancellation_policy_text || '',
    google_place_id: tenant.google_place_id || '',
    google_rating: tenant.google_rating ?? '', google_reviews_count: tenant.google_reviews_count ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState(tenant.slug);
  const [slugSaving, setSlugSaving] = useState(false);
  const [loyalty, setLoyalty] = useState({ enable_loyalty_discounts: !!tenant.enable_loyalty_discounts });
  const [loyaltySaving, setLoyaltySaving] = useState(false);

  async function save() {
    setSaving(true);
    const payload = {
      ...draft,
      google_rating: draft.google_rating === '' ? null : Number(draft.google_rating),
      google_reviews_count: draft.google_reviews_count === '' ? null : Number(draft.google_reviews_count),
    };
    const { error } = await supabase.from('tenants').update(payload).eq('id', tenant.id);
    setSaving(false);
    if (error) toast('No pudimos guardar los cambios');
    else {
      toast('Cambios guardados');
      refresh();
    }
  }

  async function saveLoyalty(next) {
    setLoyaltySaving(true);
    const { error } = await supabase.from('tenants').update(next).eq('id', tenant.id);
    setLoyaltySaving(false);
    if (error) {
      toast('No pudimos guardar la configuración de fidelidad');
      return;
    }
    setLoyalty(next);
    refresh();
  }

  async function saveSlug() {
    if (slug === tenant.slug) return;
    setSlugSaving(true);
    const { error } = await supabase.rpc('update_tenant_slug', { p_new_slug: slug.trim().toLowerCase() });
    setSlugSaving(false);
    if (error) {
      toast(error.message.includes('en uso') ? 'Ese link ya está en uso' : 'No pudimos cambiar el link público');
      return;
    }
    toast('Link público actualizado · el anterior seguirá redirigiendo');
    refresh();
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Ajustes del salón</h1>
        <p className="mt-0.5 text-[12.5px] text-[#64748B]">Identidad, dirección y link público</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 @[900px]:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[16px] border border-[#E2E5EC] bg-white p-4">
          <div className="flex items-center gap-3">
            {tenant.logo_url ? (
              <img src={tenant.logo_url} alt="Logo" className="h-13 w-13 flex-none rounded-[15px] object-cover" />
            ) : (
              <div className="flex h-13 w-13 flex-none items-center justify-center rounded-[15px] bg-[#4F46E5] text-[19px] font-extrabold text-white">{tenant.mark}</div>
            )}
            <label className="flex flex-col gap-1">
              <span className="w-fit cursor-pointer rounded-[9px] border border-[#E2E5EC] px-3 py-1.5 text-[12px] font-semibold text-[#0F172A]">
                {uploadingLogo ? 'Subiendo…' : tenant.logo_url ? 'Cambiar logo' : 'Subir logo'}
                <input type="file" accept="image/*" onChange={uploadLogo} disabled={uploadingLogo} className="hidden" />
              </span>
              <span className="text-[11px] text-[#94A3B8]">PNG o JPG, hasta 2 MB. Se usa también en el encabezado de los correos.</span>
            </label>
          </div>

          <Field label="Nombre del salón"><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className={inputCls} /></Field>
          <Field label="Dirección"><input value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} className={inputCls} /></Field>

          <div className="flex items-center justify-between gap-3 rounded-[11px] border border-[#E2E5EC] px-3 py-2.5">
            <span className="text-[12px] text-[#64748B]">
              {tenant.lat != null ? '✓ Ubicación guardada para el mapa' : 'Sin ubicar en el mapa todavía'}
            </span>
            <button type="button" onClick={locateOnMap} disabled={geocoding || !draft.address.trim()} className="min-h-9 flex-none rounded-[9px] border border-[#E2E5EC] px-3 text-[12px] font-semibold disabled:opacity-50">
              {geocoding ? 'Ubicando…' : tenant.lat != null ? 'Volver a ubicar' : 'Ubicar en el mapa'}
            </button>
          </div>
          <p className="-mt-1.5 text-[11px] text-[#94A3B8]">Guardá la dirección primero y después apretá el botón: así aparece el mapa en tu link público.</p>

          <Field label="Google Place ID (opcional)">
            <input value={draft.google_place_id} onChange={(e) => setDraft((d) => ({ ...d, google_place_id: e.target.value }))} className={inputCls} placeholder="ChIJ…" />
          </Field>
          <p className="-mt-1.5 text-[11px] text-[#94A3B8]">
            Busca tu negocio en{' '}
            <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noreferrer" className="underline">esta herramienta de Google</a>{' '}
            y pegá el ID acá. Habilita el botón "Dejanos una reseña en Google" y el de "Google Maps" en tu link público (no requiere tarjeta).
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Rating de Google">
              <input type="number" min={0} max={5} step={0.1} value={draft.google_rating} onChange={(e) => setDraft((d) => ({ ...d, google_rating: e.target.value }))} className={inputCls} placeholder="4.8" />
            </Field>
            <Field label="Reseñas en Google">
              <input type="number" min={0} value={draft.google_reviews_count} onChange={(e) => setDraft((d) => ({ ...d, google_reviews_count: e.target.value }))} className={inputCls} placeholder="212" />
            </Field>
          </div>
          <p className="-mt-1.5 text-[11px] text-[#94A3B8]">
            Se cargan a mano: mostrar el rating real de Google automáticamente requiere una API paga de Google que pide tarjeta. Actualizalo cuando quieras desde tu ficha de Google.
          </p>
          <Field label="Teléfono"><input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} className={inputCls} /></Field>
          <Field label="Instagram"><input value={draft.instagram} onChange={(e) => setDraft((d) => ({ ...d, instagram: e.target.value }))} className={inputCls} /></Field>
          <Field label="Horario (texto para la vista pública)"><input value={draft.hours_label} onChange={(e) => setDraft((d) => ({ ...d, hours_label: e.target.value }))} className={inputCls} /></Field>
          <Field label="Política de reserva (se muestra al cliente al pagar)">
            <textarea
              rows={2}
              value={draft.cancellation_policy_text}
              onChange={(e) => setDraft((d) => ({ ...d, cancellation_policy_text: e.target.value }))}
              className="w-full resize-y rounded-[10px] border border-[#D3D7E0] bg-white px-3 py-2.5 text-[14px] text-[#0F172A]"
            />
          </Field>

          <button type="button" onClick={save} disabled={saving} className="min-h-11 rounded-[12px] bg-[#0F172A] text-[13.5px] font-bold text-white disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>

          <div className="mt-1 border-t border-[#F1F2F5] pt-3">
            <span className="text-[11.5px] font-bold text-[#475569]">Link público (slug)</span>
            <div className="mt-1.5 flex items-center overflow-hidden rounded-[10px] border border-[#D3D7E0] bg-white">
              <span className="flex min-h-10 items-center bg-[#F7F8FA] px-2.5 font-mono text-[12px] text-[#94A3B8]">agenda.app/</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} className="min-h-10 min-w-0 flex-1 border-none px-2.5 font-mono text-[12.5px] text-[#0F172A]" />
            </div>
            <p className="mt-1.5 text-[11.5px] text-[#64748B]">Los clientes reservan en agenda.app/{tenant.slug}. Si lo cambias, el link anterior sigue redirigiendo.</p>
            <button type="button" onClick={saveSlug} disabled={slugSaving || slug === tenant.slug} className="mt-2 min-h-9 rounded-[9px] border border-[#E2E5EC] px-3 text-[12.5px] font-semibold disabled:opacity-50">
              {slugSaving ? 'Guardando…' : 'Actualizar link'}
            </button>
          </div>
        </div>

        <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-4">
          <div className="mb-2.5 text-[13.5px] font-bold">Horario general del local</div>
          <p className="text-[12px] text-[#64748B]">Este es solo el texto que ve el cliente en la landing pública. El horario real que usa el motor de reservas se edita por profesional en <strong>Disponibilidad</strong>.</p>
        </div>
      </div>

      <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-4">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div>
            <div className="text-[13.5px] font-bold">Galería de fotos</div>
            <p className="mt-0.5 max-w-[480px] text-[12px] text-[#64748B]">Se muestran en tu link público. La primera es la foto principal. Hasta {MAX_GALLERY_PHOTOS}, PNG o JPG de 2 MB c/u.</p>
          </div>
          <label className="w-fit flex-none cursor-pointer rounded-[9px] border border-[#E2E5EC] px-3 py-1.5 text-[12px] font-semibold text-[#0F172A]">
            {uploadingGallery ? 'Subiendo…' : '+ Agregar fotos'}
            <input type="file" accept="image/*" multiple onChange={uploadGalleryPhotos} disabled={uploadingGallery} className="hidden" />
          </label>
        </div>
        {(tenant.gallery_urls || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tenant.gallery_urls.map((url, i) => (
              <div key={url} className="group relative h-20 w-20 flex-none overflow-hidden rounded-[10px] border border-[#E2E5EC]">
                <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-black/55 py-0.5 text-center text-[9px] font-bold text-white">Principal</span>}
                <button
                  type="button" onClick={() => removeGalleryPhoto(url)} aria-label="Quitar foto"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] text-white opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-4">
        <div className="mb-1 text-[13.5px] font-bold">Apariencia</div>
        <p className="mb-3 max-w-[520px] text-[12px] text-[#64748B]">Los colores de tu link público (el que ven tus clientes al reservar). Elegí la paleta que más se acerque a tu estilo.</p>
        <ThemeGroup title="Barbería" themes={TENANT_THEMES.filter((t) => t.group === 'barberia')} tenant={tenant} savingTheme={savingTheme} onPick={applyTheme} />
        <ThemeGroup title="Salón de belleza" themes={TENANT_THEMES.filter((t) => t.group === 'salon')} tenant={tenant} savingTheme={savingTheme} onPick={applyTheme} />
      </div>

      <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-4">
        <div className="mb-1 text-[13.5px] font-bold">Tus datos</div>
        <p className="mb-3 max-w-[560px] text-[12px] leading-snug text-[#64748B]">
          Descargá tus clientes, tu historial de citas y tu catálogo en CSV cuando quieras. Los datos son del salón: sirven para
          llevar tu contabilidad aparte, para migrar a otro sistema y para responder si un cliente te pide una copia de su
          información. Se abren directo en Excel o en Google Sheets.
        </p>
        <div className="flex flex-wrap gap-2">
          <ExportButton label="Clientes" busy={exporting === 'clientes'} disabled={!!exporting} onClick={() => runExport(exportCustomers)} />
          <ExportButton label="Reservas" busy={exporting === 'reservas'} disabled={!!exporting} onClick={() => runExport(exportBookings)} />
          <ExportButton label="Servicios" busy={exporting === 'servicios'} disabled={!!exporting} onClick={() => runExport(exportServices)} />
        </div>
        {exportError && <p className="mt-2 text-[12px] text-[#A33421]">{exportError}</p>}
        <p className="mt-2.5 text-[11.5px] text-[#94A3B8]">
          El archivo de reservas incluye nombre, teléfono y email de cada cliente: guardalo donde corresponda y no lo compartas
          por canales abiertos.
        </p>
      </div>

      <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-4">
        <div className="mb-1 flex items-center justify-between">
          <div>
            <div className="text-[13.5px] font-bold">Fidelización</div>
            <p className="mt-0.5 max-w-[520px] text-[12px] text-[#64748B]">
              Las medallas (Bronce/Plata/Oro/Diamante) siempre se muestran. Activá esto para que se aplique el descuento que
              cada profesional configuró para sus medallas (en su <strong>Mi perfil</strong>) al agendar con él.
            </p>
          </div>
          <Switch on={loyalty.enable_loyalty_discounts} onToggle={() => saveLoyalty({ ...loyalty, enable_loyalty_discounts: !loyalty.enable_loyalty_discounts })} disabled={loyaltySaving} />
        </div>
      </div>
    </div>
  );
}

function ThemeGroup({ title, themes, tenant, savingTheme, onPick }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[#94A3B8]">{title}</div>
      <div className="flex flex-wrap gap-2.5">
        {themes.map((t) => (
          <ThemeSwatch key={t.id} theme={t} active={themeMatchesPreset(tenant.theme, t)} saving={savingTheme === t.id} onPick={() => onPick(t)} />
        ))}
      </div>
    </div>
  );
}

function ThemeSwatch({ theme, active, saving, onPick }) {
  const { bg, panel, accent, ink } = theme.colors;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={saving}
      aria-pressed={active}
      className={'flex w-28 flex-col items-start gap-2 rounded-[13px] border-2 p-2.5 text-left disabled:opacity-60 ' + (active ? 'border-[#0F172A]' : 'border-[#E2E5EC]')}
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

function Switch({ on, onToggle, disabled }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      className={'relative h-6 w-10 flex-none rounded-full disabled:opacity-50 ' + (on ? 'bg-[#0F172A]' : 'bg-[#D3D7E0]')}
    >
      <span className={'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ' + (on ? 'left-[19px]' : 'left-0.5')} />
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-bold text-[#475569]">{label}</span>
      {children}
    </label>
  );
}

function ExportButton({ label, busy, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 items-center gap-2 rounded-[11px] border border-[#D3D7E0] bg-white px-3.5 text-[13px] font-semibold text-[#0F172A] disabled:opacity-50"
    >
      <span aria-hidden="true" className="text-[#64748B]">↓</span>
      {busy ? 'Generando…' : label}
    </button>
  );
}
