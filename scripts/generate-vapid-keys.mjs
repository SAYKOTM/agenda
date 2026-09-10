// Genera el par de claves VAPID que identifica a este servidor ante los servicios de push
// (Google, Mozilla, Apple). Se corre UNA vez por proyecto:
//
//   node scripts/generate-vapid-keys.mjs
//
// La pública va al front (VITE_VAPID_PUBLIC_KEY) y la privada SOLO al entorno de Supabase
// (VAPID_PRIVATE_KEY). Si la privada cambia, todas las suscripciones existentes dejan de recibir
// avisos y cada profesional tiene que volver a activarlos, así que guardala bien la primera vez.
//
// No usa `npx web-push` a propósito: es exactamente lo mismo con WebCrypto, que ya viene en Node,
// y así el par se genera sin bajar un paquete que después nadie va a usar.
import { webcrypto as crypto } from 'node:crypto';

function toB64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);

// La clave pública viaja como punto sin comprimir: 0x04 || X (32 bytes) || Y (32 bytes).
const publicKey = toB64url(Buffer.concat([Buffer.from([0x04]), fromB64url(jwk.x), fromB64url(jwk.y)]));

console.log('\n--- .env.local del front (y variables de entorno en Vercel) ---');
console.log(`VITE_VAPID_PUBLIC_KEY=${publicKey}`);
console.log('\n--- secretos de las Edge Functions (supabase secrets set ...) ---');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log('VAPID_SUBJECT=mailto:tu-correo@tu-dominio.cl');
console.log('\nLa privada no se muestra en ningún otro lado: copiala ahora.\n');
