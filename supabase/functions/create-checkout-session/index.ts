// POST /create-checkout-session { successUrl?, cancelUrl? }
// Header: Authorization: Bearer <access token del profesional que llama>
//
// Como invite-professional: requiere JWT de un profesional autenticado (verify_jwt=true en
// config.toml) y además valida acá adentro que sea 'admin' de un tenant activo -- solo el
// administrador del salón gestiona la suscripción de la plataforma, no cualquier profesional.
//
// El tenant_id NUNCA se toma del body: siempre se deriva del propio JWT (caller.tenant_id), igual
// que invite-professional usa caller.tenant_id en vez de confiar en un tenantId que mande el
// cliente -- así nadie puede armar un checkout para un tenant ajeno.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { stripeClient } from '../_shared/stripeClient.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return errorResponse('falta autenticación', 401);

  let body: any;
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
  const successUrl = body.successUrl || `${appUrl}/panel/ajustes?checkout=success`;
  const cancelUrl = body.cancelUrl || `${appUrl}/panel/ajustes?checkout=cancel`;

  const db = supabaseAdmin();

  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return errorResponse('sesión inválida', 401);

  const { data: caller, error: callerErr } = await db
    .from('professionals')
    .select('id, tenant_id, role, active')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (callerErr) return errorResponse(callerErr.message, 500);
  if (!caller || !caller.active || caller.role !== 'admin') {
    return errorResponse('solo un administrador puede gestionar la suscripción', 403);
  }

  const { data: tenant, error: tenantErr } = await db
    .from('tenants')
    .select('id, name, stripe_customer_id, subscription_status, trial_ends_at')
    .eq('id', caller.tenant_id)
    .single();
  if (tenantErr) return errorResponse(tenantErr.message, 500);

  if (tenant.subscription_status === 'active') {
    return errorResponse('este tenant ya tiene una suscripción activa', 409);
  }

  const priceId = Deno.env.get('STRIPE_PRICE_ID')!;
  const stripe = stripeClient();

  // Reusa el Customer si ya existe (p. ej. el pago anterior falló y están reintentando el
  // checkout); si no, lo crea y lo guarda antes de armar la sesión.
  let stripeCustomerId = tenant.stripe_customer_id;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: tenant.name,
      metadata: { tenant_id: tenant.id },
    });
    stripeCustomerId = customer.id;
    const { error: updErr } = await db.from('tenants').update({ stripe_customer_id: stripeCustomerId }).eq('id', tenant.id);
    if (updErr) return errorResponse(updErr.message, 500);
  }

  // El trial local (columna trial_ends_at, arrancado al crear el tenant -- ver migración
  // 0022_stripe_subscriptions.sql) puede llevar varios días corriendo antes de que el tenant
  // llegue a esta pantalla. En vez de darle otros 7 días completos desde cero (duplicando el
  // trial), le pasamos a Stripe SOLO los días que le quedan, para que el trial de Stripe sea la
  // continuación exacta del trial local, no uno nuevo encima.
  const remainingMs = new Date(tenant.trial_ends_at).getTime() - Date.now();
  const remainingTrialDays = Math.max(0, Math.ceil(remainingMs / 86_400_000));

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    client_reference_id: tenant.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      metadata: { tenant_id: tenant.id },
      ...(remainingTrialDays > 0 ? { trial_period_days: remainingTrialDays } : {}),
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return jsonResponse({ url: session.url });
});
