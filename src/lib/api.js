import { anonKey, functionsUrl, supabase } from './supabaseClient';

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function call(path, { method = 'GET', body, params, authToken } = {}) {
  const url = new URL(`${functionsUrl}/${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null) url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${authToken || anonKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Ocurrió un error inesperado', res.status, data.fields);
  return data;
}

// Funciones públicas (sin login) usan la anon key. Las del panel necesitan el token de sesión
// del profesional para que la Edge Function pueda verificar quién llama (ver invite-professional).
async function callAuthed(path, options) {
  const { data } = await supabase.auth.getSession();
  return call(path, { ...options, authToken: data.session?.access_token });
}

export function fetchAvailableSlots({ tenantSlug, serviceIds, date, professionalId, excludeBookingId }) {
  return call('available-slots', {
    params: { tenantSlug, date, serviceIds: serviceIds.join(','), professionalId, excludeBookingId },
  });
}

// Horario semanal + excepciones del mes, de los profesionales capaces de los servicios pedidos.
// Usado por SlotPicker para deshabilitar visualmente los días no laborales del calendario, sin
// pedir cupo por cupo (ver supabase/functions/schedule-days).
export function fetchScheduleDays({ tenantSlug, professionalId, serviceIds, month }) {
  return call('schedule-days', {
    params: { tenantSlug, professionalId, serviceIds: serviceIds.join(','), month },
  });
}

export function createBooking(payload) {
  return call('create-booking', { method: 'POST', body: payload });
}

export function signupTenant(payload) {
  return call('signup-tenant', { method: 'POST', body: payload });
}

export function fetchBookingByToken(token) {
  return call('booking-by-token', { params: { token } });
}

export function cancelBooking(token) {
  return call('cancel-booking', { method: 'POST', body: { token } });
}

export function rescheduleBooking(token, date, startMinute) {
  return call('reschedule-booking', { method: 'POST', body: { token, date, startMinute } });
}

export function submitReview(token, rating, comment) {
  return call('submit-review', { method: 'POST', body: { token, rating, comment } });
}

export function inviteProfessional(payload) {
  return callAuthed('invite-professional', { method: 'POST', body: payload });
}

export function removeProfessional(payload) {
  return callAuthed('remove-professional', { method: 'POST', body: payload });
}

export function createCheckoutSession(payload = {}) {
  return callAuthed('create-checkout-session', { method: 'POST', body: payload });
}

export function fetchWhatsappLinkStatus() {
  return callAuthed('whatsapp-link');
}

export function startWhatsappLink() {
  return callAuthed('whatsapp-link', { method: 'POST' });
}

export function geocodeAddress() {
  return callAuthed('geocode-address', { method: 'POST' });
}

export function joinWaitlist(payload) {
  return call('join-waitlist', { method: 'POST', body: payload });
}

export function submitPrivacyRequest(payload) {
  return call('submit-privacy-request', { method: 'POST', body: payload });
}
