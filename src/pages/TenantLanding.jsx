import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTenantData } from '../features/tenant/useTenantData';
import { supabase } from '../lib/supabaseClient';
import { money, durLabel } from '../lib/format';
import { wazeUrl, googleMapsUrl, appleMapsUrl, googleWriteReviewUrl, googleMapsEmbedUrl } from '../lib/mapLinks';
import ClientShell from '../components/ClientShell';
import LocationMap from '../components/LocationMap';

export default function TenantLanding() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { loading, error, redirectSlug, tenant, categories } = useTenantData(slug);

  // Aproximación simple del tracker de conversión: cuenta vistas de la landing pública, no
  // deduplicada por sesión (ver panel_month_summary, migración 0016_analytics.sql).
  useEffect(() => {
    // supabase-js query builders son "thenables" perezosos: sin .then()/await la petición
    // nunca se dispara.
    if (tenant?.id) supabase.rpc('track_link_view', { p_tenant_id: tenant.id }).then(() => {});
  }, [tenant?.id]);

  if (loading) return <LoadingShell />;
  if (redirectSlug) return <Navigate to={`/${redirectSlug}`} replace />;
  if (error) return <ErrorShell error={error} slug={slug} />;

  const allServices = categories.flatMap((c) => c.services);
  const topServices = allServices.slice(0, 4);

  return (
    <ClientShell theme={tenant.theme}>
      <div className="flex-shrink-0 flex items-center gap-3 border-b border-[var(--t-border)] px-4.5 py-4">
        <div className="flex h-9.5 w-9.5 flex-none items-center justify-center rounded-[14px] bg-[var(--t-accent)] text-base font-extrabold text-[var(--t-accent-ink)]">
          {tenant.mark}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold leading-tight tracking-tight">{tenant.name}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-[var(--t-sub)]">{tenant.tagline}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth flex flex-col gap-4.5 px-4.5 py-4.5 [animation:fadeUp_.3s_ease]">
        <GalleryBlock gallery={tenant.gallery_urls} />

        <div className="flex flex-col gap-2.5">
          <h1 className="m-0 text-[29px] font-extrabold leading-[1.12] tracking-tight">{tenant.headline}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            <span className="flex items-center gap-2">
              <span className="font-bold">{tenant.rating}</span>
              <span className="text-[12px] tracking-[2px]" style={{ color: 'var(--t-accent)' }}>★★★★★</span>
              <span className="text-[var(--t-sub)]">{tenant.reviews_count} reseñas</span>
            </span>
            {tenant.google_place_id && (
              <>
                {tenant.google_rating != null && (
                  <span className="flex items-center gap-1.5 text-[var(--t-sub)]">
                    <span aria-hidden="true">·</span>
                    <span className="font-bold text-[var(--t-ink)]">{tenant.google_rating}</span>
                    <span>en Google ({tenant.google_reviews_count} reseñas)</span>
                  </span>
                )}
                <a href={googleWriteReviewUrl(tenant.google_place_id)} target="_blank" rel="noreferrer" className="font-semibold underline" style={{ color: 'var(--t-accent)' }}>
                  Dejanos una reseña en Google
                </a>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 overflow-hidden rounded-[18px] border border-[var(--t-border)]">
          <LocationBlock tenant={tenant} />
          {tenant.hours_label && <InfoRow label="Horario" value={tenant.hours_label} />}
        </div>

        {topServices.length > 0 && (
          <div>
            <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">Más pedidos</div>
            <div className="flex flex-col gap-2">
              {topServices.map((s) => (
                <div key={s.id} className="flex items-baseline gap-2.5 text-[13.5px]">
                  <span className="flex-1">{s.name}</span>
                  <span className="h-px w-6 flex-none bg-[var(--t-border)]" />
                  <span className="font-mono text-xs text-[var(--t-sub)]">{durLabel(s.duration_min)}</span>
                  <span className="text-[13px] font-bold">{money(s.price_clp, tenant.currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-[var(--t-border)] bg-[var(--t-bg)] px-4.5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-3.5">
        <button
          type="button"
          onClick={() => navigate(`/${slug}/reservar`)}
          className="min-h-13 w-full rounded-[18px] text-[15px] font-bold"
          style={{ background: 'var(--t-accent)', color: 'var(--t-accent-ink)' }}
        >
          Reservar hora
        </button>
      </div>
    </ClientShell>
  );
}

function GalleryBlock({ gallery }) {
  if (!gallery?.length) {
    return (
      <div className="overflow-hidden rounded-[20px] border border-[var(--t-border)]">
        <div
          className="flex h-42 items-end p-3"
          style={{ backgroundImage: 'repeating-linear-gradient(115deg, rgba(125,131,133,.20) 0 2px, transparent 2px 11px)' }}
        >
          <span className="rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] tracking-wide text-white">foto principal del local</span>
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-15.5" style={{ backgroundImage: 'repeating-linear-gradient(115deg, rgba(125,131,133,.18) 0 2px, transparent 2px 11px)' }} />
          ))}
          <div
            className="flex h-15.5 items-center justify-center font-mono text-[10px] text-[var(--t-sub)]"
            style={{ backgroundImage: 'repeating-linear-gradient(115deg, rgba(125,131,133,.18) 0 2px, transparent 2px 11px)' }}
          >
            +6
          </div>
        </div>
      </div>
    );
  }

  const [main, ...rest] = gallery;
  const thumbs = rest.slice(0, 3);
  const extra = rest.length - thumbs.length;

  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--t-border)]">
      <img src={main} alt="Foto principal del local" className="h-42 w-full object-cover" />
      {thumbs.length > 0 && (
        <div className="grid grid-cols-3 gap-0.5">
          {thumbs.map((url, i) => (
            <div key={url} className="relative h-15.5">
              <img src={url} alt="" className="h-full w-full object-cover" />
              {i === thumbs.length - 1 && extra > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 font-mono text-[11px] font-bold text-white">+{extra}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LocationBlock({ tenant }) {
  const { address, google_place_id: placeId, lat, lng, theme } = tenant;
  if (!address) return null;
  // Prioriza el embed de Google si hay API key configurada (la mayoría no la va a tener, por el
  // requisito de tarjeta en Google Cloud); si no, cae al mapa propio (Leaflet + CARTO, gratis).
  const googleEmbedUrl = googleMapsEmbedUrl(placeId);

  return (
    <div className="flex flex-col gap-2.5 bg-[var(--t-panel)] px-3.5 py-3.5 text-[13px]">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">Ubicación</span>
      {googleEmbedUrl ? (
        <iframe
          title="Ubicación en el mapa"
          src={googleEmbedUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-40 w-full rounded-[12px] border-0"
        />
      ) : lat != null && lng != null ? (
        <div className="h-40 w-full overflow-hidden rounded-[12px]">
          <LocationMap lat={lat} lng={lng} accent={theme?.accent || '#0F172A'} bg={theme?.bg || '#FFFFFF'} />
        </div>
      ) : (
        <span>{address}</span>
      )}
      <div className="flex gap-2">
        <a href={googleMapsUrl(address, placeId)} target="_blank" rel="noreferrer" className="flex-1 rounded-[10px] border border-[var(--t-border)] py-2 text-center text-[12px] font-semibold">
          Google Maps
        </a>
        <a href={wazeUrl(address)} target="_blank" rel="noreferrer" className="flex-1 rounded-[10px] border border-[var(--t-border)] py-2 text-center text-[12px] font-semibold">
          Waze
        </a>
        <a href={appleMapsUrl(address)} target="_blank" rel="noreferrer" className="flex-1 rounded-[10px] border border-[var(--t-border)] py-2 text-center text-[12px] font-semibold">
          Apple Maps
        </a>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex gap-3 bg-[var(--t-panel)] px-3.5 py-3.5 text-[13px]">
      <span className="w-16.5 flex-none pt-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">{label}</span>
      <span className="flex-1">{value}</span>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] text-sm text-slate-500" role="status" aria-live="polite">
      Cargando…
    </div>
  );
}

function ErrorShell({ error, slug }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#F1F2F5] px-6 text-center text-sm text-slate-500">
      <p>{error === 'not_found' ? `No encontramos el salón "${slug}".` : `No pudimos cargar ${slug}.`}</p>
      {error !== 'not_found' && <p className="text-xs">{error}</p>}
    </div>
  );
}
