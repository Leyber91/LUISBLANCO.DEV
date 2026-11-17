// Turning the planet until its star shows, and the Solar System drawn at one scale with the system on screen.
// Run with tools/drive.mjs:
//   node tools/drive.mjs tools/drives/orbit.mjs --base http://127.0.0.1:<port> --out <dir> --width 390 --height 844 --timeout 420
//   (and again with --width 1440 --height 900)
//
// What it proves, on the survey page as a visitor meets it:
//   - a sideways turn (one finger on a phone, a drag on a desk) takes the view from the day side to the far side,
//     and there the star is in the picture, beyond the planet's limb, with the night side under it;
//   - on a phone a sideways swipe does not scroll the page, and a swipe down does, without turning the planet;
//   - a drag up stops at the pitch orbit.js allows, and the address then carries the view;
//   - "Solar system" draws the view back until Neptune's orbit is inside it, says where the system falls among
//     the Sun's planets, and drops the sentence about the habitable zone being off the view when it no longer is;
//     pressed again, the view returns to the system's own scale.
// No model is called and nothing leaves the page's own origin: every such request is refused.

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { HOME, PITCH_LIMIT, orbitFrame, pitchMax, farSideYaw } from '../../labs/assets/js/exoplanet/orbit.js';
import { exomaniaRules } from './exomania.mjs';

const STAR = [-0.15, 0.45, 0.85], LENS = 1.5;   // the engine's star and lens (tests/orbit.test.mjs reads both from its source)

/* A screenshot as pixels: 8-bit RGB or RGBA, not interlaced, which is what the browser writes. */
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
  const luma = (x, y) => { const i = (Math.max(0, Math.min(h - 1, Math.round(y))) * w + Math.max(0, Math.min(w - 1, Math.round(x)))) * bpp; return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; };
  /* the mean light of a square, and the brightest point in it */
  const patch = (cx, cy, half) => { let sum = 0, n = 0, top = 0; for (let y = cy - half; y <= cy + half; y++) for (let x = cx - half; x <= cx + half; x++) { const l = luma(x, y); sum += l; n++; if (l > top) top = l; } return { mean: sum / n, top }; };
  return { w, h, luma, patch };
}

/* ---- run inside the page ---- */

function install() {
  const real = window.fetch.bind(window);
  window.fetch = (u, o = {}) => (new URL(typeof u === 'string' ? u : u.url, location.href).origin === location.origin ? real(u, o) : Promise.reject(new TypeError('refused by the drive')));
  return true;
}
/* Where the world is drawn, by the page's own rule (main.js placeWorld): the middle of the free region of sheet A and
   the radius the planet's disc is given there, in CSS pixels of the window. On a desk the region runs across the
   sheet, between the name above and the key and title block below; on a phone it is the middle three fifths of the
   planet's own frame. */
function layout() {
  const $ = (id) => document.getElementById(id);
  const cv = $('exo-canvas').getBoundingClientRect();
  const desk = matchMedia('(min-width: 1101px)').matches;
  const left = cv.left, right = cv.right;
  let top, bottom;
  if (desk) { top = $('ul').getBoundingClientRect().bottom + 8; bottom = Math.min($('key').getBoundingClientRect().top, $('tblock').getBoundingClientRect().top) - 26; }
  else { top = cv.top + cv.height * 0.2; bottom = cv.bottom - cv.height * 0.2; }
  const r = Math.max(60, Math.min((bottom - top) / 2, (right - left) / 2 * 0.9));
  const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.className || e.tagName) : ''; };
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  return { cv: { left: cv.left, top: cv.top, width: cv.width, height: cv.height }, cx, cy, r, desk, under: hit(cx, cy), scrollY: Math.round(scrollY),
    name: ($('ret-name') || {}).textContent || '', cam: new URLSearchParams(location.search).get('cam') };
}
function systemState() {
  const host = document.getElementById('system') || document.querySelector('.sys-wrap').closest('section, div.plate, div');
  const cv = document.querySelector('.sys-cv'), b = document.querySelector('[data-k="solar"]'), r = cv.getBoundingClientRect();
  // the Solar System's scale is a switch: its state is aria-checked, and its lever's side
  return { label: cv.getAttribute('aria-label') || '', cap: (document.querySelector('[data-k="syscap"]') || {}).textContent || '', pressed: b.getAttribute('aria-checked'), on: b.getAttribute('aria-checked') === 'true',
    name: (document.querySelector('[data-k="sysname"]') || {}).textContent || '', rect: { left: r.left, top: r.top, width: r.width, height: r.height }, host: !!host };
}
function press(selector) { const e = document.querySelector(selector); if (!e) return false; e.click(); return true; }
function bring(selector) { const e = document.querySelector(selector); if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; }
function noThanks() { const b = [...document.querySelectorAll('button')].find((x) => /no thanks/i.test(x.textContent)); if (b) b.click(); return true; }

/* ---- the scenario ---- */

export default async function orbit(p, { base, width }) {
  for (const [n, e] of exomaniaRules()) p.invariant(n, e);
  p.frames();   // and no fully transparent pixel in any frame captured (tools/drive.mjs frames)   // after every step: tools/invariants.mjs, as exomania.mjs registers them
  const call = (fn, ...args) => p.ev(`(${fn})(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  const phone = width < 700;
  const NAMED = '(() => { const n = (document.getElementById("ret-name") || {}).textContent; return !!n && n.trim().length > 1 && n.trim() !== "…"; })()';
  const open = async (query = '') => {
    await p.go(`${base}/labs/exomania-survey.html?still${query}`);
    await call(install);
    await p.until(NAMED, 90000);
    await p.until('getComputedStyle(document.querySelector(".search")).opacity === "1"', 15000);   // the instruments have assembled
    await p.sleep(800);
    await call(noThanks);
    await p.ev('(scrollTo(0, 0), true)');
  };
  const view = async () => { const c = (await call(layout)).cam; return c ? c.split(',').map(Number) : null; };
  /* turn the view: one finger on a phone, the mouse on a desk */
  const turn = (x0, y0, x1, y1) => (phone ? p.swipe(x0, y0, x1, y1, { steps: 24 }) : p.drag(x0, y0, x1, y1, { steps: 24 }));
  const far = farSideYaw(STAR), frame = orbitFrame(STAR);
  /* the picture's light at a point of the window, read from a frame taken after the engine has drawn */
  const shoot = async (name, ms = 3500) => { await p.sleep(ms); return pixels(await p.shot(name)); };

  for (const world of ['', '&p=' + encodeURIComponent('WASP-12 b')]) {
    const tag = world ? 'a hot giant close to its star' : 'the world the page opens on';
    const key = world ? 'giant' : 'first';
    await open(world);
    const lay = await call(layout);
    const H = lay.cv.height, y0 = Math.round(lay.cy), x0 = Math.round(lay.cx - 175), dx = Math.round((HOME.yaw - (far - 2 * Math.PI)) / 0.006);
    p.check(`${tag}: the middle of the free region is the canvas, with nothing over it`, lay.under === 'exo-canvas' && lay.cam === null, `${lay.name} | under the pointer: ${lay.under} | cam ${lay.cam}`);
    // where orbit.js puts the star on the far side: straight above the planet's centre, LENS tan(pitch) of the
    // picture's height. The name plate lies over that place, so the star is read as the light it adds there.
    const sy = lay.cy - LENS * Math.tan(HOME.pitch) * H;
    const day = await shoot(`orbit-${key}-day`, 2500);
    const dayDisc = day.patch(lay.cx, lay.cy, 30), dayStar = day.patch(lay.cx, sy, 14);

    // ---- the sideways turn to the far side ----
    await turn(x0, y0, x0 + dx, y0);
    await p.sleep(500);
    const after = await call(layout), v = await view();
    p.check(`${tag}: a sideways turn of ${dx} px puts the camera opposite the star, at the pitch it opened with`, !!v && Math.abs(v[0] - (far - 2 * Math.PI)) < 0.03 && Math.abs(v[1] - HOME.pitch) < 0.011,
      `cam ${JSON.stringify(v)} against yaw ${(far - 2 * Math.PI).toFixed(2)}, pitch ${HOME.pitch}`);
    if (phone) p.check(`${tag}: the sideways swipe did not scroll the page`, after.scrollY === lay.scrollY, `scrollY ${lay.scrollY} then ${after.scrollY}`);
    const night = await shoot(`orbit-${key}-far`);
    const star = night.patch(lay.cx, sy, 14), disc = night.patch(lay.cx, lay.cy, 30);
    const limbGap = (lay.cy - sy) - lay.r, edgeGap = sy - lay.cv.top;
    p.check(`${tag}: on the far side the star is in the picture, above the limb and under the top edge`, star.mean - dayStar.mean > 30 && limbGap > 12 && edgeGap > 12,
      `mean light at the star's place (${Math.round(lay.cx)}, ${Math.round(sy)}): ${dayStar.mean.toFixed(0)} of 255 from the day side, ${star.mean.toFixed(0)} from behind; ${Math.round(limbGap)} px above the limb, ${Math.round(edgeGap)} px under the top edge`);
    p.check(`${tag}: and the planet under it is its night side, darker than the day side was`, disc.mean < dayDisc.mean * 0.5 && disc.mean < 60, `the disc's middle: ${dayDisc.mean.toFixed(0)} by day, ${disc.mean.toFixed(0)} from behind`);

    // ---- past the far side the star leaves the picture again ----
    await turn(x0 + dx, y0, x0 + dx - 110, y0);
    const on = await shoot(`orbit-${key}-past`, 3000), gone = on.patch(lay.cx, sy, 14);
    if (!world) p.check(`${tag}: 0.66 rad further round, the star has left that place`, gone.mean < star.mean - 30, `mean light ${gone.mean.toFixed(0)} where it was ${star.mean.toFixed(0)}`);
  }

  // ---- up and down ----
  await open();
  const lay = await call(layout), y0 = Math.round(lay.cy), xm = Math.round(lay.cx);
  if (phone) {
    await p.swipe(xm, y0 + 60, xm, y0 - 200, { steps: 24 });
    await p.sleep(500);
    const s = await call(layout);
    p.check('on a phone a swipe up the canvas scrolls the page and does not turn or tilt the planet', s.scrollY > 100 && s.cam === null, `scrollY ${s.scrollY}, cam ${s.cam}`);
    await p.ev('(scrollTo(0, 0), true)');
    await p.sleep(300);
    // a swipe that starts sideways is the page's for its whole length: its downward part tilts the view
    await p.swipe(xm - 120, y0, xm + 60, y0 + 120, { steps: 24 });
    await p.sleep(500);
    const t = await call(layout), tv = t.cam ? t.cam.split(',').map(Number) : null;
    p.check('a swipe that starts sideways and bends down turns and tilts the view, and the page stays where it is', !!tv && Math.abs(tv[0] - (HOME.yaw - 180 * 0.006)) < 0.05 && tv[1] > HOME.pitch + 0.3 && t.scrollY === 0, `cam ${t.cam}, scrollY ${t.scrollY}`);
  } else {
    await p.drag(xm, y0 - 150, xm, y0 + 250, { steps: 30 });
    await p.sleep(500);
    const up = await view();
    p.check('a long drag down stops at the pitch the circle allows, short of the roll at the scene\'s pole', !!up && Math.abs(up[1] - pitchMax(STAR)) < 0.006 && up[1] < PITCH_LIMIT - frame.tilt + 0.006, `pitch ${up && up[1]} against ${pitchMax(STAR).toFixed(3)}`);
    // each drag starts inside the free region, where the pointer is over the canvas
    await p.drag(xm, y0 + 100, xm, y0 - 250, { steps: 30 });
    await p.drag(xm, y0 + 100, xm, y0 - 250, { steps: 30 });
    await p.sleep(500);
    const dn = await view();
    p.check('and a long drag up stops at the same pitch below', !!dn && Math.abs(dn[1] + pitchMax(STAR)) < 0.006, `pitch ${dn && dn[1]}`);
    await shoot('orbit-low', 2500);
  }

  // ---- the Solar System at one scale with the system ----
  await open('&p=' + encodeURIComponent('TRAPPIST-1 e'));
  await call(bring, '.sys-cv');
  await p.sleep(600);
  const s0 = await call(systemState);
  const reach = (label) => { const m = label.match(/the view reaches ([\d.,]+) AU/); return m ? Number(m[1].replace(/,/g, '')) : NaN; };
  p.check('the system view says how far it reaches, and for seven planets inside 0.07 AU that is under 0.3 AU', /TRAPPIST-1, 7 planets/.test(s0.name) && reach(s0.label) > 0.03 && reach(s0.label) < 0.3 && s0.pressed === 'false', `${s0.name} | ${s0.label}`);
  await shoot('system-own', 800);
  await call(press, '[data-k="solar"]');
  await p.sleep(1200);
  const s1 = await call(systemState);
  p.check('"Solar system" draws the view back until Neptune\'s orbit is inside it', s1.pressed === 'true' && s1.on && Math.abs(reach(s1.label) - 33) < 0.6 && /with the orbits of the Sun.s planets/.test(s1.label), s1.label);
  p.check('and says where the system falls among the Sun\'s planets', /\[REAL\] On the scale of the Solar System, the outermost known orbit of TRAPPIST-1 reaches 0\.06\d AU, inside the orbit of Mercury \(0\.39 AU\)\./.test(s1.cap), s1.cap);
  p.check('the habitable zone is in the view then, and no sentence says it is off it', !/off this view/.test(s1.cap), s1.cap);
  const solar = await shoot('system-solar', 800);
  // Neptune's orbit: a dotted ring at 30.18 / 32.59 of the way out; the ring's band is lighter than the band just outside it
  const R = Math.max(8, Math.min(s1.rect.width, s1.rect.height) / 2 - 10), mx = s1.rect.left + s1.rect.width / 2, my = s1.rect.top + s1.rect.height / 2;
  const band = (rad) => { let lit = 0; for (let a = 0; a < 720; a++) { const t = a * Math.PI / 360; let top = 0; for (const d of [-1, 0, 1]) top = Math.max(top, solar.luma(mx + (rad + d) * Math.cos(t), my + (rad + d) * Math.sin(t))); if (top > 26) lit++; } return lit; };
  const ring = band(R * 30.18 / 32.59), outside = band(R * 0.975), inside = band(R * 0.80);
  p.check('Neptune\'s orbit is drawn inside the canvas: its ring is dotted with light, the bands beside it are not', ring > 30 && ring > 8 * Math.max(outside, inside, 1), `${ring} of 720 directions lit on the ring, ${inside} inside it, ${outside} outside`);
  await call(press, '[data-k="solar"]');
  await p.sleep(1200);
  const s2 = await call(systemState);
  p.check('pressed again, the view returns to the system\'s own scale and the sentence goes', s2.pressed === 'false' && reach(s2.label) === reach(s0.label) && !/On the scale of the Solar System/.test(s2.cap) && s2.cap === s0.cap, s2.label);

  // a system whose habitable zone is far outside its planets: the sentence about it follows the view
  await open('&p=' + encodeURIComponent('WASP-12 b'));
  await call(bring, '.sys-cv');
  const w0 = await call(systemState);
  await call(press, '[data-k="solar"]');
  await p.sleep(400);
  const w1 = await call(systemState);
  p.check('where the habitable zone lies off the system\'s own view, the caption says so, and stops saying so when the Solar System\'s scale brings it in', /off this view/.test(w0.cap) && !/off this view/.test(w1.cap) && /inside the orbit of Mercury/.test(w1.cap), `${w0.cap} || ${w1.cap}`);
  // the scale the visitor chose stays when another world is opened
  await call(press, '#btn-random');
  await p.sleep(1500);
  const w2 = await call(systemState);
  p.check('the next world opens at the scale the visitor left on', w2.pressed === 'true' && reach(w2.label) >= 32.5 && /On the scale of the Solar System, the outermost known orbit of /.test(w2.cap) && w2.name !== w1.name, `${w2.name} | ${w2.label}`);
}
