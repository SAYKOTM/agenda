// POST /stripe-webhook -- lo llama Stripe directamente (server-to-server), nunca el frontend.
// verify_jwt=false en config.toml: Stripe no manda un JWT de Supabase, así que la única
// verificación de identidad válida acá es la firma HMAC de Stripe (header stripe-signature),
// no el auth de Supabase. Por eso también se necesita el body CRUDO (req.text(), no req.json())
// -- la firma se calcula sobre los bytes exactos que mandó Stripe.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { stripeClient } from '../_shared/stripeClient.ts';

const KNOWN_STATUSES = new Set(['trialing', 'active', 'past_due', 'canceled', 'unpaid']);

// Stripe tiene más estados que los 5 que modela este proyecto (incomplete, incomplete_expired,
// paused). Los tratamos como 'unpaid' -- bloquean acceso -- en vez de dejarlos colar sin más.
function mapStripeStatus(stripeStatus: string): 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' {
  return KNOWN_STATUSES.has(stripeStatus) ? (stripeStatus as any) : 'unpaid';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const signature = req.headers.get('stripe-signature');
  if (!signature) return errorResponse('falta stripe-signature', 400);

  const rawBody = await req.text();
  const stripe = stripeClient();
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

  let event;
  try {
    // constructEventAsync (no constructEvent): el cálculo sync de firma del SDK usa Node crypto,
    // que no existe en Deno -- la variante async usa SubtleCrypto y sí funciona acá.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    return errorResponse(`firma inválida: ${(err as Error).message}`, 400);
  }

  const db = supabaseAdmin();

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as any;
      // Desde la API version 2025-03-31, Stripe movió current_period_end del objeto Subscription
      // al primer SubscriptionItem -- soportamos ambos shapes según qué versión mande el webhook.
      const currentPeriodEndUnix = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
      const patch: Record<string, unknown> = {
        stripe_subscription_id: sub.id,
        subscription_status: mapStripeStatus(sub.status),
      };
      if (currentPeriodEndUnix) patch.current_period_end = new Date(currentPeriodEndUnix * 1000).toISOString();
      // Mientras la suscripción está en trial, Stripe manda trial_end -- lo reflejamos en
      // trial_ends_at para que la regla de acceso (tenant_has_active_access) siga viendo la
      // fecha real, incluso si Stripe la ajustó (p. ej. al calcular remainingTrialDays con
      // redondeo hacia arriba en create-checkout-session).
      if (sub.trial_end) patch.trial_ends_at = new Date(sub.trial_end * 1000).toISOString();

      const { error } = await db.from('tenants').update(patch).eq('stripe_customer_id', sub.customer as string);
      if (error) return errorResponse(error.message, 500);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as any;
      const { error } = await db.from('tenants').update({ subscription_status: 'canceled' }).eq('stripe_customer_id', sub.customer as string);
      if (error) return errorResponse(error.message, 500);
      break;
    }
    default:
      break; // otros eventos quedan fuera de alcance a propósito -- se ignoran, no es un error.
  }

  return jsonResponse({ received: true });
});
