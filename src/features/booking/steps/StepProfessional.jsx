import { Link } from 'react-router-dom';
import { professionalPublicPath } from '../../../lib/publicLinks';

export default function StepProfessional({ slug, professionals, selected, onSelect }) {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth flex flex-col gap-3.5 px-4.5 py-4 [animation:fadeUp_.28s_ease]">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--t-sub)]">Paso 1 de {professionals.length > 1 ? 5 : 4}</div>
        <h2 className="mt-1.5 text-[23px] font-extrabold tracking-tight">¿Con quién te atiendes?</h2>
      </div>
      <div className="flex flex-col gap-2">
        {professionals.map((p) => (
          <div key={p.id} className="flex flex-col gap-1">
            <ProCard
              label={p.name}
              sub={p.role_title}
              rating={p.rating_count > 0 ? p.rating_avg : null}
              ratingCount={p.rating_count}
              initials={p.initials}
              avatarUrl={p.avatar_url}
              on={selected === p.id}
              onClick={() => onSelect(p.id)}
            />
            {/* Quien tiene algo que mostrar (foto de perfil, galería de trabajos, bio) merece
                que el cliente pueda mirarlo antes de elegir. */}
            {(p.gallery_urls?.length > 0 || p.bio) && (
              <Link
                to={professionalPublicPath(slug, p)}
                className="w-fit pl-3.5 text-[11.5px] font-semibold underline"
                style={{ color: 'var(--t-accent)' }}
              >
                Ver perfil{p.gallery_urls?.length > 0 ? ` y ${p.gallery_urls.length} foto${p.gallery_urls.length === 1 ? '' : 's'}` : ''}
              </Link>
            )}
          </div>
        ))}
        <ProCard label="Cualquiera disponible" sub="Te asignamos al primero con hora libre" initials="★" on={selected === 'any'} onClick={() => onSelect('any')} />
      </div>
    </div>
  );
}

function ProCard({ label, sub, initials, avatarUrl, rating, ratingCount, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'flex min-h-15 items-center gap-3 rounded-[18px] border px-3.5 py-3 text-left ' +
        (on ? 'border-[var(--t-accent)] bg-[color-mix(in_srgb,var(--t-accent)_12%,transparent)]' : 'border-[var(--t-border)] bg-[var(--t-panel)]')
      }
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-11.5 w-11.5 flex-none rounded-[15px] object-cover" />
      ) : (
        <span className="flex h-11.5 w-11.5 flex-none items-center justify-center rounded-[15px] bg-[var(--t-border)] text-sm font-bold">{initials}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold">{label}</span>
        {sub && <span className="mt-0.5 block text-xs text-[var(--t-sub)]">{sub}</span>}
        {rating != null && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-[var(--t-sub)]">
            <span style={{ color: 'var(--t-accent)' }}>★</span> {rating} ({ratingCount})
          </span>
        )}
      </span>
      <span
        className={
          'flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[13px] font-bold ' +
          (on ? 'border-[var(--t-accent)] bg-[var(--t-accent)] text-[var(--t-accent-ink)]' : 'border-[var(--t-border)] text-[var(--t-sub)]')
        }
      >
        {on ? '✓' : ''}
      </span>
    </button>
  );
}
