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

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { standard } from './invariants.mjs';

const LIT_LUMA = 40;        // of 255: brighter than the sky's faintest stars drawn at this size
const LIT_SHARE = 0.01;     // of the canvas's pixels
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

/* Read in the same frames: in a row of controls every label sits at the middle of its box (the import, a label
   styled as a button, set its words 9 px above its neighbours'). */
export const SEG_CENTRED = `(() => {
  const out = [];
  for (const e of document.querySelectorAll('.bh-seg > .bh-btn')) {
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

/* ---- the scenario ---- */

export default async function blackhole(p, { base, width }) {
  const phone = width < 700;
  for (const [n, e] of standard({ gold: { allow: [...GOLD_ALLOW, ...GOLD_DEFERRED] } })) p.invariant(n, e);
  p.invariant('invariant: no target is cut by an ancestor that does not scroll, or by the window', CLIPPED);
  p.invariant('invariant: every label on the render stays inside the window', OVERLAY_INSIDE);
  p.invariant('invariant: on a wide screen every label on the render stays clear of the panels', OVERLAY_CLEAR);
  p.invariant('invariant: a header that sticks over scrolling content has an opaque ground', STICKY_OPAQUE);
  p.invariant('invariant: in a row of controls every label sits at the middle of its box', SEG_CENTRED);
  await p.before(`(${guard})()`);
  console.log(`deferred (review_s2 P3-2, the shared ai/route-panel.js): the gold rules leave out ${GOLD_DEFERRED.join(', ')}`);

  /* the pixel rules, read from one shot after a step (fix_s2_brief C4) */
  const shots = { n: 0, gold: 0, contrast: 0 };
  const pixelRules = async (label) => {
    const b = await p.ev(BOXES([...GOLD_ALLOW, ...GOLD_DEFERRED, ...WARN_ALLOW]));
    const file = await p.shot(`px-${String(++shots.n).padStart(2, '0')}-${width}`);
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
  const sheet = async (open) => {
    if (!phone) return;
    const now = (await p.ev(`document.querySelector('.bh-sheet-h').getAttribute('aria-expanded')`)) === 'true';
    if (now !== open) { await click('.bh-sheet-h'); await p.sleep(700); }
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
    if (k < 7) await click('#bh-caption button[data-n="next"]');
  }
  p.check('the tour drew its focus ring at the stops that point at something', rings >= 3, `${rings} stops with a ring`);
  await click('#bh-caption button[data-n="exit"]');
  await p.sleep(800);

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
}
