// The Black Hole instrument (labs/bh_animation_page.html), driven as a visitor meets it.
// Run with tools/drive.mjs:
//   node tools/drive.mjs tools/drives/blackhole.mjs --base http://127.0.0.1:<port> --out <dir> --width 1440 --height 900 --timeout 600
//   (and again with --width 390 --height 844)
//
// Version 1 (road ticket 1.08, its load step; the probe of level 1): the page loads, the renderer comes up on
// WebGL2, the first full trace finishes, and the frame it leaves is a picture.
//
// Version 2 (2026-11-16, after review_s2.md): each finding the page shows becomes a check here, by its own steps.
// - The render is read from the screenshot after every step (fix_s2_brief C4), because the shared rules read CSS:
//   no pixel of the gold tokens outside the elements allowed (P3-1), and every text of the top bar at 4.5 to 1
//   against the pixels its words sit on (P4-1), in every colour mode.
// - Every overlay label stays inside the window (P4-3), an invariant.
// - The curve is named by the colour its token draws it in (P2-1), the tour is walked stop by stop against the
//   engine (P2-2, P2-3, P2-8, P6-3), the Instrument card's Hawking temperature is read against derive() (P5-1),
//   the Sources panel's tags are read against the pixels (P4-4), and the model route's panel opens at 390 (P4-2).
// The expectations come from the lab's modules in the page (physics.js, kerr.js; palette.js where it exists).
//
// Version 3 (2026-11-17, after review_s2_p1_second.md): on load every writer of the shadow (the Instrument card, the
// Measure card, the plate, the guide's context) names the inclination the shadow was measured at, apart from the
// camera's (S1), and the plate's lines fit its frame, measured in the page's own font; the Measure card prints the
// scale as a number with its source and the angle at one precision (S6, K6), and Sgr A*'s card shows no ring (S3);
// a link giving Sgr A* a mass or a charge of its own opens a custom hole (S10), and a charged, spinning hole is
// labelled alike on the card and the plate (S7); the tour's shadow and telescope stops quote the measurement (S1, S6);
// on a wide screen no label on the render runs under a panel (K6).
//
// The frame rule. The test browser draws WebGL on the processor, and a capture of a WebGL page has come back
// black, or with fully transparent pixels where the compositor left a hole (pull request 46). So every shot is
// read here: no pixel with alpha 0 anywhere, and inside the canvas at least LIT_SHARE of the pixels brighter
// than LIT_LUMA. A black hole picture is mostly dark (the shadow, the sky), so the bound is low on purpose: the
// default view's disk lights far more than 1% of the canvas, a black or near-black frame lights none.
// When pull request 47 (p.frames(), the shared rule) merges, the transparent half moves to it.
//
// No model is called and nothing leaves the page's own origin: every such request is refused before any page
// script runs (p.before).

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { standard } from './invariants.mjs';

const LIT_LUMA = 40;        // of 255: brighter than the sky's faintest stars drawn at this size
const LIT_SHARE = 0.01;     // of the canvas's pixels
const PLATE_MS = 120000;   // the 1920 plate took 25.5 s under software GL on 2026-11-17 (M87*, 2 x 2 samples)
const READY_MS = 60000;     // the first full trace under software GL took 2.8 s at tier min on 2026-11-16 (both widths)

/* A screenshot as pixels: 8-bit RGB or RGBA, not interlaced, which is what Chrome writes. */
function pixels(file) {
  const b = readFileSync(file);
  let o = 8, w = 0, h = 0, kind = 0;
  const parts = [];
  while (o < b.length) {
    const n = b.readUInt32BE(o), type = b.toString('latin1', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + n);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); kind = d[9]; if (d[8] !== 8 || d[12] !== 0 || (kind !== 2 && kind !== 6)) throw new Error('a screenshot this reader does not take'); }
    else if (type === 'IDAT') parts.push(d);
    o += 12 + n;
  }
  const bpp = kind === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(parts)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], at = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, u = y ? px[(y - 1) * stride + x] : 0, c = y && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0;
      let v = raw[at + x];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

/* The frame rule over one shot: transparent pixels in the whole frame; lit share and brightest luma inside rect. */
export function readFrame(file, rect, dpr = 1, img = pixels(file)) {
  const { w, h, bpp, px } = img;
  let clear = 0;
  if (bpp === 4) for (let i = 3; i < px.length; i += 4) if (px[i] === 0) clear++;
  const x0 = Math.max(0, Math.floor(rect.left * dpr)), y0 = Math.max(0, Math.floor(rect.top * dpr));
  const x1 = Math.min(w, Math.ceil(rect.right * dpr)), y1 = Math.min(h, Math.ceil(rect.bottom * dpr));
  let lit = 0, n = 0, top = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * bpp, l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    n++; if (l > LIT_LUMA) lit++; if (l > top) top = l;
  }
  return { clear, lit: n ? lit / n : 0, top, n };
}

/* ---- the pixel rules (fix_s2_brief C4), read from a shot in Node ---- */

// the gold tokens and the shared rule's tolerance (invariants.mjs, its canvas scan): each channel within 22
const GOLD = [[212, 162, 76], [240, 198, 116], [151, 104, 31]];   // --accretion, -soft, -dim (tokens.css)
const goldPixel = (r, g, b) => GOLD.some((t) => Math.abs(r - t[0]) <= 22 && Math.abs(g - t[1]) <= 22 && Math.abs(b - t[2]) <= 22);
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const inside = (x, y, r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];

/* Gold in a frame. Where the render shows the lab's own palette (the integrator, whose drift is --danger since
   2026-11-16; photon order on the thick disk) the whole frame is read; where it shows a physical colour map (thermal, true colour, redshift, the thin
   emitter's intensity map), which keeps its look by decision (fix_s2_brief C4), only the UI's panels are read,
   where the render shows through at 5% and cannot be gold. The elements allowed gold are left out, the tour's
   ring as its annulus. */
export function goldIn(img, b) {
  const { w, h, bpp, px } = img;
  const own = (b.color === 'order' && b.emit === 'thick') || b.color === 'steps';
  const regions = own ? [[0, 0, w, h]] : b.panels;
  const skip = (x, y) => b.allowed.some((a) => inside(x, y, a)) || b.rings.some(([cx, cy, rr]) => Math.abs(Math.hypot(x - cx, y - cy) - rr) <= 3);
  let n = 0, at = null;
  const seen = new Uint8Array(w * h);   // panels overlap: each pixel is read once
  for (const r of regions) {
    for (let y = Math.max(0, Math.floor(r[1])); y < Math.min(h, Math.ceil(r[3])); y++) for (let x = Math.max(0, Math.floor(r[0])); x < Math.min(w, Math.ceil(r[2])); x++) {
      const k = y * w + x;
      if (seen[k]) continue;
      seen[k] = 1;
      if (skip(x, y)) continue;
      const i = k * bpp;
      if (goldPixel(px[i], px[i + 1], px[i + 2])) { n++; if (!at) at = [x, y, px[i], px[i + 1], px[i + 2]]; }
    }
  }
  return { own, n, at };
}

/* A text's contrast against the pixels its words sit on: the 95th percentile of the plate's pixels outside the
   words (and outside any element of the plate drawn with a background of its own), as review_s2 measured it. */
export function contrastIn(img, t) {
  const { w, h, bpp, px } = img;
  const fg = t.color, Lf = lum(fg[0], fg[1], fg[2]);
  const pad = (r, p) => [r[0] - p, r[1] - p, r[2] + p, r[3] + p];
  const words = t.words.map((r) => pad(r, 1)), skip = t.skip.map((r) => pad(r, 1));
  const ls = [];
  const P = t.plate;
  for (let y = Math.max(0, Math.floor(P[1])); y < Math.min(h, Math.ceil(P[3])); y++) for (let x = Math.max(0, Math.floor(P[0])); x < Math.min(w, Math.ceil(P[2])); x++) {
    if (words.some((r) => inside(x, y, r)) || skip.some((r) => inside(x, y, r))) continue;
    const i = (y * w + x) * bpp;
    ls.push(lum(px[i], px[i + 1], px[i + 2]));
  }
  if (!ls.length) return { ratio: null, n: 0 };
  ls.sort((a, b) => a - b);
  const Lb = ls[Math.min(ls.length - 1, Math.floor(ls.length * 0.95))];
  return { ratio: (Math.max(Lf, Lb) + 0.05) / (Math.min(Lf, Lb) + 0.05), n: ls.length };
}

/* ---- run inside the page ---- */

function guard() {
  const real = window.fetch.bind(window);
  window.fetch = (u, o = {}) => (new URL(typeof u === 'string' ? u : u.url, location.href).origin === location.origin ? real(u, o) : Promise.reject(new TypeError('refused by the drive')));
  return true;
}

/* Gold means "this happened" in four places (BAR_L1 section 2), named here as elements, never as kinds:
   the chosen control, the tour's current stop and the ring around what it points at, the live markers of the
   charts, the plate's corner brackets. */
export const GOLD_ALLOW = ['.bp', '.bh-btn[aria-pressed="true"]', '.bh-caption .cap-nav .dots i.on', '.bh-svg .now', '.bh-svg .nowf', 'circle.tour-focus'];
/* A failure (the integrator's drift, a sigma two or more from the EHT, a number a model got wrong) is drawn in
   --danger with its words beside it. It was --warn until 2026-11-16, which sits within the gold rule's tolerance of
   --accretion (19, 22, 16) and so read as "this happened"; no element is excused from the pixel rule for it now. */
export const WARN_ALLOW = [];
/* DEFERRED, not allowed: the model route's panel draws gold on a hover, on an action not taken and on the public
   route's dot (review_s2 P3-2). That palette is the shared labs/assets/js/ai/route-panel.js's, which this lab may
   not change (fix_s2_brief C5); it is reported to Luis as a shared change of its own. Until it changes, these
   elements are left out of the gold rules here, and the drive says so on every run. Delete this list with it. */
export const GOLD_DEFERRED = ['.lbr-pill:hover', '.lbr-panel button.go', '.lbr-row button:hover', '.lbr-routes li.on', '.lbr[data-route="pollinations"] .lbr-dot'];

/* BAR_L1 C10: nothing a visitor operates is cut. A target whose box runs past an ancestor that clips without
   scrolling (overflow hidden or clip), or past the window's sides, is a break; an ancestor that scrolls makes
   the target reachable and is not. (Lab-local for now: pull request 47 is rewriting tools/invariants.mjs; lift
   this rule there once it merges.) */
export const CLIPPED = `(() => {
  const sel = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
  const shown = (e) => e.getClientRects().length > 0 && (e.checkVisibility ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true);
  const out = [];
  for (const e of document.querySelectorAll(sel)) {
    if (!shown(e) || e.closest('[inert], dialog:not([open])')) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const name = (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + [...e.classList].join('.')) + ' "' + (e.textContent || '').trim().slice(0, 18) + '"';
    if (getComputedStyle(e).position === 'fixed' || !e.closest('.bh-sheet')) {
      if (r.left < -1 || r.right > innerWidth + 1) { out.push(name + ' runs past the window (' + Math.round(r.left) + ' to ' + Math.round(r.right) + ')'); continue; }
    }
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p), ox = s.overflowX, oy = s.overflowY;
      const scrolls = (v) => v === 'auto' || v === 'scroll';
      const clipsX = (ox === 'hidden' || ox === 'clip'), clipsY = (oy === 'hidden' || oy === 'clip');
      if (scrolls(ox) && scrolls(oy)) break;
      const q = p.getBoundingClientRect();
      if ((clipsX && (r.left < q.left - 1 || r.right > q.right + 1)) || (clipsY && (r.top < q.top - 1 || r.bottom > q.bottom + 1))) {
        out.push(name + ' is cut by ' + (p.id ? '#' + p.id : p.tagName.toLowerCase() + '.' + [...p.classList].join('.'))); break;
      }
      if (scrolls(ox) || scrolls(oy)) break;
    }
  }
  return [...new Set(out)].slice(0, 12);
})()`;

/* fix_s2_p1 K6: on a wide screen every label drawn on the render stays clear of the two panels (the curve's legend ran
   under the Measure card at 1440); on a phone the panels are a sheet and the window is the bound (OVERLAY_INSIDE). */
export const OVERLAY_CLEAR = `(() => {
  const out = [];
  if (matchMedia('(max-width: 900px)').matches) return out;
  const cols = ['bh-left', 'bh-right'].map((id) => document.getElementById(id)).filter((e) => e && e.getClientRects().length).map((e) => [e.id, e.getBoundingClientRect()]);
  for (const t of document.querySelectorAll('#bh-overlay text')) {
    const r = t.getBoundingClientRect();
    if (r.width < 1) continue;
    for (const [id, c] of cols) if (r.right > c.left + 1 && r.left < c.right - 1 && r.bottom > c.top + 1 && r.top < c.bottom - 1)
      out.push('"' + t.textContent.slice(0, 32) + '" runs under #' + id + ' (' + Math.round(r.left) + ' to ' + Math.round(r.right) + ' against ' + Math.round(c.left) + ' to ' + Math.round(c.right) + ')');
  }
  return out;
})()`;

/* review_s2 P4-3: every label drawn on the render stays inside the window. */
export const OVERLAY_INSIDE = `(() => {
  const out = [];
  for (const t of document.querySelectorAll('#bh-overlay text')) {
    const r = t.getBoundingClientRect();
    if (r.width < 1) continue;
    if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1)
      out.push('"' + t.textContent.slice(0, 32) + '" runs past the window (' + Math.round(r.left) + ' to ' + Math.round(r.right) + ', ' + Math.round(r.top) + ' to ' + Math.round(r.bottom) + ')');
  }
  return out;
})()`;

/* Read in the final frames of 2026-11-17: a header that stays put while content scrolls under it hides that content
   (the phone sheet's header was 95%, and the export buttons showed through it). Hidden means a white word under it
   shows by under 3 of 255 levels: a ground of at least 1 - 3/255 = 98.8%. Fully opaque is not required: Chrome on
   Windows then draws the header's words with LCD antialiasing, whose orange edges the gold rule reads as gold. */
export const STICKY_OPAQUE = `(() => {
  const out = [];
  const alpha = (c) => { if (c === 'transparent') return 0; const m = /^color\\(srgb [\\d.e-]+ [\\d.e-]+ [\\d.e-]+ \\/ ([\\d.e-]+)\\)$/.exec(c) || /^rgba\\([^)]*,\\s*([\\d.]+)\\)$/.exec(c); return m ? +m[1] : 1; };
  for (const e of document.querySelectorAll('body *')) {
    if (getComputedStyle(e).position !== 'sticky' || !e.getClientRects().length) continue;
    const c = getComputedStyle(e).backgroundColor, through = (1 - alpha(c)) * 255;
    if (through >= 3) out.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + [...e.classList].join('.')) + ' lets what scrolls under it show by ' + through.toFixed(1) + ' of 255 levels (' + c + ')');
  }
  return out;
})()`;

/* The class of the header above, read again in B1's frames (2026-11-17): any panel drawn over words hides them. The
   Sources panel at 390 (95%) showed the sheet's words through it by 11 levels; the rule above looked only at
   sticky headers. A panel here is a fixed or absolute element with a ground; a word under it is the text of an
   element outside it whose box meets the panel's, where the panel is on top at the middle of the meeting. */
export const OVER_TEXT_OPAQUE = `(() => {
  const out = [];
  const alpha = (c) => { if (c === 'transparent') return 0; const m = /^color\\(srgb [\\d.e-]+ [\\d.e-]+ [\\d.e-]+ \\/ ([\\d.e-]+)\\)$/.exec(c) || /^rgba\\([^)]*,\\s*([\\d.]+)\\)$/.exec(c); return m ? +m[1] : 1; };
  const name = (e) => e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].join('.') : '');
  const words = [...document.querySelectorAll('body *')].filter((t) => [...t.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && t.getClientRects().length && getComputedStyle(t).visibility !== 'hidden');
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (!/^(fixed|absolute)$/.test(cs.position) || !e.getClientRects().length || cs.visibility === 'hidden') continue;
    const a = alpha(cs.backgroundColor), through = (1 - a) * 255;
    if (a === 0 || through < 3) continue;
    const r = e.getBoundingClientRect();
    for (const t of words) {
      if (e.contains(t) || t.contains(e)) continue;
      const q = t.getBoundingClientRect();
      const x0 = Math.max(r.left, q.left), x1 = Math.min(r.right, q.right), y0 = Math.max(r.top, q.top), y1 = Math.min(r.bottom, q.bottom);
      if (x1 - x0 < 2 || y1 - y0 < 2) continue;
      const at = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
      if (!at || !(at === e || e.contains(at))) continue;
      out.push(name(e) + ' lets the words of ' + name(t) + ' show through by ' + through.toFixed(1) + ' of 255 levels (' + cs.backgroundColor + ')');
      break;
    }
  }
  return out;
})()`;

/* The plate as an image (road ticket 1.08; NOT_CHECKED until 2026-11-17): where its words' ink lies in the band
   under the picture. img is pixels(); W the plate's width; band its height in px. Ink is a pixel brighter than
   luma 100 (the frame's hairline is about 66, the dimmest stamp line about 140). The frame runs 24 u inside the
   edges and the corner brackets reach 26 u along it, so the right edge is read above the brackets and the bottom
   away from them. */
export function plateInk(img, W, band) {
  const { w, h, bpp, px } = img, u = W / 1920, frame = Math.round(24 * u), arm = Math.ceil(26 * u) + 2;
  const top = h - band, luma = (x, y) => { const i = (y * w + x) * bpp; return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; };
  let right = -1, bottom = -1, n = 0;
  for (let y = top; y < h; y++) for (let x = 0; x < w; x++) {
    if (luma(x, y) <= 100) continue;
    if (y < h - frame - arm) { n++; if (x > right) right = x; }
    if (x > frame + arm && x < w - frame - arm && y > bottom) bottom = y;
  }
  return { ink: n, right, bottom, rightLimit: w - Math.round(48 * u), bottomLimit: h - frame - 1 };
}

/* Read in B1's frames (2026-11-17): a custom hole's readout set "the point of no return, unseen" one word to a line,
   because its value (9.77x10^-16 km and 6.53x10^-27 AU) never wraps and took the row. A label in the readouts keeps
   at most three lines. */
export const READ_LABEL_LINES = `(() => {
  const out = [];
  for (const t of document.querySelectorAll('.bh-read dt')) {
    if (!t.getClientRects().length) continue;
    const lh = parseFloat(getComputedStyle(t).lineHeight) || parseFloat(getComputedStyle(t).fontSize) * 1.4;
    const lines = Math.round(t.getBoundingClientRect().height / lh);
    if (lines > 3) out.push('"' + t.textContent.trim().slice(0, 40) + '" takes ' + lines + ' lines beside "' + ((t.nextElementSibling && t.nextElementSibling.textContent) || '').trim().slice(0, 40) + '"');
  }
  return out;
})()`;

/* Read in the same frames: in a row of controls every label sits at the middle of its box (the import, a label
   styled as a button, set its words 9 px above its neighbours'). */
export const SEG_CENTRED = `(() => {
  const out = [];
  // every button-shaped control in a row: the rows of controls and the record's list (whose Open, a link drawn as a
  // button, sat at the top of its 44 px box at 390 on 2026-11-17)
  for (const e of document.querySelectorAll('.bh-seg > .bh-btn, .bh-rec .bh-btn')) {
    const b = e.getBoundingClientRect();
    if (b.height < 1 || !e.getClientRects().length) continue;
    const g = document.createRange(); g.selectNodeContents(e);
    const rs = [...g.getClientRects()].filter((r) => r.width >= 1);
    if (!rs.length) continue;
    const mid = (Math.min(...rs.map((r) => r.top)) + Math.max(...rs.map((r) => r.bottom))) / 2;
    if (Math.abs(mid - (b.top + b.bottom) / 2) > 2) out.push('"' + e.textContent.trim().slice(0, 18) + '" sits ' + Math.round(mid - (b.top + b.bottom) / 2) + ' px off its box\\'s middle');
  }
  return out;
})()`;

// the colour parser of the shared contrast rule: rgb(), rgba() and the color(srgb ...) that color-mix() computes to
const RGBA = `(c) => { let m = /^rgba?\\(([^)]+)\\)$/.exec(c); if (m) { const v = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; }
  m = /^color\\(srgb ([\\d.e-]+) ([\\d.e-]+) ([\\d.e-]+)(?: \\/ ([\\d.e-]+))?\\)$/.exec(c); if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]]; return null; }`;
const SHOWN = `(e) => !!e && e.getClientRects().length > 0 && (e.checkVisibility ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true)`;
// the opaque plates of the UI: what the gold rule reads where the render shows a physical colour map
const PANELS = '.bh-card, .bh-caption .cap, .bh-probe, .bh-sources, .bh-foot .tags, .bh-foot .perf, .bh-label, .bh-brand, .bh-back, #bh-route .lbr-pill, .lbr-panel, .bh-sheet-h';
// the texts that sit on the render, and the tags the review measured at the bound (P4-1, P4-4)
const ON_RENDER = ['.bh-label', '.bh-brand', '.bh-back', '#bh-route .lbr-label', '.bh-sources .bh-tagi', '.bh-sources .bh-tagr'];

/* In the page, at the moment of a shot: the boxes the pixel rules need, in CSS px (the drive sets dpr 1). */
const BOXES = (allow) => `(() => {
  const shown = ${SHOWN}, rgba = ${RGBA};
  const R = (r, p = 0) => [r.left - p, r.top - p, r.right + p, r.bottom + p];
  // a box as it shows: cut to the window and to every ancestor that clips or scrolls (a card scrolled out of the
  // phone's sheet lies over the render, unseen)
  const visible = (e, p = 0) => {
    let b = R(e.getBoundingClientRect(), p);
    b = [Math.max(b[0], 0), Math.max(b[1], 0), Math.min(b[2], innerWidth), Math.min(b[3], innerHeight)];
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const st = getComputedStyle(n);
      if (/(hidden|clip|auto|scroll)/.test(st.overflowX + st.overflowY)) { const q = n.getBoundingClientRect(); b = [Math.max(b[0], q.left), Math.max(b[1], q.top), Math.min(b[2], q.right), Math.min(b[3], q.bottom)]; }
    }
    return b;
  };
  const allowed = [], rings = [];
  for (const e of document.querySelectorAll(${JSON.stringify(allow.join(', '))})) {
    if (!shown(e)) continue;
    const r = e.getBoundingClientRect();
    if (e.matches('circle.tour-focus')) rings.push([(r.left + r.right) / 2, (r.top + r.bottom) / 2, r.width / 2]);
    else allowed.push(visible(e, 2));
  }
  const panels = [...document.querySelectorAll(${JSON.stringify(PANELS)})].filter(shown).map((e) => visible(e, -2)).filter((r) => r[2] > r[0] && r[3] > r[1]);
  const bg = (n) => { const c = rgba(getComputedStyle(n).backgroundColor); return c && c[3] > 0; };
  const texts = [];
  for (const sel of ${JSON.stringify(ON_RENDER)}) for (const e of document.querySelectorAll(sel)) {
    if (!shown(e)) continue;
    const words = [];
    const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (!n.textContent.trim()) continue; const g = document.createRange(); g.selectNodeContents(n); for (const q of g.getClientRects()) if (q.width >= 1) words.push(R(q)); }
    if (!words.length) continue;
    // only a text a visitor sees: on top at the middle of its first words (not scrolled away, not under the sheet)
    const w0 = words[0], top = document.elementFromPoint((w0[0] + w0[2]) / 2, (w0[1] + w0[3]) / 2);
    if (!top || (top !== e && !e.contains(top))) continue;
    // what the words sit on: the pixels within 4 px of them, inside the nearest of the element and its two parents
    // drawn with a background or a border (within that border and its rounded ends, which are not what the words
    // sit on), else the render around them
    const around = [Math.min(...words.map((w) => w[0])) - 4, Math.min(...words.map((w) => w[1])) - 4, Math.max(...words.map((w) => w[2])) + 4, Math.max(...words.map((w) => w[3])) + 4];
    let plate = around, plateEl = null;
    const framed = (n) => { const st = getComputedStyle(n); return ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(st['border' + s + 'Width']) > 0 && st['border' + s + 'Style'] !== 'none'); };
    for (let n = e, k = 0; n && k < 3; n = n.parentElement, k++) if (bg(n) || framed(n)) {
      const r = n.getBoundingClientRect(), st = getComputedStyle(n);
      const bw = (s) => parseFloat(st['border' + s + 'Width']) || 0, rad = Math.min(parseFloat(st.borderTopLeftRadius) || 0, r.height / 2);
      const inner = [r.left + bw('Left') + 1 + rad, r.top + bw('Top') + 1, r.right - bw('Right') - 1 - rad, r.bottom - bw('Bottom') - 1];
      plate = [Math.max(around[0], inner[0]), Math.max(around[1], inner[1]), Math.min(around[2], inner[2]), Math.min(around[3], inner[3])];
      plateEl = n; break;
    }
    const skip = plateEl ? [...plateEl.querySelectorAll('*')].filter((d) => d !== e && !d.contains(e) && bg(d)).map((d) => R(d.getBoundingClientRect())) : [];
    const c = rgba(getComputedStyle(e).color);
    texts.push({ name: sel + ' "' + e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 24) + '"', color: c, words, plate, skip });
  }
  const s = window.__bh.store.all();
  return { allowed, rings, panels, texts, color: s.color, emit: s.emit, view: s.view };
})()`;

const READY = '(() => { const a = window.__bh; if (!a || !a.renderer) return false; return a.renderer.ok() ? !!a.renderer.mainDone : true; })()';
const RECT = '(() => { const r = document.getElementById("bh-canvas").getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, dpr: devicePixelRatio }; })()';
// the colour a token computes to in the page
const TOKEN = `(v) => { const i = document.createElement('i'); i.style.color = 'var(' + v + ')'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; }`;

/* The phone's sheet of controls and readouts, opened, lies over the stage by design: its header stays at its top and
   closes it, and the stage's targets come back. So does a sheet sliding shut, for its --t-slow (it says so with
   data-moving, cleared when its transition is over; the drive checks it clears). The closed sheet is not named, so
   a target its peek hides is still a break (tools/invariants.mjs, targets: a cover no scroll moves off is named with
   its reason). Deferred, a shared change: the rule itself judging a target only once the animations around it are
   over (document.getAnimations()). */
export const SHEET_COVER = {
  '.bh-sheet.open': 'the opened sheet lies over the stage by design; its header closes it',
  '.bh-sheet[data-moving]': 'a sheet sliding shut lies over the stage until it is down',
};

/* The tour moves to its next stop by itself after the stop's dwell (TOUR[i].dur, 9 to 14 s). Reading a stop at both
   widths, with the invariants and a frame after every step, can take longer than that since the frame rule of pull
   request 47, so the drive holds the stop's clock while it reads, and checks the move by itself once, on its own. */
const HOLD_STOP = '(() => { const t = window.__bh && window.__bh.tour; if (t && t.running) t.t = -1e9; return !!(t && t.running); })()';

/* A fall to its stop (road 1.08), and a scrub let go off the Fall chart. The chart is redrawn from HTML on every
   change of state, so a pointer captured on one of its parts lost the capture with the redraw: a scrub dragged off
   the chart and let go there never saw its release, and hovering over the chart afterwards went on scrubbing with no
   button held (the class of setHTML in tour.js: a control replaced while the pointer is on it). Self-contained, so a
   scratch scenario can run it alone on the page before a fix. */
export async function FALL_STEP(p, { base, width, ready }) {
  const phone = width < 700;
  const at = (sel) => p.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
  const press = async (sel) => { const b = await at(sel); if (!b) { p.check(`the page has ${sel}`, false); return false; } await p.click(b[0] + b[2] / 2, b[1] + b[3] / 2); return true; };
  const sheet = async (open) => {
    if (!phone) return;
    const now = (await p.ev(`document.querySelector('.bh-sheet-h').getAttribute('aria-expanded')`)) === 'true';
    if (now !== open) { await press('.bh-sheet-h'); await p.sleep(700); }
  };
  await p.go(`${base}/labs/bh_animation_page.html?o=m87`);
  await p.until(ready, 60000);
  await p.sleep(1500);
  await sheet(true);
  if (!(await press('#bh-fallgo'))) return;
  await sheet(false);
  const t0 = Date.now();
  // the fall takes 22 s of the page's frame time, and a frame counts at most 250 ms (main.js): under a slow software
  // renderer it takes longer, so the wait is long and the time it took is printed
  // Known miss, queued (ROAD 1.05, the fall): the journey aims at 1.08 r+, but the state's floor for the camera's
  // radius is 3 M (config.js SCHEMA rcam min, there for a static camera), so every fall and every scrub stops at
  // max(3 M, 1.08 r+). This checks the stop the page has today, by that rule, so a change to either shows here.
  const stopped = await p.until(`(() => { const a = window.__bh, s = a.store.all(); return s.view === 'journey' && s.observer === 'faller' && s.rcam <= Math.max(3, a.model.rh * 1.08) + 1e-4; })()`, 150000);
  p.check('a fall pressed on the Fall card runs to its stop, today max(3 M, 1.08 r+)', !!stopped, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const f = await p.ev(`(async () => { const P = await import('/labs/assets/js/blackhole/physics.js'); const a = window.__bh, s = a.store.all(), m = a.model;
    const rows = P.fall(s.a, s.incl, 40, s.q), row = rows.find((r) => r.r <= s.rcam) || rows[0];
    const rw = [...document.querySelectorAll('#bh-fallread .rw')].find((r) => /your clock/.test(r.textContent));
    return { shown: rw ? rw.querySelector('dd').textContent.replace(/\\s+/g, '') : null, want: P.dur(row.tau * m.tg).replace(/\\s+/g, ''), rcam: s.rcam }; })()`);
  p.check(`at the stop the Fall card's clock is the engine's proper time there, ${f.want}`, f.shown === f.want, JSON.stringify(f));
  await sheet(true);
  const box = await at('#bh-fall svg');
  if (!box) { p.check('the page has the Fall chart', false); return; }
  const [x, y, w, h] = box, cy = y + h / 2;
  await p.drag(x + w * 0.3, cy, x + w * 0.6, Math.max(4, y - h * 1.5));   // pressed on the chart, let go above it
  const r1 = await p.ev('window.__bh.store.get("rcam")');
  await p.move(x + w * 0.85, cy); await p.sleep(250);
  await p.move(x + w * 0.15, cy); await p.sleep(250);
  const r2 = await p.ev('window.__bh.store.get("rcam")');
  p.check('a scrub let go off the Fall chart has ended: moving over the chart afterwards with no button held leaves the fall where it was', r1 === r2, JSON.stringify({ r1, r2 }));
  await sheet(false);
}

/* The record (road 1.09): keep a hole, a reload, a ray the visitor presses and one a link opens, the privacy export,
   a fall the visitor starts and the tour's, take out, and a browser whose storage is refused. Every count is read
   relative to the record as the step finds it, since earlier steps press pixels and run a fall, which the record keeps.
   after(label): the main scenario's pixel rules on the frame with the kept hole. Self-contained, like FALL_STEP. */
export async function RECORD_STEP(p, { base, width, ready, after = async () => {} }) {
  const phone = width < 700;
  const READ = `(() => { const e = document.querySelector('#bh-recline'); return !!e && e.textContent !== 'reading'; })()`;
  const COUNTS = `(() => { const k = window.__bh.keep; const r = k.record; return { kept: r.kept.length, rays: r.rays.length, falls: r.falls.length }; })()`;
  const at = (sel) => p.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
  const press = async (sel) => { const c = await at(sel); if (!c) { p.check(`the page has ${sel}`, false); return false; } await p.click(c[0], c[1]); return true; };
  const sheet = async (open) => {
    if (!phone) return;
    const now = (await p.ev(`document.querySelector('.bh-sheet-h').getAttribute('aria-expanded')`)) === 'true';
    if (now !== open) { await press('.bh-sheet-h'); await p.sleep(800); }
  };
  const open = async (q) => { await p.go(`${base}/labs/bh_animation_page.html${q}`); await p.until(ready, 60000); return p.until(READ, 20000); };
  const until = (expr) => p.until(`(() => { const c = ${COUNTS}; return ${expr}; })()`, 8000);

  p.check('the record is read: its line leaves "reading"', await open('?o=m87'), await p.ev(`document.querySelector('#bh-recline').textContent`));
  const c0 = await p.ev(COUNTS);
  await sheet(true);
  await press('#bh-keep');
  p.check('Keep: the hole is kept', await until(`c.kept === ${c0.kept + 1}`), JSON.stringify(await p.ev(COUNTS)));
  const k = await p.ev(`(() => ({ pressed: document.querySelector('#bh-keep').getAttribute('aria-pressed'), text: document.querySelector('#bh-keep').textContent, row: (document.querySelector('#bh-reclist li span') || {}).textContent || '', line: document.querySelector('#bh-recline').textContent }))()`);
  p.check('the button says so, pressed; the list names the hole as the page shows it; the line counts it', k.pressed === 'true' && k.text === 'Kept' && k.row === 'M87*, a = 0.940, i = 84°, cinematic' && k.line.startsWith(`${c0.kept + 1} kept`), JSON.stringify(k));
  await after('the record, a hole kept');

  p.check('reloaded, the record is read again', await open('?o=m87'));
  p.check('the hole is still kept after a reload', (await p.ev(COUNTS)).kept === c0.kept + 1 && (await p.ev(`document.querySelector('#bh-keep').getAttribute('aria-pressed')`)) === 'true');

  await sheet(false);
  const c1 = await p.ev(COUNTS);
  const cv = await p.ev(`(() => { const r = document.querySelector('#bh-canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.3]; })()`);
  const t1 = await p.ev('Date.now()');
  await p.click(cv[0], cv[1]);
  p.check('a pixel pressed: a ray recorded (the newest ray is younger than the press)', await p.until(`(() => { const r = window.__bh.keep.record.rays[0]; return !!r && r.t >= ${t1}; })()`, 8000), JSON.stringify(await p.ev(COUNTS)));
  const ray = await p.ev('window.__bh.keep.record.rays[0]');
  p.check('the ray keeps its link, its place on the image plane (two numbers inside the plane) and a fate the page names', !!ray && Array.isArray(ray.s) && ray.s.length === 2 && ray.s.every((v) => typeof v === 'number' && Math.abs(v) <= 100) && !('p' in ray) && ['captured', 'disk', 'ring', 'sky'].includes(ray.fate), JSON.stringify(ray));

  const c2 = await p.ev(COUNTS);
  // a ray a link opens, by the record's key (ps, the image plane) and by the key shared since G1 (p, fractions of
  // the window): traced, and not recorded
  for (const link of ['?o=m87&ps=0.00500,0.03000', '?o=m87&p=0.5,0.4']) {
    await open(link);
    await p.sleep(2500);
    const st = await p.ev(`(() => ({ probe: !document.getElementById('bh-probe').hidden, rays: window.__bh.keep.record.rays.length }))()`);
    p.check(`a ray a link opens (${link.split('&')[1].split('=')[0]}) is traced and not recorded (the visitor did not press it)`, st.probe && st.rays === c2.rays, JSON.stringify(st));
  }

  const ex = await p.ev(`(async () => { const f = await window.__bh.keep.os.privacy.exportAll(); const s = JSON.stringify(f); return { hasLab: s.includes('black-hole'), hasKept: s.includes('"kept"'), events: (s.match(/black-hole\\.(keep|ray)/g) || []).length }; })()`);
  p.check('the privacy export carries the record and its events', ex.hasLab && ex.hasKept && ex.events >= 2, JSON.stringify(ex));

  await open('?o=m87');
  const c3 = await p.ev(COUNTS);
  await sheet(true);
  const t3 = await p.ev('Date.now()');
  await press('#bh-fallgo');
  await sheet(false);
  p.check('a fall pressed: a fall recorded at its stop (the newest fall is younger than the press)', await p.until(`(() => { const f = window.__bh.keep.record.falls[0]; return !!f && f.t >= ${t3}; })()`, 150000), JSON.stringify(await p.ev(COUNTS)));
  const fl = await p.ev(`(async () => { const P = await import('/labs/assets/js/blackhole/physics.js'); const a = window.__bh, f = a.keep.record.falls[0];
    const rw = [...document.querySelectorAll('#bh-fallread .rw')].find((r) => /your clock/.test(r.textContent));
    return { rec: f ? P.dur(f.tau).replace(/\\s+/g, '') : null, card: rw ? rw.querySelector('dd').textContent.replace(/\\s+/g, '') : null }; })()`);
  p.check(`the fall's proper time is the Fall card's at the stop, ${fl.card}`, !!fl.rec && fl.rec === fl.card, JSON.stringify(fl));
  const c4 = await p.ev(COUNTS);
  const fallStop = await p.ev(`(async () => { const C = await import('/labs/assets/js/blackhole/config.js'); return C.TOUR.findIndex((s) => s.id === 'fall'); })()`);
  // the stop's clock held, as the tour section does: the stop moves on after its dwell (10 s), before the fall (about
  // 20 s of frames) reaches its stop
  await p.ev(`(() => { window.__bh.tour.start(${fallStop}); window.__bh.tour.t = -1e9; })()`);
  const tourFell = await p.until(`(() => { const s = window.__bh.store.all(), m = window.__bh.model; return s.view === 'journey' && s.rcam <= Math.max(3, m.rh * 1.08) + 1e-4; })()`, 150000);
  await p.sleep(1500);
  p.check("the tour's fall reaches its stop, and is not recorded (the visitor did not start it)", tourFell && (await p.ev(COUNTS)).falls === c4.falls, JSON.stringify({ tourFell, ...(await p.ev(COUNTS)) }));
  await p.ev('window.__bh.tour.stop()');

  const c5 = await p.ev(COUNTS);
  await sheet(true);
  await press('#bh-reclist button[data-out]');
  p.check('Take out: the hole is out', await until(`c.kept === ${c5.kept - 1}`), JSON.stringify(await p.ev(COUNTS)));
  await sheet(false);

  // review_s3 finding 2: the record's own links, as it writes them, open their state and the tour does not start
  await open('?o=m87');
  await sheet(true);
  await press('#bh-keep');
  await until(`c.kept >= 1`);
  const hrefs = await p.ev(`(() => { const a = [...document.querySelectorAll('#bh-reclist a.bh-btn')].map((x) => x.getAttribute('href')); return { kept: a[0], ray: a.find((h) => /[?&]ps=/.test(h)) || null }; })()`);
  p.check('the default hole is kept under a link that names it', /\?o=m87$/.test(hrefs.kept || ''), JSON.stringify(hrefs));
  for (const [what, h] of [['the kept hole', hrefs.kept], ['the ray', hrefs.ray]]) {
    if (!h) { p.check(`the record has a link for ${what}`, false); continue; }
    await p.go(`${base}${h}`);
    await p.until(ready, 60000);
    await p.sleep(4200);
    const st = await p.ev(`(() => ({ tour: window.__bh.tour.running, probe: !document.getElementById('bh-probe').hidden, obj: window.__bh.store.get('obj') }))()`);
    p.check(`opening ${what} from the record does not start the tour${what === 'the ray' ? ', and traces its ray' : ''}`, !st.tour && st.obj === 'm87' && (what !== 'the ray' || st.probe), JSON.stringify(st));
  }
  // recording off: a ray pressed is not added, and the card says so
  await open('?o=m87&os-fixture=recording-off');
  const r0 = await p.ev(COUNTS);
  await sheet(false);
  const cv2 = await p.ev(`(() => { const r = document.querySelector('#bh-canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.3]; })()`);
  await p.click(cv2[0], cv2[1]);
  await p.sleep(1500);
  const off2 = await p.ev(`(() => ({ probe: !document.getElementById('bh-probe').hidden, rays: window.__bh.keep.record.rays.length, said: document.querySelector('#bh-recsaid').textContent, foot: document.querySelector('#bh-recfoot').textContent }))()`);
  // the probe open: the press traced a ray, so the count staying is the switch and not a missed click (review_s3b K)
  p.check('recording off: a pressed ray is traced and not added, the card says recording is off, and its foot names no usage event', off2.probe && off2.rays === r0.rays && /Recording is off/.test(off2.said) && /no usage event/.test(off2.foot), JSON.stringify(off2));
  // a full list: past 8 kept holes the card offers the rest, and every one can be seen
  await open('?o=m87');
  await sheet(true);
  for (let k = 0; k < 9; k++) {
    await p.ev(`window.__bh.store.set({ a: ${(0.1 + k * 0.05).toFixed(2)} }, { instant: true })`);
    await press('#bh-keep');
    await p.sleep(250);
  }
  const full = await p.ev(`(() => ({ kept: window.__bh.keep.record.kept.length, rows: document.querySelectorAll('#bh-reclist li:not(.more)').length, more: (document.querySelector('#bh-reclist button[data-all="kept"]') || {}).textContent || '' }))()`);
  p.check('past 8 kept holes the card offers the rest', full.kept >= 9 && /Show the \d+ more/.test(full.more), JSON.stringify(full));
  await press('#bh-reclist button[data-all="kept"]');
  const shown = await p.ev(`(() => ({ kept: window.__bh.keep.record.kept.length, outs: document.querySelectorAll('#bh-reclist button[data-out]').length }))()`);
  p.check('shown whole, every kept hole has its Take out', shown.outs === shown.kept, JSON.stringify(shown));
  await sheet(false);

  await open('?o=m87&os-fixture=storage-unavailable');
  const off = await p.ev(`(() => ({ store: document.querySelector('#bh-keep').closest('.bh-card').dataset.store, foot: document.querySelector('#bh-recfoot').textContent }))()`);
  p.check('a browser whose storage is refused: the record is in memory and the card says it lasts until the page closes', off.store === 'memory' && /until the page closes/.test(off.foot), JSON.stringify(off));
}

/* ---- the scenario ---- */

export default async function blackhole(p, { base, width }) {
  const phone = width < 700;
  for (const [n, e] of standard({ gold: { allow: [...GOLD_ALLOW, ...GOLD_DEFERRED] }, targets: { cover: SHEET_COVER } })) p.invariant(n, e);
  p.invariant('invariant: no target is cut by an ancestor that does not scroll, or by the window', CLIPPED);
  p.invariant('invariant: every label on the render stays inside the window', OVERLAY_INSIDE);
  p.invariant('invariant: on a wide screen every label on the render stays clear of the panels', OVERLAY_CLEAR);
  p.invariant('invariant: a header that sticks over scrolling content has an opaque ground', STICKY_OPAQUE);
  p.invariant('invariant: in a row of controls every label sits at the middle of its box', SEG_CENTRED);
  p.invariant('invariant: a panel drawn over words hides them', OVER_TEXT_OPAQUE);
  p.invariant('invariant: a label in the readouts keeps at most three lines beside its value', READ_LABEL_LINES);
  await p.before(`(${guard})()`);
  // a plate's PNG is caught where the page hands it to the download, and the file is not saved by the browser
  await p.before(`(() => { const real = URL.createObjectURL.bind(URL), click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (b) => { if (b && b.type === 'image/png') window.__bhPng = b; return real(b); };
    HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__bhSaved = this.download; return; } return click.call(this); };
    return true; })()`);
  console.log(`deferred (review_s2 P3-2, the shared ai/route-panel.js): the gold rules leave out ${GOLD_DEFERRED.join(', ')}`);

  /* the pixel rules, read from one shot after a step (fix_s2_brief C4) */
  const shots = { n: 0, gold: 0, contrast: 0 };
  const pixelRules = async (label) => {
    const b = await p.ev(BOXES([...GOLD_ALLOW, ...GOLD_DEFERRED, ...WARN_ALLOW]));
    const file = await p.shot(`px-${String(++shots.n).padStart(2, '0')}-${width}`);
    // an allowed mark that moves while the frame is taken (the Fall chart's cursor during a fall) is allowed along
    // its path: each element's box measured before and after the shot, and the box spanning both (seen 2026-11-17:
    // the cursor's four pixels outside its box measured before the shot)
    const after = await p.ev(BOXES([...GOLD_ALLOW, ...GOLD_DEFERRED, ...WARN_ALLOW]));
    if (after.allowed.length === b.allowed.length) b.allowed = b.allowed.map((a, i) => { const z = after.allowed[i]; return [Math.min(a[0], z[0]), Math.min(a[1], z[1]), Math.max(a[2], z[2]), Math.max(a[3], z[3])]; });
    else b.allowed = b.allowed.concat(after.allowed);
    const img = pixels(file);
    const g = goldIn(img, b);
    if (g.n) shots.gold++;
    const where = g.own ? `the whole frame: the render shows the lab's own ${b.color} palette` : `the UI's panels: the render shows the physical ${b.color} map`;
    p.check(`${label}: no pixel of the gold tokens outside the elements allowed (${where})`, g.n === 0,
      g.at ? `${g.n} pixels, the first at ${g.at[0]},${g.at[1]} (${g.at.slice(2).join(',')})` : '');
    const low = [];
    for (const t of b.texts) {
      const c = contrastIn(img, t);
      if (c.ratio !== null && c.ratio < 4.5 - 0.005) low.push(`${t.name} ${c.ratio.toFixed(2)}:1`);
    }
    if (low.length) shots.contrast++;
    p.check(`${label}: every text on the render at 4.5 to 1 against the pixels behind its words (${b.texts.length} read)`, low.length === 0, low.join(' | '));
    return { b, img, file };
  };

  const frame = async (name) => {
    const file = await p.shot(name);
    const r = await p.ev(RECT);
    const f = readFrame(file, r, r.dpr);
    p.check(`${name}: no fully transparent pixel in the frame`, f.clear === 0, `${f.clear} transparent pixels`);
    p.check(`${name}: the canvas is a picture, not a black frame`, f.lit >= LIT_SHARE && f.top > 150,
      `${(f.lit * 100).toFixed(2)}% of ${f.n} canvas pixels above luma ${LIT_LUMA}, brightest ${f.top.toFixed(0)}`);
    return f;
  };
  const click = async (sel) => {
    const r = await p.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    if (!r) { p.check(`the page has ${sel}`, false); return false; }
    await p.click(r[0], r[1]);
    return true;
  };
  let closedOnce = false;
  const sheet = async (open) => {
    if (!phone) return;
    const now = (await p.ev(`document.querySelector('.bh-sheet-h').getAttribute('aria-expanded')`)) === 'true';
    if (now !== open) { await click('.bh-sheet-h'); await p.sleep(700); }
    if (now && !open && !closedOnce) {
      closedOnce = true;
      const c = await p.ev(`(() => { const s = document.querySelector('.bh-sheet'); return { moving: 'moving' in s.dataset, open: s.classList.contains('open'), t: getComputedStyle(s).transitionDuration }; })()`);
      p.check('the sheet, slid down, no longer says it moves (so its peek is judged as a cover again)', !c.moving && !c.open, JSON.stringify(c));
    }
  };
  const button = (box, text) => p.ev(`[...document.querySelectorAll(${JSON.stringify(box + ' button')})].findIndex((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`);

  /* ---- 1. load ---- */
  const t0 = Date.now();
  await p.go(`${base}/labs/bh_animation_page.html`);
  const up = await p.until(READY, READY_MS);
  const ms = Date.now() - t0;
  const gl = await p.ev('!!(window.__bh && window.__bh.renderer && window.__bh.renderer.ok())');
  p.check('the renderer comes up on WebGL2', gl, gl ? '' : await p.ev('(window.__bh && window.__bh.renderer && window.__bh.renderer.error) || "no renderer"'));
  p.check('the no-WebGL notice stays hidden while WebGL2 runs', !gl || await p.ev('document.getElementById("bh-nogl").hidden'));
  p.check(`the first full trace finishes inside ${READY_MS / 1000} s`, up, `${(ms / 1000).toFixed(1)} s, software ${await p.ev('!!(window.__bh && window.__bh.renderer && window.__bh.renderer.software)')}, tier ${await p.ev('window.__bh && window.__bh.perf && window.__bh.perf.tier')}`);
  await p.sleep(3000);   // the ignition runs 2.6 s after load (main.js); the frame is read after it
  await p.step('loaded and ignited');
  await frame(`load-${width}`);
  await pixelRules('loaded');

  // BAR_L1 C11: the title in Fraunces, loaded (not a fallback serif); the readouts in IBM Plex Mono
  const type = await p.ev(`(async () => { await document.fonts.ready; const h = document.querySelector('.bh-head h1'), d = document.querySelector('.bh-read dd');
    return { h1: h ? getComputedStyle(h).fontFamily : '', dd: d ? getComputedStyle(d).fontFamily : '', fraunces: document.fonts.check('26px Fraunces'), plex: document.fonts.check('12px "IBM Plex Mono"') }; })()`);
  p.check('the page title is set in Fraunces, and the face loaded', /Fraunces/.test(type.h1) && type.fraunces, JSON.stringify(type));
  p.check('the readouts are set in IBM Plex Mono, and the face loaded', /IBM Plex Mono/.test(type.dd) && type.plex, JSON.stringify(type));

  /* ---- 2. the colour modes: the render's own palettes read from the pixels (P3-1, P4-1), their legends ---- */
  // opened by link, so the tour that starts on its own after a bare load does not change the scene mid-step
  await p.go(`${base}/labs/bh_animation_page.html?o=m87`);
  await p.until(READY, READY_MS);
  await p.sleep(2000);

  /* fix_s2_p1 S1: the page as it loads, M87* with the camera at 84 deg. Every writer of the shadow prints the
     inclination it was measured at (physics.js measurement); the plate names the camera's apart. The plate's lines are
     measured in the page's own IBM Plex Mono against its frame at both plate widths. */
  const WRITERS = `(async () => {
    const P = await import('/labs/assets/js/blackhole/physics.js'), PL = await import('/labs/assets/js/blackhole/plate.js'), A = await import('/labs/assets/js/blackhole/ask.js');
    const app = window.__bh, s = app.store.all(), ms = P.measurement(s), f = A.facts(app);
    const inst = [...document.querySelectorAll('#bh-read .rw')].map((r) => [r.querySelector('dt').textContent, (r.querySelector('dd') || {}).textContent || '']).find(([t]) => /^shadow, mean diameter/.test(t)) || null;
    const meas = (document.querySelector('#bh-meas dt') || {}).textContent || '';
    await document.fonts.load(PL.plateFont(19)); await document.fonts.load(PL.plateFont(26, 600));
    const L = PL.plateLines(app, '2026-11-17'), g = document.createElement('canvas').getContext('2d');
    const widest = [1920, 3840].map((W) => { const u = W / 1920; return Math.max(...L.map((l) => { g.font = PL.plateFont(l.px * u, l.weight); return g.measureText(l.text).width / u; })); });
    return { camera: s.incl, incl: ms.incl, deg: P.deg(ms.incl), mean: P.s3(ms.th.mean), inst, meas, lines: L.map((l) => l.text), widest, inner: 1920 - PL.PLATE_BAND.frame - PL.PLATE_BAND.x,
      font: document.fonts.check(PL.plateFont(19)), facts: [f.camera_inclination_deg, f.shadow_inclination_deg, P.s3(f.shadow_mean_diameter_M)] };
  })()`;
  {
    const w = await p.ev(WRITERS);
    p.check(`on load (M87*, camera at ${w.camera} deg): the Instrument card's shadow is the measurement's ${w.mean} M, at the ${w.deg} deg it names`, w.camera === 84 && w.incl === 17 && w.inst && w.inst[0].includes(`far observer at ${w.deg} deg`) && w.inst[1].startsWith(w.mean), JSON.stringify(w.inst));
    p.check('on load: the Measure card\'s header names the same inclination', w.meas.startsWith(`i = ${w.deg} deg`), w.meas);
    p.check('on load: the plate names the camera\'s 84 deg as the camera\'s and the shadow at its 17 deg', w.lines[0].includes('camera at i = 84 deg') && w.lines[1].includes(`shadow ${w.mean} M across`) && w.lines[1].includes(`seen from far away at i = ${w.deg} deg`), w.lines.slice(0, 2).join(' | '));
    p.check('on load: the guide\'s context carries both inclinations and the measurement\'s diameter', w.facts[0] === 84 && w.facts[1] === 17 && w.facts[2] === w.mean, JSON.stringify(w.facts));
    p.check(`the plate's lines fit inside its frame in IBM Plex Mono, at 1920 and 3840 px (widest ${w.widest.map((x) => Math.round(x)).join(', ')} of ${w.inner})`, w.font && w.widest.every((x) => x <= w.inner), JSON.stringify(w.lines));
  }
  await sheet(true);
  for (const [mode, label] of [['true', 'True colour'], ['redshift', 'Redshift g'], ['order', 'Photon order'], ['steps', 'Integrator'], ['thermal', 'Thermal']]) {
    const i = await button('#bh-modes', label);
    if (i < 0) { p.check(`the colour button ${label}`, false); continue; }
    await click(`#bh-modes button:nth-of-type(${i + 1})`);
    await sheet(false);
    await p.sleep(2600);
    await p.step(`colour ${mode}`);
    await pixelRules(`colour ${mode}`);
    if (mode === 'order' || mode === 'steps') {
      // the legend's swatches are the tokens the render draws the marks in (palette.js modeKey)
      const key = await p.ev(`(() => { const tok = ${TOKEN}; return [...document.querySelectorAll('#bh-modekey span')].map((s) => { const i = s.querySelector('i'); const v = (i.getAttribute('style') || '').match(/var\\((--[\\w-]+)\\)/); return { text: s.textContent, bg: getComputedStyle(i).backgroundColor, want: v ? tok(v[1]) : null }; }); })()`);
      p.check(`colour ${mode}: a legend of swatches, each the colour of its token, none gold`, key.length >= 2 && key.every((k) => k.want && k.bg === k.want && k.bg !== 'rgb(212, 162, 76)'), JSON.stringify(key));
      if (mode === 'steps') p.check('colour steps: the drift is labelled with its limit', key.some((k) => k.text === 'drift above 1e-4' && k.want === 'rgb(224, 108, 117)'), JSON.stringify(key));
    }
    await sheet(true);
  }
  await sheet(false);

  /* ---- 3. the measurement and the telescope view, opened by link (ledger row 2; P2-1, P4-3) ---- */
  const CARD = `(async () => {
    const P = await import('/labs/assets/js/blackhole/physics.js');
    const s = window.__bh.store.all(), ms = P.measurement(s), c = ms.cmp;
    const card = document.getElementById('bh-meas'), sig = [...card.querySelectorAll('.bh-sig')].map((e) => e.textContent.trim());
    return { text: card.textContent.replace(/\\s+/g, ' '), sig, note: document.getElementById('bh-measnote').textContent,
      want: c && c.shadow ? (c.shadow.sigma >= 0 ? '+' : '') + P.s3(c.shadow.sigma) + ' σ' : null,
      // fix_s2_p1 S6 and K6: the scale and the angle as pmText writes them, the scale's source, the ruling in full
      scale: c ? P.pmText(c.pred.thetaG, c.pred.thetaErrP, c.pred.thetaErrM) : null, angle: c ? P.pmText(c.pred.value, c.pred.errP, c.pred.errM) : null,
      src: c ? c.pred.src : null, ruling: P.RULING, none: P.noShadow('M87*') };
  })()`;
  // the curve's colour word in the overlay's legend and the idle caption, against the stroke the stylesheet draws
  const WORDS = `(async () => {
    const tok = ${TOKEN};
    let word = 'gold', token = '--accretion';
    try { const C = await import('/labs/assets/js/blackhole/palette.js'); word = C.colourWord('curve'); token = C.MARKS.curve; } catch { /* a page from before palette.js names gold */ }
    const curve = document.querySelector('#bh-overlay .curve');
    const texts = [...document.querySelectorAll('#bh-overlay text')].map((t) => t.textContent).concat([(document.querySelector('#bh-caption .cap-b') || {}).textContent || '']);
    return { word, stroke: curve ? getComputedStyle(curve).stroke : null, want: tok(token), named: texts.filter((t) => t.includes(word)).length, gold: texts.filter((t) => /gold/i.test(t)), texts };
  })()`;
  for (const [obj, name] of [['m87', 'M87*'], ['sgra', 'Sgr A*']]) {
    await p.go(`${base}/labs/bh_animation_page.html?o=${obj}&v=telescope`);
    await p.until(READY, READY_MS);
    await p.sleep(2500);
    await p.step(`${name} in the telescope view, by link`);
    if (obj === 'm87') {
      const w = await p.ev(WORDS);
      p.check(`the telescope view names the curve ${w.word}, the colour the stylesheet draws it in, in its legend and its caption`, w.stroke === w.want && w.named >= 2 && w.gold.length === 0, JSON.stringify({ stroke: w.stroke, want: w.want, named: w.named, gold: w.gold }));
      await pixelRules('the telescope view, idle');
    }
    await p.ev(`(document.getElementById('bh-meas').scrollIntoView({ block: 'center' }), true)`);
    await p.step(`${name}: the Measure card in view`);
    const card = await p.ev(CARD);
    if (obj === 'm87') {
      p.check('M87*: no sigma on the card, the ring named as emission, the scale from its stars',
        card.sig.length === 0 && card.text.includes('EHT ring of emission') && card.text.includes('42 ± 3') && card.text.includes('the motions of its stars') && card.want === null,
        card.text.slice(0, 400));
      p.check('M87*: the note says the EHT measured no shadow from its images', card.note.includes(card.none), card.note);
    } else {
      p.check('Sgr A*: one sigma, against the EHT shadow 48.7 ± 7.0, equal to the engine\'s',
        card.sig.length === 1 && card.sig[0] === card.want && card.text.includes('EHT shadow 48.7 ± 7.0') && card.text.includes('the orbits of its stars'),
        JSON.stringify({ sig: card.sig, want: card.want }) + ' ' + card.text.slice(0, 300));
      // fix_s2_p1 S3: the ruling's "the ring row goes"; the research calls the near match a coincidence not to show
      p.check('Sgr A*: no ring of emission on the card beside its shadow', !/ring of emission/.test(card.text) && !card.text.includes('51.8'), card.text.slice(0, 400));
    }
    p.check(`${name}: the scale as a number, ${card.scale} µas per M, and the angle at one precision, ${card.angle} µas`, card.text.includes(`${card.scale}µas per M`) && card.text.includes(`${card.angle}µas`) && !/\d\.\d ± 0\.\d{3}/.test(card.text), card.text.slice(0, 500));
    p.check(`${name}: the note names the scale's source and states the ruling in full`, card.note.includes('a scale the EHT image did not give') && card.note.includes(card.src) && card.note.includes(card.ruling), card.note);
    await frame(`measure-${obj}-${width}`);
  }

  /* fix_s2_p1 S10 and S7: a link that gives a named object a mass or a charge of its own opens a custom hole, as the
     slider makes one, so no comparison reads the catalogue under other values; a charged, spinning hole is labelled on
     the card as on the plate, by how its shadow was obtained (physics.js SHADOW_HOW) */
  const CUSTOM = `(async () => {
    const P = await import('/labs/assets/js/blackhole/physics.js'), PL = await import('/labs/assets/js/blackhole/plate.js');
    const app = window.__bh, s = app.store.all(), ms = P.measurement(s);
    const rows = [...document.querySelectorAll('#bh-meas .rw dt')].map((d) => d.textContent);
    return { obj: s.obj, mass: s.mass, q: s.q, how: ms.th.how, label: P.SHADOW_HOW[ms.th.how].label, row: rows[0] || '', plate: PL.plateLines(app, 'x')[1].text,
      card: document.getElementById('bh-meas').textContent.replace(/\\s+/g, ' '), kind: document.getElementById('bh-objkind').textContent };
  })()`;
  for (const [q, what] of [['?o=sgra&v=telescope&m=7', 'a mass of 1e7'], ['?o=sgra&v=telescope&qq=0.5', 'a charge of 0.5']]) {
    await p.go(`${base}/labs/bh_animation_page.html${q}`);
    await p.until(READY, READY_MS);
    await p.sleep(2500);
    await p.step(`the link ${q}`);
    const c = await p.ev(CUSTOM);
    p.check(`${q}: Sgr A* given ${what} opens a custom hole, with no EHT comparison on its card`, c.obj === 'custom' && c.kind === 'custom' && !/EHT shadow/.test(c.card) && !/σ/.test(c.card.replace('no σ', '')), JSON.stringify({ obj: c.obj, kind: c.kind }) + ' ' + c.card.slice(0, 200));
    if (c.q > 0) p.check(`${q}: the card and the plate label the Kerr-Newman shadow alike, "${c.label}", never Bardeen`, c.how === 'traced' && c.row.startsWith(`width, ${c.label}`) && c.plate.includes(`(${c.label})`) && !/Bardeen/.test(c.row + c.plate), JSON.stringify({ row: c.row, plate: c.plate }));
  }

  /* ---- 4. the tour, stop by stop, against the engine (P2-2, P2-3, P2-8, P6-3) ---- */
  await p.go(`${base}/labs/bh_animation_page.html?o=m87`);
  await p.until(READY, READY_MS);
  await p.sleep(2000);
  await sheet(true);
  await click('#bh-tour');
  await p.ev(HOLD_STOP);
  await sheet(false);
  const STOP = `(async () => {
    const K = await import('/labs/assets/js/blackhole/kerr.js'), P = await import('/labs/assets/js/blackhole/physics.js');
    const app = window.__bh, s = app.store.all(), m = P.derive(s), f = document.querySelector('circle.tour-focus');
    const ms = P.measurement(s);
    return { i: app.tour.i, running: app.tour.running, title: (document.querySelector('#bh-caption .cap-t') || {}).textContent || '', text: (document.querySelector('#bh-caption .cap-b') || {}).textContent || '',
      a: s.a, incl: s.incl, eg: P.s3(Math.exp(K.lyapunov(s.a, K.polarPhotonOrbit(s.a)))), scale: ms.cmp ? ms.cmp.pred.thetaG : null,
      farDeg: P.deg(ms.incl), width: P.s3(ms.th.chords.width), scaleText: ms.cmp ? P.s3(ms.cmp.pred.thetaG) : null,
      across: P.sci(2 * m.horizonKm), ring: f ? { cls: f.getAttribute('class'), stroke: f.getAttribute('stroke') } : null };
  })()`;
  const halfUlp = (t) => 0.5 * 10 ** -((String(t).split('.')[1] || '').length);
  let rings = 0;
  for (let k = 0; k < 8; k++) {
    await p.sleep(2600);
    await p.step(`tour stop ${k + 1}`);
    const st = await p.ev(STOP);
    p.check(`tour stop ${k + 1} (${st.title}): the tour runs at this stop`, st.running && st.i === k, JSON.stringify({ running: st.running, i: st.i }));
    if (st.ring) { rings++; p.check(`tour stop ${k + 1}: the focus ring is the one gold mark, class tour-focus, stroke --accretion`, st.ring.cls === 'tour-focus' && st.ring.stroke === 'var(--accretion)', JSON.stringify(st.ring)); }
    if (/went around/.test(st.title)) p.check(`the ring stop quotes e^gamma at a = ${st.a}, ${st.eg} (the Measure card's sub-ring number)`, st.text.includes(`about ${st.eg} times thinner`), st.text);
    if (/Event Horizon Telescope sees/.test(st.title)) {
      const d = (st.text.match(/is ([\d.]+) M (across|wide)/) || [])[1], u = (st.text.match(/([\d.]+) uas on the sky/) || [])[1];
      p.check(`the telescope stop: the angle is the diameter beside it times the scale (${d} x ${st.scale} = ${u}), said across`, d && u && /M across/.test(st.text) && Math.abs(u - d * st.scale) <= halfUlp(d) * st.scale + halfUlp(u), st.text);
      p.check(`the telescope stop: the scale printed as a number beside the angle, ${st.scaleText} uas per M (fix_s2_p1 S6)`, st.text.includes(`uas on the sky at ${st.scaleText} uas per M`), st.text);
    }
    // fix_s2_p1 S1: the shadow stop, in the cinematic view at 84 deg, quotes the measurement's width at the 17 deg it names
    if (/not the horizon/.test(st.title)) p.check(`the shadow stop: the width at the ${st.farDeg} deg it names, ${st.width} M, with the camera at ${st.incl} deg`, st.text.includes(`Seen from far away at ${st.farDeg} deg, the dark region is ${st.width} M wide`), st.text);
    if (/size of a city/.test(st.title)) p.check(`the Cygnus X-1 stop: its horizon across is 2 r+, ${st.across} km`, st.text.includes(`horizon is ${st.across} km across`), st.text);
    await pixelRules(`tour stop ${k + 1}`);
    if (k < 7) { await click('#bh-caption button[data-n="next"]'); await p.ev(HOLD_STOP); }
  }
  p.check('the tour drew its focus ring at the stops that point at something', rings >= 3, `${rings} stops with a ring`);
  await click('#bh-caption button[data-n="exit"]');
  await p.sleep(800);
  // the move by itself, held above while each stop was read: the first stop's clock set 0.3 s short of its dwell
  const moved = await p.ev(`(async () => { const C = await import('/labs/assets/js/blackhole/config.js'), t = window.__bh.tour;
    t.start(0); t.t = C.TOUR[0].dur - 0.3; await new Promise((r) => setTimeout(r, 1500)); const i = t.i, running = t.running; t.stop(); return { i, running, dur: C.TOUR[0].dur }; })()`);
  p.check(`the tour moves to its second stop by itself after the first stop's ${moved.dur} s`, moved.running && moved.i === 1, JSON.stringify(moved));
  await p.sleep(800);

  /* ---- 4b. a fall to its stop, and a scrub let go off the chart ---- */
  await FALL_STEP(p, { base, width, ready: READY });

  /* ---- 4c. the record (road 1.09) ---- */
  await RECORD_STEP(p, { base, width, ready: READY, after: (label) => pixelRules(label) });

  /* ---- 5. the Instrument card's Hawking temperature, read against derive() in the page (P5-1) ---- */
  const HAWK = `(async () => { const P = await import('/labs/assets/js/blackhole/physics.js');
    const s = window.__bh.store.all(), m = P.derive(s);
    const row = [...document.querySelectorAll('#bh-read .rw')].find((r) => /Hawking T/.test(r.textContent));
    return { obj: s.obj, a: s.a, q: s.q, shown: row ? row.querySelector('dd').textContent.replace(/\\s+/g, '') : null, want: (P.sci(m.hawkingK) + 'K').replace(/\\s+/g, '') }; })()`;
  await sheet(true);
  for (const name of ['M87*', 'Sgr A*', 'Cygnus X-1', 'Primordial']) {
    const i = await button('#bh-objs', name);
    if (i < 0) { p.check(`the object button ${name}`, false); continue; }
    await click(`#bh-objs button:nth-of-type(${i + 1})`);
    await p.sleep(1800);
    const h = await p.ev(HAWK);
    p.check(`${name}: the card's Hawking T is derive()'s, at the hole's own spin and charge`, h.shown && h.shown === h.want, JSON.stringify(h));
  }
  // a custom hole, typed into its fields the visitor's way: a charge, then a spin
  await p.ev(`(() => { const i = document.getElementById('bh-in-q'); i.value = '0.9'; i.dispatchEvent(new Event('change')); const j = document.getElementById('bh-in-a'); j.value = '0.3'; j.dispatchEvent(new Event('change')); return true; })()`);
  await p.sleep(1800);
  { const h = await p.ev(HAWK); p.check('a custom hole at a = 0.3, Q = 0.9: the card shows the Kerr-Newman value', h.obj === 'custom' && h.q === 0.9 && h.shown === h.want, JSON.stringify(h)); }

  /* ---- 6. Sources: its tags against the pixels (P4-4) ---- */
  if (phone) { await p.ev(`(document.getElementById('bh-srcbtn2').scrollIntoView({ block: 'center' }), true)`); await p.sleep(300); await click('#bh-srcbtn2'); }
  else await click('#bh-srcbtn');
  await p.sleep(900);
  p.check('Sources opens', await p.ev(`!document.getElementById('bh-sources').hidden`));
  // B1 (2026-11-17): the first version stays reachable from the page at every width, and its address serves it
  const v1 = await p.ev(`(async () => { const a = document.querySelector('#bh-sources a[href="bh_animation_page_v1.html"]'); if (!a) return null;
    a.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 200)); const r = a.getBoundingClientRect();
    const at = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    const res = await fetch(a.href); const html = await res.text();
    return { onTop: !!at && (at === a || a.contains(at)), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      status: res.status, first: html.includes('assets/js/blackhole_v1/main.js') }; })()`);
  p.check('Sources links the first version, on top and inside the window, and its address serves that version',
    !!v1 && v1.onTop && v1.inside && v1.status === 200 && v1.first, JSON.stringify(v1));
  await pixelRules('Sources open');
  await click('#bh-srcclose');
  await p.sleep(400);
  await sheet(false);

  /* ---- 7. the model route's panel opens and is whole (P4-2); its gold is deferred (P3-2) ---- */
  await click('#bh-route .lbr-pill');
  await p.sleep(800);
  const route = await p.ev(`(() => { const pn = document.querySelector('.lbr-panel'); if (!pn) return null; const r = pn.getBoundingClientRect(); const at = document.elementFromPoint((r.left + r.right) / 2, Math.min(innerHeight - 2, r.top + 20));
    return { hidden: pn.hidden, box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], onTop: !!at && pn.contains(at), sizes: [...pn.querySelectorAll('input, button')].map((e) => Math.round(e.getBoundingClientRect().height)) }; })()`);
  p.check('the model route\'s panel opens, inside the window, and on top where it opens', route && !route.hidden && route.box[0] >= 0 && route.box[2] <= width && route.box[3] > route.box[1] + 100 && route.onTop, JSON.stringify(route));
  await p.step('the model route\'s panel open');
  await pixelRules('the model route\'s panel open');
  await p.key('Escape');
  await p.sleep(500);
  console.log(`pixel rules: ${shots.n} shots read; gold found in ${shots.gold}, a text under 4.5 to 1 in ${shots.contrast}`);

  /* ---- 8. the plate (1.08): exported at 1920 from M87*, its PNG read. Its pixels do not depend on the window, so
     it runs at the wide width only. 3840 is the same code at u = 2 and is not driven (four times the trace). ---- */
  if (!phone) {
    await p.go(`${base}/labs/bh_animation_page.html?o=m87`);
    await p.until(`!!(window.__bh && window.__bh.renderer) && !!document.getElementById('bh-png')`, READY_MS);
    await p.sleep(3000);
    const t0 = Date.now();
    await p.ev(`(window.__bhPng = null, window.__bhSaved = '', document.getElementById('bh-png').click(), true)`);
    const made = await p.until(`!!window.__bhPng || /failed/.test(document.getElementById('bh-actnote').textContent)`, PLATE_MS);
    const secs = (Date.now() - t0) / 1000, note = await p.ev(`document.getElementById('bh-actnote').textContent`);
    const name = await p.ev('window.__bhSaved || ""');
    p.check(`the 1920 plate is made and offered as a file named for its state (${secs.toFixed(1)} s)`,
      made && /saved/.test(note) && /^kerr-m87-a0\.940-i\d+-1920px\.png$/.test(name), `${note} | ${name}`);
    const b64 = await p.ev(`(async () => { const b = window.__bhPng; if (!b) return ''; const a = new Uint8Array(await b.arrayBuffer()); let s = '';
      for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); })()`);
    const shot = await p.shot(`plate-made-${width}`);
    if (b64) {
      const file = path.join(path.dirname(shot), name || 'plate-1920.png');
      writeFileSync(file, Buffer.from(b64, 'base64'));
      const img = pixels(file), band = Math.round(img.w / 1920 * 232);
      const f = readFrame(file, { left: 0, top: 0, right: img.w, bottom: img.h - band }, 1, img);
      p.check('the plate: 1920 px wide, no fully transparent pixel, the picture not a black frame', img.w === 1920 && f.clear === 0 && f.lit >= LIT_SHARE && f.top > 150,
        `${img.w} x ${img.h}, ${f.clear} transparent, ${(f.lit * 100).toFixed(1)}% lit, brightest ${f.top.toFixed(0)}`);
      const k = plateInk(img, img.w, band);
      p.check('the plate: its stamp is drawn, and every word stays inside the frame', k.ink > 2000 && k.right <= k.rightLimit && k.bottom <= k.bottomLimit, JSON.stringify(k));
      console.log(`plate read: ${file}`);
    } else p.check('the plate: its PNG was caught', false);
  }
}
