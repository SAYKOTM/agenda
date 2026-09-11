import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTenantData } from '../features/tenant/useTenantData';
import { money, durLabel } from '../lib/format';
import { professionalBookingPath } from '../lib/publicLinks';
import ClientShell from '../components/ClientShell';
import PhotoCarousel from '../components/PhotoCarousel';

// Perfil público de UN profesional: lo que ve el cliente cuando abre el link que ese profesional
// reparte (Panel → Perfil → "Tu link público"). Muestra su foto, su galería de trabajos, sus
// reseñas y SOLO su catálogo, y el botón de reservar entra al wizard ya con él elegido.
export default function ProfessionalPublic() {
  const { slug, proSlug } = useParams();
  const navigate = useNavigate();
  const { loading, error, redirectSlug, tenant, categories, professionals } = useTenantData(slug);

  if (loading) return <LoadingShell />;
  if (redirectSlug) return <Navigate to={`/${redirectSlug}/con/${proSlug}`} replace />;
  if (error) return <ErrorShell text={error === 'not_found' ? `No encontramos el salón "${slug}".` : `No pudimos cargar ${slug}.`} />;

  // El link viejo (o el de una base sin migrar) puede traer el id en vez del slug: se aceptan
  // los dos para no romper links ya compartidos.
  const pro = professionals.find((p) => p.public_slug === proSlug || p.id === proSlug);
  if (!pro) return <ErrorShell text="Este perfil no está disponible." onBack={() => navigate(`/${slug}`)} />;

  const services = categories.flatMap((c) => c.services).filter((s) => s.professional_id === pro.id);

  return (
    <ClientShell theme={tenant.theme}>
      <div className="flex-shrink-0 flex items-center gap-2.5 border-b border-[var(--t-border)] px-4.5 py-3.5">
        <button
          type="button"
          onClick={() => navigate(`/${slug}`)}
          aria-label={`Volver a ${tenant.name}`}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[var(--t-border)] text-[15px]"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold leading-tight tracking-tight">{tenant.name}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-[var(--t-sub)]">Perfil de {pro.name.split(' ')[0]}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth flex flex-col gap-4 px-4.5 py-4.5 [animation:fadeUp_.3s_ease]">
        <div className="flex items-center gap-3.5">
          {pro.avatar_url ? (
            <img src={pro.avatar_url} alt={pro.name} className="h-18 w-18 flex-none rounded-[22px] object-cover" />
          ) : (
            <div className="flex h-18 w-18 flex-none items-center justify-center rounded-[22px] bg-[var(--t-border)] text-[19px] font-extrabold">
              {pro.initials}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-extrabold leading-tight tracking-tight">{pro.name}</h1>
            {pro.role_title && <div className="mt-0.5 text-[13px] text-[var(--t-sub)]">{pro.role_title}</div>}
            {pro.rating_count > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-[12.5px]">
                <span style={{ color: 'var(--t-accent)' }}>★</span>
                <span className="font-bold">{pro.rating_avg}</span>
                <span className="text-[var(--t-sub)]">
                  {pro.rating_count} reseña{pro.rating_count === 1 ? '' : 's'}
                </span>
              </div>
            )}
          </div>
        </div>

        {pro.bio && <p className="m-0 text-[13.5px] leading-relaxed text-[var(--t-sub)]">{pro.bio}</p>}

        {pro.gallery_urls?.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">Trabajos</div>
            <PhotoCarousel photos={pro.gallery_urls} alt={`Trabajo de ${pro.name}`} className="h-60" />
          </div>
        )}

        {pro.instagram && (
          <a
            href={`https://instagram.com/${String(pro.instagram).replace(/^@/, '')}`}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-[12.5px] font-semibold underline"
            style={{ color: 'var(--t-accent)' }}
          >
            @{String(pro.instagram).replace(/^@/, '')} en Instagram
          </a>
        )}

        {services.length > 0 && (
          <div>
            <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">Sus servicios</div>
            <div className="flex flex-col gap-2">
              {services.map((s) => (
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
          onClick={() => navigate(professionalBookingPath(slug, pro))}
          className="min-h-13 w-full rounded-[18px] text-[15px] font-bold"
          style={{ background: 'var(--t-accent)', color: 'var(--t-accent-ink)' }}
        >
          Reservar con {pro.name.split(' ')[0]}
        </button>
      </div>
    </ClientShell>
  );
}

function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] text-sm text-slate-500" role="status" aria-live="polite">
      Cargando…
    </div>
  );
}

function ErrorShell({ text, onBack }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F1F2F5] px-6 text-center text-sm text-slate-500">
      <p>{text}</p>
      {onBack && (
        <button type="button" onClick={onBack} className="rounded-[11px] border border-[#E2E5EC] bg-white px-4 py-2 text-[13px] font-semibold text-[#0F172A]">
          Ver el salón
        </button>
      )}
    </div>
  );
}
