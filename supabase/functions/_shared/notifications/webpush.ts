// Web Push (RFC 8291 + RFC 8292/VAPID) implementado con WebCrypto.
//
// Por qué a mano y no con `npm:web-push`: esa librería está escrita contra el crypto y el http de
// Node, y acá corremos en el runtime de Deno de las Edge Functions. Todo lo que hace falta son
// tres primitivas que WebCrypto ya trae (ECDH P-256, HKDF-SHA256 y AES-128-GCM) más un JWT
// firmado con ES256, así que sale en menos de doscientas líneas y sin sumar una dependencia al
// camino crítico de las notificaciones.
//
// El flujo, resumido: se deriva un secreto compartido entre nuestra clave efímera y la clave
// pública del navegador (p256dh), de ahí salen la clave y el nonce con los que se cifra el JSON
// del aviso, y el paquete se manda al endpoint del servicio de push (FCM, Mozilla, WNS...) con
// una cabecera Authorization firmada con la clave privada VAPID que identifica a este servidor.

export interface StoredSubscription {
  endpoint: string;
  p256dh: string; // base64url, 65 bytes (punto sin comprimir)
  auth: string; // base64url, 16 bytes
}

export interface VapidKeys {
  publicKey: string; // base64url, 65 bytes
  privateKey: string; // base64url, 32 bytes
  subject: string; // "mailto:..." o la URL del sitio
}

export type PushOutcome =
  | { ok: true }
  | { ok: false; gone: boolean; error: string }; // gone = el navegador ya no existe (404/410): hay que borrar la suscripción

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

export function b64urlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

// ---------------------------------------------------------------------------
// VAPID: JWT ES256 que le prueba al servicio de push quién manda el aviso
// ---------------------------------------------------------------------------

async function importVapidPrivateKey(vapid: VapidKeys): Promise<CryptoKey> {
  const pub = b64urlToBytes(vapid.publicKey); // 0x04 || X (32) || Y (32)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: vapid.privateKey,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function vapidAuthorization(endpoint: string, vapid: VapidKeys): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(
    utf8(
      JSON.stringify({
        aud,
        // 12 horas: el máximo que aceptan la mayoría de los servicios es 24 h, y esto se firma
        // en cada envío, así que no hay razón para acercarse al límite.
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      })
    )
  );
  const key = await importVapidPrivateKey(vapid);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${payload}`));
  const jwt = `${header}.${payload}.${bytesToB64url(new Uint8Array(signature))}`;
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

// ---------------------------------------------------------------------------
// Cifrado del contenido (aes128gcm, RFC 8291)
// ---------------------------------------------------------------------------

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

async function encryptPayload(subscription: StoredSubscription, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(subscription.p256dh);
  const authSecret = b64urlToBytes(subscription.auth);

  // Par efímero: uno nuevo por mensaje, es lo que hace que dos avisos idénticos no viajen igual.
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, ephemeral.privateKey, 256));

  // Primer HKDF: mezcla el secreto ECDH con el 'auth' de la suscripción (que el servidor de push
  // no conoce) para que solo ese navegador pueda descifrar.
  const keyInfo = concat(utf8('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 = delimitador de "último registro" que exige aes128gcm (no lleva relleno extra: los
  // avisos son de unos pocos cientos de bytes y el tamaño no revela nada útil acá).
  const padded = concat(plaintext, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // Cabecera del cuerpo: salt(16) | tamaño de registro(4) | largo de la clave(1) | clave pública(65)
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

export async function sendWebPush(
  subscription: StoredSubscription,
  data: unknown,
  vapid: VapidKeys,
  ttlSeconds = 60 * 60 * 12
): Promise<PushOutcome> {
  try {
    const body = await encryptPayload(subscription, utf8(JSON.stringify(data)));
    const authorization = await vapidAuthorization(subscription.endpoint, vapid);

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSeconds),
        Urgency: 'high', // una cita que cambia no sirve de nada entregada dos horas después
      },
      body,
    });

    if (response.ok) return { ok: true };

    // 404/410: el navegador desinstaló la app, borró los datos del sitio o la suscripción caducó.
    // No es un error a reintentar, es una fila que hay que borrar.
    const gone = response.status === 404 || response.status === 410;
    const text = await response.text().catch(() => '');
    return { ok: false, gone, error: `${response.status} ${text.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, gone: false, error: e instanceof Error ? e.message : String(e) };
  }
}
