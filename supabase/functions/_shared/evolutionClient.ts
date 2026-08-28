// Cliente minimo para Evolution API (WhatsApp). Mismo patron que stripeClient.ts: el secreto
// (apikey de Evolution) vive solo en el entorno de la Edge Function, nunca en el navegador.
const baseUrl = () => (Deno.env.get('EVOLUTION_BASE_URL') || '').replace(/\/$/, '');
const apiKey = () => Deno.env.get('EVOLUTION_API_KEY') || '';

async function evoFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { apikey: apiKey(), 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// El nombre de la instancia en Evolution ES professionals.id (uuid), convencion fijada en 0025.
export async function connectionState(instanceName: string): Promise<string> {
  const { ok, data } = await evoFetch(`/instance/connectionState/${instanceName}`);
  if (!ok) return 'not_created';
  return data?.instance?.state || 'not_created';
}

export async function ensureInstance(instanceName: string): Promise<void> {
  const { ok, data } = await evoFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
  });
  // Evolution responde 403 "already in use" si la instancia ya existe -- no es un error real acá.
  if (!ok && !/already in use/i.test(JSON.stringify(data))) {
    throw new Error(data?.response?.message?.join?.(', ') || data?.message || 'no pudimos crear la instancia de WhatsApp');
  }
}

export type LinkCredentials = { pairingCode: string | null; qr: string | null };

// Devuelve las dos formas de vincular en un solo pedido: el código de texto (falla en algunos
// iPhone con WhatsApp normal, visto en pruebas reales) y el QR como fallback que sí funciona.
export async function requestLinkCredentials(instanceName: string, phoneDigits: string): Promise<LinkCredentials> {
  // logout primero: si ya habia una sesion/QR pendiente, Evolution reusa ese estado en vez de
  // emitir credenciales nuevas atadas al numero pedido. Evolution tarda un instante en procesar
  // el logout, asi que el primer connect justo despues puede no traer nada todavia -- se
  // reintenta una vez con un margen corto en vez de fallarle al profesional por una carrera.
  await evoFetch(`/instance/logout/${instanceName}`, { method: 'DELETE' });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
    const { ok, data } = await evoFetch(`/instance/connect/${instanceName}?number=${phoneDigits}`);
    if (ok && (data?.pairingCode || data?.base64)) {
      return { pairingCode: data.pairingCode || null, qr: data.base64 || null };
    }
  }
  throw new Error('Evolution no devolvió credenciales de vinculación, probá de nuevo en unos segundos');
}
