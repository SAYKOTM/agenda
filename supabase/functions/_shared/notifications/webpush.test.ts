// Verifica el cifrado de Web Push contra la especificación, haciendo de navegador: se genera un
// par de claves como el que crearía Chrome al suscribirse, se manda un aviso y se descifra el
// paquete resultante con la clave privada de ese "navegador". Si el HKDF, el nonce o el orden de
// la cabecera estuvieran mal, el descifrado falla -- que es exactamente lo que pasaría en un
// teléfono real, pero ahí el síntoma sería un aviso que nunca llega y ningún error visible.
import { describe, expect, it, vi } from 'vitest';
import { sendWebPush, b64urlToBytes, type StoredSubscription, type VapidKeys } from './webpush.ts';

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Par de claves del navegador que se suscribe.
async function fakeBrowserSubscription() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const subscription: StoredSubscription = {
    endpoint: 'https://push.example.com/enviar/abc123',
    p256dh: toB64url(raw),
    auth: toB64url(auth),
  };
  return { subscription, privateKey: keys.privateKey };
}

async function fakeVapidKeys(): Promise<VapidKeys> {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
  const pub = new Uint8Array([0x04, ...b64urlToBytes(jwk.x!), ...b64urlToBytes(jwk.y!)]);
  return { publicKey: toB64url(pub), privateKey: jwk.d!, subject: 'mailto:hola@agenda.cl' };
}

// El navegador, al recibir el paquete: deshace exactamente lo que hizo encryptPayload.
async function decryptAsBrowser(body: Uint8Array, subscription: StoredSubscription, browserPrivateKey: CryptoKey) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);

  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, browserPrivateKey, 256));

  const enc = new TextEncoder();
  const uaPublic = b64urlToBytes(subscription.p256dh);
  const keyInfo = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic]);

  const hkdf = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) => {
    const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, key, len * 8));
  };

  const ikm = await hkdf(b64urlToBytes(subscription.auth), shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, ciphertext));
  // El último byte es el delimitador 0x02 de aes128gcm.
  return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
}

describe('sendWebPush', () => {
  it('cifra el aviso de forma que solo el navegador suscrito puede leerlo', async () => {
    const { subscription, privateKey } = await fakeBrowserSubscription();
    const vapid = await fakeVapidKeys();
    const aviso = { title: 'Nueva cita — hoy 15:30', body: 'María González · Corte + barba', bookingId: 'b-1' };

    let captured: { url: string; init: RequestInit } | null = null;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendWebPush(subscription, aviso, vapid);
    expect(result).toEqual({ ok: true });
    expect(captured!.url).toBe(subscription.endpoint);

    const headers = captured!.init.headers as Record<string, string>;
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);

    const descifrado = await decryptAsBrowser(new Uint8Array(captured!.init.body as ArrayBuffer), subscription, privateKey);
    expect(descifrado).toEqual(aviso);

    vi.unstubAllGlobals();
  });

  it('firma el JWT de VAPID con la clave privada del servidor', async () => {
    const { subscription } = await fakeBrowserSubscription();
    const vapid = await fakeVapidKeys();

    let authorization = '';
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      authorization = (init.headers as Record<string, string>).Authorization;
      return new Response(null, { status: 201 });
    });
    await sendWebPush(subscription, { title: 'x' }, vapid);
    vi.unstubAllGlobals();

    const jwt = authorization.slice('vapid t='.length, authorization.indexOf(', k='));
    const [header, payload, signature] = jwt.split('.');
    const pub = b64urlToBytes(vapid.publicKey);
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: toB64url(pub.slice(1, 33)), y: toB64url(pub.slice(33, 65)) },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const valido = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      b64urlToBytes(signature),
      new TextEncoder().encode(`${header}.${payload}`)
    );
    expect(valido).toBe(true);

    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    expect(claims.aud).toBe('https://push.example.com'); // el origen del endpoint, no la ruta completa
    expect(claims.sub).toBe('mailto:hola@agenda.cl');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('marca como "gone" las suscripciones que el servicio de push ya no reconoce', async () => {
    const { subscription } = await fakeBrowserSubscription();
    const vapid = await fakeVapidKeys();
    vi.stubGlobal('fetch', async () => new Response('unsubscribed', { status: 410 }));

    const result = await sendWebPush(subscription, { title: 'x' }, vapid);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ gone: true });

    vi.unstubAllGlobals();
  });
});
