// Misma regla que tenant_has_active_access() en
// supabase/migrations/0022_stripe_subscriptions.sql -- esa función SQL es la que de verdad se
// aplica (Edge Functions + el trigger de esa migración); esta copia en JS es solo para decidir
// qué mostrar en el panel sin depender de un round-trip extra a la base.
export function hasActiveAccess(tenant) {
  if (!tenant) return false;
  if (tenant.subscription_status === 'active' || tenant.subscription_status === 'past_due') return true;
  if (tenant.subscription_status === 'trialing') return new Date(tenant.trial_ends_at) > new Date();
  return false;
}
