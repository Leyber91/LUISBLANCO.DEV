/* ============================================================
   dimensional_mania/share.js — states you can send and a plate you
   can keep.

   URL state: every setting plus the exact pose. A pose R in SO(n) is
   written as its C(n,2) Givens angles (linalg.givensDecompose), each
   quantised to 12 bits and packed as two base64url characters, so a
   10D pose costs 90 characters.

   The plate: an SVG drawing of the current view (shadow, trails, cut)
   with its counts, matrix, spectrum and sources, drawn from the same
   numbers as the page.
   ============================================================ */

import { givensDecompose, givensCompose, orthonormalize } from './linalg.js';
import { AXES, SOURCES, PRESETS } from './constants.js';
import { fmt, escapeHTML } from './dom.js';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VIEW = { shadow: 's', both: 'b', slice: 'c' };
const PROJ = { persp: 'p', ortho: 'o', stereo: 's' };
const PRE = { hold: 'h', single: '1', double: '2', iso: 'i', all: 'a', fibre: 'f' };
const SV = { down: 'd', schlegel: 's', base: 'b', net: 'n' };
const inv = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));

export function encodePose(R, n) {
  if (n < 2) return '';
  return givensDecompose(R, n).map((a) => {
    const q = Math.round(((a + Math.PI) / (2 * Math.PI)) * 4095) & 4095;
    return B64[q >> 6] + B64[q & 63];
  }).join('');
}

export function decodePose(str, n) {
  const m = (n * (n - 1)) / 2;
  if (!str || str.length !== 2 * m) return null;
  const ang = [];
  for (let k = 0; k < m; k++) {
    const a = B64.indexOf(str[2 * k]), b = B64.indexOf(str[2 * k + 1]);
    if (a < 0 || b < 0) return null;
    ang.push((((a << 6) | b) / 4095) * 2 * Math.PI - Math.PI);
  }
  return orthonormalize(givensCompose(ang, n), n);
}

export function encodeState(s, R) {
  const q = new URLSearchParams();
  q.set('d', s.n);
  q.set('o', s.obj);
  q.set('v', VIEW[s.view]);
  q.set('p', PROJ[s.proj]);
  q.set('m', PRE[s.preset]);
  q.set('pl', `${s.plane[0]}${s.plane[1]}`);
  q.set('h', s.h.toFixed(3));
  q.set('sw', s.sweep ? 1 : 0);
  q.set('tr', s.trails ? 1 : 0);
  q.set('D', s.D.toFixed(2));
  q.set('sp', s.speed.toFixed(2));
  if (s.n >= 2) q.set('r', encodePose(R, s.n));
  if (s.inset && SV[s.inset]) q.set('sv', SV[s.inset]);
  if (s.facet) q.set('fc', s.facet);
  return q.toString();
}

/** parse what the URL says; unknown or malformed keys are ignored */
export function decodeState(search) {
  const q = new URLSearchParams(search);
  const out = {};
  const n = parseInt(q.get('d'), 10);
  if (n >= 1 && n <= 10) out.n = n;
  if (q.get('o')) out.obj = q.get('o');
  if (inv(VIEW)[q.get('v')]) out.view = inv(VIEW)[q.get('v')];
  if (inv(PROJ)[q.get('p')]) out.proj = inv(PROJ)[q.get('p')];
  if (inv(PRE)[q.get('m')]) out.preset = inv(PRE)[q.get('m')];
  const pl = q.get('pl');
  if (pl && /^\d\d$/.test(pl)) out.plane = [+pl[0], +pl[1]];
  const h = parseFloat(q.get('h'));
  if (isFinite(h)) out.h = Math.max(-1, Math.min(1, h));
  if (q.has('sw')) out.sweep = q.get('sw') === '1';
  if (q.has('tr')) out.trails = q.get('tr') === '1';
  const D = parseFloat(q.get('D'));
  if (isFinite(D)) out.D = D;
  const sp = parseFloat(q.get('sp'));
  if (isFinite(sp)) out.speed = Math.max(0, Math.min(2, sp));
  if (q.get('r')) out.pose = q.get('r');
  if (inv(SV)[q.get('sv')]) out.inset = inv(SV)[q.get('sv')];
  if (q.has('fc')) out.facet = Math.max(0, parseInt(q.get('fc'), 10) || 0);
  if (['mech', 'explain', 'log'].includes(q.get('dr'))) out.drawer = q.get('dr');
  if (q.has('tour')) out.tour = Math.max(0, parseInt(q.get('tour'), 10) || 0);
  return out;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/* ---------------- the plate ---------------- */

const W = 1200, H = 1560;

/**
 * @param {object} d  {title, sub, segs:[{x1,y1,x2,y2,c}], trails:[...], polys:[[x,y]...], cut:[...],
 *                     fvec, euler, R, n, spectrum, slice, check, link, witness, url, date}
 */
export function plateSVG(d) {
  const all = [...d.segs, ...d.trails, ...d.cut];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of all) { x0 = Math.min(x0, s.x1, s.x2); y0 = Math.min(y0, s.y1, s.y2); x1 = Math.max(x1, s.x1, s.x2); y1 = Math.max(y1, s.y1, s.y2); }
  if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
  const box = { x: 80, y: 190, w: W - 160, h: 760 };
  const sc = Math.min(box.w / Math.max(1, x1 - x0), box.h / Math.max(1, y1 - y0)) * 0.92;
  const ox = box.x + box.w / 2 - ((x0 + x1) / 2) * sc, oy = box.y + box.h / 2 - ((y0 + y1) / 2) * sc;
  const P = (x, y) => `${(x * sc + ox).toFixed(1)} ${(y * sc + oy).toFixed(1)}`;

  // group segments by colour so the file stays small
  const groups = new Map();
  for (const s of d.segs) {
    const k = s.c;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(`M${P(s.x1, s.y1)}L${P(s.x2, s.y2)}`);
  }
  let art = '';
  for (const [c, ds] of groups) art += `<path d="${ds.join('')}" stroke="${c}" stroke-width="0.8" fill="none" stroke-linecap="round"/>`;
  const tr = d.trails.map((s) => `M${P(s.x1, s.y1)}L${P(s.x2, s.y2)}`).join('');
  if (tr) art += `<path d="${tr}" stroke="#D4A24C" stroke-opacity="0.75" stroke-width="0.9" fill="none" stroke-linecap="round"/>`;
  for (const poly of d.polys) art += `<path d="M${poly.map(([x, y]) => P(x, y)).join('L')}Z" fill="#D4A24C" fill-opacity="0.1" stroke="none"/>`;
  const cut = d.cut.map((s) => `M${P(s.x1, s.y1)}L${P(s.x2, s.y2)}`).join('');
  if (cut) art += `<path d="${cut}" stroke="#F0C674" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;

  const t = (x, y, s, cls = 'm', anchor = 'start') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${escapeHTML(s)}</text>`;
  let info = '';
  let y = 1010;
  info += t(80, y, 'COUNTS', 'h'); y += 26;
  d.fvec.forEach((f) => { info += t(80, y, `${f.rank}`, 'd') + t(300, y, fmt(f.count), 'v', 'end') + t(320, y, f.how, 'd'); y += 20; });
  if (d.euler) { y += 6; info += t(80, y, d.euler, 'd'); }

  let ym = 1010;
  info += t(480, ym, 'POSE R', 'h'); ym += 18;
  const n = d.n, cell = Math.min(34, Math.floor(300 / Math.max(1, n)));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = d.R[i * n + j], a = Math.min(1, Math.abs(v));
    const fill = v >= 0 ? `rgba(159,179,214,${(0.08 + 0.62 * a).toFixed(2)})` : `rgba(86,93,114,${(0.06 + 0.4 * a).toFixed(2)})`;
    info += `<rect x="${480 + j * cell}" y="${ym + i * cell}" width="${cell - 2}" height="${cell - 2}" fill="${fill}"/>`;
    if (n <= 6) info += `<text x="${480 + j * cell + (cell - 2) / 2}" y="${ym + i * cell + cell / 2 + 3}" class="mx" text-anchor="middle">${(v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace(/^0/, '')}</text>`;
  }
  ym += n * cell + 20;
  if (d.spectrum) { info += t(480, ym, d.spectrum, 'd'); ym += 20; }

  let yr = 1010;
  info += t(840, yr, 'CUT', 'h'); yr += 26;
  for (const line of d.slice) { info += t(840, yr, line, 'd'); yr += 20; }
  if (d.link) { info += t(840, yr, d.link, 'd'); yr += 20; }

  const yw = Math.max(y, ym, yr) + 34;
  const wrap = (s, max) => { const out = []; let cur = ''; for (const w of s.split(' ')) { if ((cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } if (cur) out.push(cur); return out; };
  let foot = t(80, yw, 'WITNESS', 'h');
  wrap(d.witness, 112).forEach((l, i) => { foot += t(80, yw + 24 + i * 19, l, 'w'); });
  let ys = yw + 24 + wrap(d.witness, 112).length * 19 + 22;
  foot += t(80, ys, 'SOURCES', 'h'); ys += 20;
  SOURCES.slice(0, 5).forEach((s) => { foot += t(80, ys, s.text.slice(0, 140), 's'); ys += 16; });
  ys += 10;
  foot += t(80, ys, d.url.slice(0, 150), 's');

  const br = (x, y, dx, dy) => `<path d="M${x} ${y + dy}L${x} ${y}L${x + dx} ${y}" stroke="#D4A24C" fill="none" stroke-width="1.2"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
text{font-family:'IBM Plex Mono',ui-monospace,Consolas,monospace}
.h{font-size:11px;letter-spacing:3px;fill:#79828F}.d{font-size:12px;fill:#C5CCD8}.v{font-size:12px;fill:#F0C674}
.m{font-size:12px;fill:#C5CCD8}.w{font-size:13px;fill:#EAF0FB}.s{font-size:10px;fill:#79828F}.mx{font-size:9px;fill:#06080D}
.t{font-size:30px;font-weight:600;fill:#EAF0FB}.k{font-size:11px;letter-spacing:4px;fill:#D4A24C}
</style>
<rect width="${W}" height="${H}" fill="#06080D"/>
<rect x="24.5" y="24.5" width="${W - 49}" height="${H - 49}" fill="none" stroke="#1C232F"/>
${br(20, 20, 22, 22)}${br(W - 20, 20, -22, 22)}${br(20, H - 20, 22, -22)}${br(W - 20, H - 20, -22, -22)}
${t(80, 76, 'THE LAB · L212 · DIMENSIONS', 'k')}
${t(80, 122, d.title, 't')}
${t(80, 152, d.sub, 'd')}
${t(W - 80, 76, d.date, 's', 'end')}
<g>${art}</g>
<line x1="80" y1="975" x2="${W - 80}" y2="975" stroke="#1C232F"/>
${info}
${foot}
</svg>`;
}

export function download(filename, text, type = 'image/svg+xml') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const presetLabel = (id) => (PRESETS[id] ? PRESETS[id].label : id);
export const axisName = (k) => AXES[k];

/* ---------------- reopening saved files ----------------
   Every export carries the state URL: the JSON in its "state" field, the
   SVG plate and the OBJ in their text, the PNG in a tEXt chunk with the
   keyword "dimensions-state" (PNG specification, ISO/IEC 15948, 2004). */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const KEY = 'dimensions-state';

/** the PNG with a tEXt chunk carrying the state URL, inserted before IEND */
export async function withPngState(blob, url) {
  const src = new Uint8Array(await blob.arrayBuffer());
  const text = new TextEncoder().encode(`${KEY}\0${url.replace(/[^\x20-\x7e]/g, '')}`);
  const type = new TextEncoder().encode('tEXt');
  const chunk = new Uint8Array(12 + text.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, text.length);
  chunk.set(type, 4); chunk.set(text, 8);
  dv.setUint32(8 + text.length, crc32(chunk.subarray(4, 8 + text.length)));
  const iend = src.length - 12; // IEND is the last 12 bytes
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, iend), 0); out.set(chunk, iend); out.set(src.subarray(iend), iend + chunk.length);
  return new Blob([out], { type: 'image/png' });
}

/** find the saved state URL in any of the lab's exports */
export async function stateFromFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x89 && bytes[1] === 0x50) { // PNG: walk the chunks
    let i = 8;
    const dv = new DataView(bytes.buffer);
    while (i + 12 <= bytes.length) {
      const len = dv.getUint32(i), type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
      if (type === 'tEXt') {
        const body = new TextDecoder('latin1').decode(bytes.subarray(i + 8, i + 8 + len));
        if (body.startsWith(KEY + '\0')) return body.slice(KEY.length + 1);
      }
      i += 12 + len;
    }
    return null;
  }
  const text = new TextDecoder().decode(bytes);
  try { const j = JSON.parse(text); if (j && typeof j.state === 'string') return j.state; } catch { /* not JSON */ }
  const m = text.match(/https?:\/\/[^\s"<>]*\?[^\s"<>]*\bd=\d+[^\s"<>]*/);
  return m ? m[0].replace(/&amp;/g, '&') : null;
}
