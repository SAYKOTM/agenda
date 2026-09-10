// Genera los iconos PNG de las dos PWA (cliente y panel) a partir del mismo rayo del favicon.
//
// Se dibujan por código en vez de exportarlos de un editor por dos motivos: el proyecto no tiene
// ninguna dependencia de imágenes (ni sharp ni canvas) y no vale la pena sumarla solo para esto,
// y así el día que cambie la paleta de marca basta con correr `node scripts/generate-icons.mjs`
// y quedan los ocho archivos coherentes entre sí.
//
// El PNG se escribe a mano (IHDR + IDAT deflateado + IEND, filtro 0 por fila): es el formato
// mínimo que entienden iOS y Android, y zlib ya viene en Node.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// ---------- PNG ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// rgba: Uint8Array de size*size*4
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // color type 6 = RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filtro "None": el peso extra no importa para iconos de este tamaño
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- dibujo ----------

// El rayo del favicon (public/favicon.svg) reducido a un polígono: las curvas del SVG son solo
// esquinas redondeadas de 1-2 px que a 192 px no se distinguen. Coordenadas en su viewBox 48x46.
const BOLT = [
  [23.9, 44.9], [23.9, 31.7], [9.7, 31.7], [16.9, 19.4], [15.1, 15.9],
  [0.8, 15.9], [10.5, 0], [39.8, 0], [33.2, 12.3], [35.0, 15.9], [46.9, 15.9],
];
const BOLT_W = 48;
const BOLT_H = 46;

function insidePolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function hex(color) {
  return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
}

// radius = 0 → cuadrado a sangre (maskable y apple-touch-icon, que iOS recorta por su cuenta).
function insideRoundedRect(size, radius, x, y) {
  const r = radius;
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  if (r === 0) return true;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * @param size     lado en px
 * @param bg       color de fondo "#rrggbb"
 * @param fg       color del rayo "#rrggbb"
 * @param glyph    fracción del lado que ocupa el alto del rayo (0.55 deja el 20% de margen de
 *                 seguridad que exige el recorte maskable de Android)
 * @param radius   radio de la esquina en px (0 = cuadrado lleno)
 * @param opaque   si false, fuera del rectángulo redondeado queda transparente
 */
function drawIcon({ size, bg, fg, glyph, radius, opaque }) {
  const [br, bgc, bb] = hex(bg);
  const [fr, fgc, fb] = hex(fg);
  const out = Buffer.alloc(size * size * 4);

  const glyphH = size * glyph;
  const glyphW = (glyphH * BOLT_W) / BOLT_H;
  const offX = (size - glyphW) / 2;
  const offY = (size - glyphH) / 2;
  const SS = 4; // supersampling: sin esto los diagonales del rayo quedan dentados

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHits = 0;
      let fgHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!insideRoundedRect(size, radius, px, py)) continue;
          bgHits++;
          const gx = ((px - offX) / glyphW) * BOLT_W;
          const gy = ((py - offY) / glyphH) * BOLT_H;
          if (gx >= 0 && gx <= BOLT_W && gy >= 0 && gy <= BOLT_H && insidePolygon(BOLT, gx, gy)) fgHits++;
        }
      }
      const total = SS * SS;
      const coverage = bgHits / total;
      const glyphCov = fgHits / total;
      const i = (y * size + x) * 4;
      // mezcla rayo sobre fondo, y el conjunto sobre transparente (o sobre el propio fondo si
      // opaque: iOS pinta de negro cualquier píxel transparente del apple-touch-icon)
      const mix = (b, f) => Math.round(b * (1 - glyphCov / Math.max(coverage, 1e-6)) + f * (glyphCov / Math.max(coverage, 1e-6)));
      out[i] = coverage ? mix(br, fr) : br;
      out[i + 1] = coverage ? mix(bgc, fgc) : bgc;
      out[i + 2] = coverage ? mix(bb, fb) : bb;
      out[i + 3] = opaque ? 255 : Math.round(coverage * 255);
    }
  }
  return encodePng(out, size);
}

// ---------- salida ----------

const CLIENT = { bg: '#863BFF', fg: '#FFFFFF' }; // app pública: morado de marca, rayo blanco
const PANEL = { bg: '#0F172A', fg: '#A78BFA' }; // app del trabajador: azul noche del panel

const FILES = [
  ['icon-192.png', { size: 192, ...CLIENT, glyph: 0.62, radius: 42, opaque: false }],
  ['icon-512.png', { size: 512, ...CLIENT, glyph: 0.62, radius: 112, opaque: false }],
  ['icon-maskable-512.png', { size: 512, ...CLIENT, glyph: 0.5, radius: 0, opaque: true }],
  ['apple-touch-icon.png', { size: 180, ...CLIENT, glyph: 0.6, radius: 0, opaque: true }],
  ['panel-icon-192.png', { size: 192, ...PANEL, glyph: 0.62, radius: 42, opaque: false }],
  ['panel-icon-512.png', { size: 512, ...PANEL, glyph: 0.62, radius: 112, opaque: false }],
  ['panel-icon-maskable-512.png', { size: 512, ...PANEL, glyph: 0.5, radius: 0, opaque: true }],
  ['panel-apple-touch-icon.png', { size: 180, ...PANEL, glyph: 0.6, radius: 0, opaque: true }],
];

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, opts] of FILES) {
  const png = drawIcon(opts);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name} — ${opts.size}x${opts.size} — ${(png.length / 1024).toFixed(1)} kB`);
}
