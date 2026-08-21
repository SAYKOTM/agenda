import { LOYALTY_TIERS, loyaltyTier } from '../../lib/loyalty';

// Medalla de fidelidad junto al nombre del cliente (agenda, ficha de cliente). Sin visitas
// registradas (tier null) no se renderiza nada -- no hay medalla "cero".
export default function LoyaltyBadge({ visitsCount, tier, size = 'sm' }) {
  const resolvedTier = tier ?? loyaltyTier(visitsCount ?? 0);
  if (!resolvedTier) return null;
  const meta = LOYALTY_TIERS[resolvedTier];
  if (!meta) return null;

  const sizeCls = size === 'md' ? 'gap-1 px-2 py-0.5 text-[11.5px]' : 'gap-0.5 px-1.5 py-0.5 text-[10px]';

  return (
    <span
      className={'inline-flex flex-none items-center rounded-full font-bold ' + sizeCls}
      style={{ background: meta.bg, color: meta.ink }}
      title={`${meta.label} · ${visitsCount ?? ''} visitas`.trim()}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {size === 'md' && meta.label}
    </span>
  );
}
