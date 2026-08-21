// Medallas de fidelidad por cantidad de visitas (reservas 'completada'). Mismos umbrales que
// customer_loyalty_tier() en supabase/migrations/0014_customers_and_loyalty.sql — se duplica
// en JS para no depender de un round-trip cuando ya tenemos visits_count en el cliente.
export const LOYALTY_TIERS = {
  bronce: { label: 'Bronce', min: 1, icon: '🥉', bg: '#F3E4D3', ink: '#8A5A2B' },
  plata: { label: 'Plata', min: 5, icon: '🥈', bg: '#E7E9EE', ink: '#54606E' },
  oro: { label: 'Oro', min: 10, icon: '🥇', bg: '#FBEBC7', ink: '#96540E' },
  diamante: { label: 'Diamante', min: 20, icon: '💎', bg: '#DCEEFB', ink: '#1D5F8A' },
};

export function loyaltyTier(visitsCount) {
  if (visitsCount >= 20) return 'diamante';
  if (visitsCount >= 10) return 'oro';
  if (visitsCount >= 5) return 'plata';
  if (visitsCount >= 1) return 'bronce';
  return null;
}
