// Cliente de Stripe para Edge Functions (Deno): mismo patrón que supabaseAdmin.ts -- una fábrica
// que lee el secreto desde el entorno de la función, nunca hardcodeado ni expuesto al frontend.
// Deno no tiene el cliente HTTP de Node que usa el SDK por defecto, así que hay que pasarle
// explícitamente el httpClient basado en fetch.
import Stripe from 'npm:stripe@17';

export function stripeClient() {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  return new Stripe(secretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });
}
