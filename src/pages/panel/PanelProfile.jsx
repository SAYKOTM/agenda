import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../components/Toast';
import { fetchWhatsappLinkStatus, startWhatsappLink } from '../../lib/api';
import { LOYALTY_TIERS } from '../../lib/loyalty';
import NotificationsCard from '../../components/panel/NotificationsCard';

const inputCls = 'min-h-11 w-full rounded-[10px] border border-[#D3D7E0] bg-white px-3 text-[15px] text-[#0F172A]';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const TIER_ORDER = ['bronce', 'plata', 'oro', 'diamante'];

export default function PanelProfile() {
  const { professional, tenant, refresh } = useOutletContext();
  const toast = useToast();
  const [draft, setDraft] = useState({
    name: professional.name || '', role_title: professional.role_title || '',
    instagram: professional.instagram || '', whatsapp: professional.whatsapp || '', bio: professional.bio || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('La foto tiene que ser una imagen'); return; }
    if (file.size > MAX_AVATAR_BYTES) { toast('La foto no puede pesar más de 2 MB'); return; }

    setUploadingAvatar(true);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${tenant.id}/${professional.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from('professional-avatars').upload(path, file, { upsert: true, cacheControl: '3600' });
    if (upErr) {
      setUploadingAvatar(false);
      toast('No pudimos subir la foto');
      return;
    }
    const { data: pub } = supabase.storage.from('professional-avatars').getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`; // cache-bust: mismo nombre de archivo en upsert
    const { error: updErr } = await supabase.from('professionals').update({ avatar_url: url }).eq('id', professional.id);
    setUploadingAvatar(false);
    if (updErr) { toast('Subimos la foto pero no pudimos guardarla en tu perfil'); return; }
    toast('Foto actualizada');
    refresh();
  }

  const [tiers, setTiers] = useState(null); // null = cargando
  const [savingTiers, setSavingTiers] = useState(false);

  useEffect(() => {
    supabase
      .from('professional_loyalty_tiers')
      .select('tier, visits_threshold, discount_pct')
      .eq('professional_id', professional.id)
      .then(({ data }) => {
        const byTier = Object.fromEntries((data || []).map((t) => [t.tier, t]));
        setTiers(TIER_ORDER.map((tier) => byTier[tier] || { tier, visits_threshold: 0, discount_pct: 0 }));
      });
  }, [professional.id]);

  function setTierField(tier, field, value) {
    setTiers((rows) => rows.map((r) => (r.tier === tier ? { ...r, [field]: value } : r)));
  }

  async function saveTiers() {
    setSavingTiers(true);
    const payload = tiers.map((t) => ({
      professional_id: professional.id, tenant_id: professional.tenant_id, tier: t.tier,
      visits_threshold: Number(t.visits_threshold) || 0, discount_pct: Number(t.discount_pct) || 0,
    }));
    const { error } = await supabase.from('professional_loyalty_tiers').upsert(payload, { onConflict: 'professional_id,tier' });
    setSavingTiers(false);
    if (error) toast('No pudimos guardar la fidelización');
    else toast('Fidelización guardada');
  }

  const [waState, setWaState] = useState(null); // 'open' | 'connecting' | 'close' | 'not_created' | null (cargando)
  const [pairingCode, setPairingCode] = useState(null);
  const [qr, setQr] = useState(null);
  const [linking, setLinking] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    fetchWhatsappLinkStatus().then((r) => setWaState(r.state)).catch(() => setWaState('not_created'));
    return () => clearInterval(pollRef.current);
  }, []);

  function pollUntilConnected() {
    clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const r = await fetchWhatsappLinkStatus();
        setWaState(r.state);
        if (r.state === 'open' || attempts >= 20) {
          clearInterval(pollRef.current);
          if (r.state === 'open') { setPairingCode(null); setQr(null); toast('WhatsApp vinculado'); }
        }
      } catch {
        clearInterval(pollRef.current);
      }
    }, 4000);
  }

  async function linkWhatsapp() {
    if (!draft.whatsapp?.trim()) { toast('Completá tu WhatsApp antes de vincular'); return; }
    setLinking(true);
    setPairingCode(null);
    setQr(null);
    try {
      const { pairingCode: code, qr: qrImg } = await startWhatsappLink();
      setPairingCode(code);
      setQr(qrImg);
      setWaState('connecting');
      pollUntilConnected();
    } catch (err) {
      toast(err.message || 'No pudimos iniciar la vinculación');
    } finally {
      setLinking(false);
    }
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('professionals').update(draft).eq('id', professional.id);
    setSaving(false);
    if (error) toast('No pudimos guardar tu perfil');
    else {
      toast('Perfil guardado');
      refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Mi perfil</h1>
        <p className="mt-0.5 text-[12.5px] text-[#64748B]">Lo que ven tus clientes en el link público</p>
      </div>

      <NotificationsCard />

      <div className="grid grid-cols-1 items-start gap-3 @[900px]:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[16px] border border-[#E2E5EC] bg-white p-4">
          <div className="flex items-center gap-3">
            {professional.avatar_url ? (
              <img src={professional.avatar_url} alt={professional.name} className="h-16.5 w-16.5 flex-none rounded-[18px] object-cover" />
            ) : (
              <div
                className="flex h-16.5 w-16.5 flex-none items-center justify-center rounded-[18px] font-mono text-[9px] text-[#64748B]"
                style={{ backgroundImage: 'repeating-linear-gradient(115deg, rgba(100,116,139,.2) 0 2px, transparent 2px 10px)' }}
              >
                foto
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="w-fit cursor-pointer rounded-[9px] border border-[#E2E5EC] px-3 py-1.5 text-[12px] font-semibold text-[#0F172A]">
                {uploadingAvatar ? 'Subiendo…' : professional.avatar_url ? 'Cambiar foto' : 'Subir foto'}
                <input type="file" accept="image/*" onChange={uploadAvatar} disabled={uploadingAvatar} className="hidden" />
              </span>
              <span className="text-[11px] text-[#94A3B8]">PNG o JPG, hasta 2 MB.</span>
            </label>
          </div>
          <Field label="Nombre público"><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className={inputCls} /></Field>
          <Field label="Especialidad"><input value={draft.role_title} onChange={(e) => setDraft((d) => ({ ...d, role_title: e.target.value }))} className={inputCls} /></Field>
          <Field label="Instagram"><input value={draft.instagram} onChange={(e) => setDraft((d) => ({ ...d, instagram: e.target.value }))} className={inputCls} /></Field>
          <Field label="WhatsApp"><input value={draft.whatsapp} onChange={(e) => setDraft((d) => ({ ...d, whatsapp: e.target.value }))} className={inputCls} placeholder="+56912345678" /></Field>

          <div className="rounded-[12px] border border-[#E2E5EC] bg-[#F8FAFC] p-3">
            {waState === 'open' ? (
              <div className="flex items-center gap-2 text-[13px] font-bold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> WhatsApp conectado
              </div>
            ) : pairingCode || qr ? (
              <div className="flex flex-col gap-2.5">
                {pairingCode && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11.5px] font-bold text-[#475569]">
                      En tu teléfono: WhatsApp → Dispositivos vinculados → Vincular con número de teléfono, e ingresá:
                    </span>
                    <span className="text-[22px] font-extrabold tracking-widest text-[#0F172A]">{pairingCode}</span>
                  </div>
                )}
                {qr && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11.5px] font-bold text-[#475569]">
                      ¿No te deja con el código? Escaneá este QR en su lugar (Dispositivos vinculados → Vincular un dispositivo):
                    </span>
                    <img src={qr} alt="QR para vincular WhatsApp" className="h-40 w-40 rounded-[8px] border border-[#E2E5EC]" />
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11.5px] text-[#94A3B8]">Expira en poco tiempo · esperando confirmación…</span>
                  <button type="button" onClick={linkWhatsapp} disabled={linking} className="text-[11.5px] font-bold text-[#0F172A] underline disabled:opacity-50">
                    Generar de nuevo
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-[#64748B]">
                  {waState === 'connecting' ? 'Vinculando…' : 'Tu WhatsApp no está vinculado: los recordatorios a clientes no se van a poder enviar.'}
                </span>
                <button
                  type="button" onClick={linkWhatsapp} disabled={linking}
                  className="min-h-9 flex-none rounded-[10px] bg-[#0F172A] px-3 text-[12.5px] font-bold text-white disabled:opacity-50"
                >
                  {linking ? 'Iniciando…' : 'Vincular WhatsApp'}
                </button>
              </div>
            )}
          </div>
          <Field label="Bio">
            <textarea rows={3} value={draft.bio} onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))} className="w-full resize-y rounded-[10px] border border-[#D3D7E0] bg-white px-3 py-2.5 text-[14px] text-[#0F172A]" />
          </Field>
          <button type="button" onClick={save} disabled={saving} className="min-h-11 rounded-[12px] bg-[#0F172A] text-[13.5px] font-bold text-white disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </div>

        <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-4">
          <div className="mb-2.5 text-[13.5px] font-bold">Así te ven tus clientes</div>
          <div className="flex items-center gap-3 rounded-[14px] border border-[#E2E5EC] p-3.5">
            {professional.avatar_url ? (
              <img src={professional.avatar_url} alt={draft.name} className="h-12 w-12 flex-none rounded-[14px] object-cover" />
            ) : (
              <div className="h-12 w-12 flex-none rounded-[14px]" style={{ backgroundImage: 'repeating-linear-gradient(115deg, rgba(100,116,139,.2) 0 2px, transparent 2px 10px)' }} />
            )}
            <div className="min-w-0">
              <div className="text-[14px] font-bold">{draft.name || 'Nombre público'}</div>
              <div className="text-xs text-[#64748B]">{draft.role_title || 'Especialidad'}</div>
            </div>
          </div>
          {draft.bio && <p className="mt-3 text-xs text-[#64748B]">{draft.bio}</p>}
          <div className="mt-3 flex items-center gap-2 border-t border-[#F1F2F5] pt-3 text-[13px]">
            {professional.rating_count > 0 ? (
              <>
                <span className="font-bold text-[#0F172A]">★ {professional.rating_avg}</span>
                <span className="text-[#64748B]">{professional.rating_count} reseña{professional.rating_count === 1 ? '' : 's'}</span>
              </>
            ) : (
              <span className="text-[#94A3B8]">Aún no tienes reseñas</span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-4">
        <div className="mb-1 text-[13.5px] font-bold">Fidelización</div>
        <p className="mb-3 max-w-[560px] text-[12px] text-[#64748B]">
          A partir de cuántas visitas COMPLETADAS contigo un cliente alcanza cada medalla, y qué descuento le aplicás al
          agendar (el interruptor general está en Ajustes del salón). Las medallas siempre se muestran; el descuento solo si
          está prendido ahí.
        </p>
        {!tiers ? (
          <p className="py-4 text-center text-[12.5px] text-[#64748B]">Cargando…</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {tiers.map((t) => {
                const meta = LOYALTY_TIERS[t.tier];
                return (
                  <div key={t.tier} className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 rounded-[11px] border border-[#E2E5EC] px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: meta.ink }}>
                      <span aria-hidden="true">{meta.icon}</span> {meta.label}
                    </span>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="number" min={0} value={t.visits_threshold}
                        onChange={(e) => setTierField(t.tier, 'visits_threshold', e.target.value)}
                        className="min-h-9 w-16 rounded-[8px] border border-[#D3D7E0] px-2 text-right text-[13px]"
                      />
                      <span className="text-[11px] text-[#94A3B8]">visitas</span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="number" min={0} max={100} value={t.discount_pct}
                        onChange={(e) => setTierField(t.tier, 'discount_pct', e.target.value)}
                        className="min-h-9 w-16 rounded-[8px] border border-[#D3D7E0] px-2 text-right text-[13px]"
                      />
                      <span className="text-[11px] text-[#94A3B8]">% off</span>
                    </label>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={saveTiers} disabled={savingTiers} className="mt-3 min-h-10 rounded-[10px] bg-[#0F172A] px-4 text-[12.5px] font-bold text-white disabled:opacity-50">
              {savingTiers ? 'Guardando…' : 'Guardar fidelización'}
            </button>
          </>
        )}
      </div>
    </div>
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
