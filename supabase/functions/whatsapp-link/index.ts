// GET  /whatsapp-link  -> estado actual de la conexión de WhatsApp del profesional que llama.
// POST /whatsapp-link  -> (re)inicia el vínculo: crea la instancia si hace falta y devuelve un
//                          pairing code para el número guardado en professionals.whatsapp.
// Header: Authorization: Bearer <access token del profesional>
//
// El nombre de instancia en Evolution API es professionals.id (uuid) -- convención de la
// migración 0025 (ver notify_n8n_booking_created), así que no hace falta guardar ningún mapeo
// nuevo: el professional_id ya es la clave que une la fila de Supabase con la sesión de WhatsApp.
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { connectionState, ensureInstance, requestLinkCredentials } from '../_shared/evolutionClient.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return errorResponse('falta autenticación', 401);

  const db = supabaseAdmin();
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return errorResponse('sesión inválida', 401);

  const { data: professional, error: profErr } = await db
    .from('professionals')
    .select('id, whatsapp, active')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (profErr) return errorResponse(profErr.message, 500);
  if (!professional || !professional.active) return errorResponse('profesional no encontrado', 403);

  if (req.method === 'GET') {
    const state = await connectionState(professional.id);
    return jsonResponse({ state, whatsapp: professional.whatsapp || null });
  }

  const phoneDigits = (professional.whatsapp || '').replace(/\D/g, '');
  if (!phoneDigits) return errorResponse('completá tu WhatsApp en el perfil antes de vincular', 400);

  try {
    await ensureInstance(professional.id);
    const { pairingCode, qr } = await requestLinkCredentials(professional.id, phoneDigits);
    return jsonResponse({ pairingCode, qr });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'error al vincular WhatsApp', 500);
  }
});
