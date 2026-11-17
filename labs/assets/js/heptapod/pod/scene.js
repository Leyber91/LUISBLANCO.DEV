/* ============================================================
   heptapod/pod/scene.js — the chamber.

   Material and motion (written before the code, the labs-design
   method; restaged by road item 1.07 under decision H8 and the
   direction of 2026-11-17: the feeling of being in the room, and
   modern):

   The room is dark and large, and almost nothing in it gives light.
   The one thing that does is a disc of fog hanging beyond the glass:
   the being's air, held in a circle, lit from inside. That disc is
   the focal living element. Everything the being says happens in it,
   as ink in the fog: dark where the ink is, light where the fog
   shows through, never darker than about half of the fog's light.
   The fog moves only inside the disc, and it stirs harder while the
   being writes.

   The move that must land: a ring condenses. Its ink arrives as a
   haze across the whole disc and gathers into the ring everywhere at
   the same rate, so no part of it is written before another, and the
   ring is whole within two seconds. It hangs and breathes, carried a
   little by the fog's slow flow and pulled back into shape. Then it
   thins: every stroke loses the same width each second, so the
   lightest ink goes back into the fog first and the stroke the being
   pressed on is the last thing left (pod/medium.js computes this).

   The being stands in the dark beside the disc, taller than the room
   shows. It gives no light of its own. The disc lights the side of
   its body that faces it, and the growth lines of its body show only
   where that light falls. One more light moves on it: its gaze, a
   glow on the side facing what it attends to (the thing in your hand,
   the ring it is writing, your slate). Its outline, its lines and
   where it stands are grown from the species' seed and mean nothing
   more. It never writes with a limb: the ink condenses in the disc.

   On this side of the glass everything is the visitor's and modern:
   a polished black table that reflects the disc, two plates engraved
   as hairlines under one lamp that burns down with the day, and the
   disc's bezel, a ring of ticks every six degrees with the four
   quarters the keys keep marked longer. No view holds a bright glass
   wall, a fog wall behind it and a limb throwing ink (research/ip.md
   rule 7): the glass is dark and shows only as its sill and two faint
   reflections, the fog is a disc, and the being is in the dark.

   Gold appears only when a crop kept a radical.

   One gesture is one act, and one act is one ring. Taking a thing
   always ends with it in the hand, wherever it is let go; a second
   gesture holds it up, sets it down or passes it through the glass.

   Lifecycle: initPod returns { destroy, pause, resume, ... } and is
   mounted through Labs OS (os/scene.js), which pauses it while the
   tab is hidden or the canvas is off screen. At rest it redraws the
   fog and the breathing ink about twenty times a second; with motion
   reduced it draws only when something changes, and a ring appears
   whole.
   ============================================================ */

import { drawInk, fitCanvas, palette, prefersReduced } from '../render.js';
import { Tier } from '../stage.js';
import { mulberry32 } from '../raster.js';
import { OBJECTS, OBJ } from './world.js';
import { seedOf } from './species.js';
import { ringSpec, podStrokes, recognise, sectorRect, INK } from './ring.js';
import { DAY, GREETING, whereIs, freeSlot } from './day.js';
import { drawObject, drawShadow, objW, objH, THING_NAME } from './objects.js';
import { InkField, MEDIUM, fogNoise } from './medium.js';
import { ringGraph, soloGraph, podFigure, recogniseInked, sectorRectInked, inkedTarget } from './inked.js';

export const TIME = { bloom: 2200, hang: 4000, thin: 3400, slate: 2800, giveOut: 640, giveBack: 760, flash: 700 };
/* The disc holds the ring with room for its longest threads: the disc's radius over the ring's. */
export const DISC_OVER_RING = 1.72;
const SPAN = 2 * DISC_OVER_RING;        // the field's side, in ring radii
const FOG_Q = 2;                         // the fog is drawn at half size and scaled up
const INK_RGB = [7, 9, 13];              // what the ink lets through is the fog's own light: this is the absorber
const INK_SPREAD = 1.5;                  // a ring-script stroke's width in the fog, over its width on the bench
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a.toFixed(3)})`;
const HORIZON = [159, 179, 214];

export function initPod(canvas, hooks) {
  const { sp } = hooks;
  const script = hooks.script === 'inked' ? 'inked' : 'ring';
  const P = palette();
  const reduced = hooks.reduced ?? prefersReduced();   // the platform's scene lifecycle passes it in
  const rnd = mulberry32(seedOf('body', sp.target, sp.seed));
  const body = {
    side: rnd() < 0.5 ? -1 : 1,
    lobes: [[2, 0.1], [3, 0.13], [5, 0.07], [7, 0.04]].map(([k, a]) => ({ k, a: a * (0.7 + 0.6 * rnd()), ph: rnd() * Math.PI * 2 })),
    // its folds: lines that run down the body between its two sides, each from a seeded place across it
    folds: Array.from({ length: 11 }, () => ({ u: -0.92 + 1.84 * rnd(), t0: 0.03 + 0.12 * rnd(), len: 0.5 + 0.45 * rnd(), amp: 0.015 + 0.035 * rnd(), ph: rnd() * Math.PI * 2, f: 2 + 4 * rnd() })),
  };
  const fogSeed = seedOf('fog', sp.target, sp.seed);

  /* offscreen layers */
  const fogTex = document.createElement('canvas');           // the fog's texture, tileable, seeded
  {
    const n = 256, v = fogNoise(fogSeed, n), c = fogTex.getContext('2d'), img = c.createImageData(n, n);
    fogTex.width = fogTex.height = n;
    for (let i = 0; i < n * n; i++) { img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = v[i]; img.data[4 * i + 3] = 255; }
    c.putImageData(img, 0, 0);
  }
  const discCv = document.createElement('canvas');           // fog and ink, at full size
  const maskCv = document.createElement('canvas');           // the disc's soft edge
  const inkCv = document.createElement('canvas');            // the ink field, one pixel a cell
  const targetCv = document.createElement('canvas');         // where a ring-script ring's ink belongs
  let fogPat = null, field = null, inkImg = null, inkPx = null;

  let L = null;                      // layout, device pixels
  let raf = 0, timer = 0, running = true, dead = false, lastT = 0, fogT = 0, stir = 1;
  const vis = {};                    // thing -> { x, y, k, a }
  let drag = null, pointer = null, pointerAt = -1e9;
  let ink = null;                    // { w (writing), act, t0, still, crop, hang }
  let targetKey = '', inkBlank = true;
  const gaze = { x: 0, y: 1, tx: 0, ty: 1, lean: 0 };
  let slate = null, flash = null, hover = null, enabled = true, sel = 0, keys = false;
  const givers = [];
  const figs = new Map();
  let lastKeep = null;               // what the last crop read, for the drive

  /* ---------------- what is written: the ring script, or the inked one behind its switch ---------------- */
  function writing(spec) {
    if (script === 'inked' && spec.pod) {
      const key = spec.pod.solo ? 's:' + spec.pod.solo : 'r:' + spec.pod.scene;
      if (!figs.has(key)) {
        const g = spec.pod.solo ? soloGraph(sp, spec.pod.solo) : ringGraph(sp, spec.pod.scene < 0 ? sp.greeting.ids : sp.rings[spec.pod.scene].ids);
        figs.set(key, podFigure(g));
      }
      const fig = figs.get(key);
      if (fig.ok) return { kind: 'inked', spec, fig, id: key };
    }
    return { kind: 'ring', spec, strokes: podStrokes(spec), id: 'ring' };
  }
  const recogniseW = (w, rect, erode) => (w.kind === 'inked' ? recogniseInked(w.fig, rect, erode) : recognise(w.spec, rect, erode));
  const sectorW = (w, role) => (w.kind === 'inked' ? sectorRectInked(w.fig, role) : sectorRect(w.spec, role));

  /* ---------------- layout ---------------- */
  function layout() {
    const { w: W, h: H } = fitCanvas(canvas);
    const portrait = H > W * 1.05;
    const Rd = Math.round(portrait ? Math.min(0.43 * W, 0.26 * H) : Math.min(0.26 * H, 0.3 * W));
    const disc = { cx: W / 2, cy: Math.round(0.045 * H + Rd), Rd };
    const glassB = Math.round(disc.cy + Rd + 0.03 * H);
    const u = Math.min(H * 0.125, W * 0.1);
    const near = { place: 'near', cx: W / 2, cy: Math.max(0.735 * H, glassB + 0.11 * H), rx: Math.min(0.31 * W, 4.3 * u), ry: 0.02 * H, k: 0.84 };
    const far = { place: 'far', cx: W / 2, cy: 0.915 * H, rx: Math.min(0.43 * W, 5.8 * u), ry: 0.046 * H, k: 1 };
    const dpr = W / Math.max(1, canvas.getBoundingClientRect().width);
    const rb = portrait ? 0.34 * W : Math.min(0.2 * W, 0.62 * glassB);
    L = {
      W, H, glassB, u, near, far, disc, dpr, portrait,
      ring: { cx: disc.cx, cy: disc.cy, R: Rd / DISC_OVER_RING },
      // heights of a held thing's base: above z.give it goes through the glass, then held near, set down near,
      // held far, set down far. A thing at rest in the hand sits in the middle of its "held" band.
      z: { give: glassB - 0.04 * H, nearDown: near.cy - 0.03 * H, split: near.cy + 0.022 * H, farDown: far.cy - 0.053 * H },
      hoverY: { near: near.cy - near.ry - 0.95 * u * near.k, far: far.cy - far.ry - 0.6 * u },
      body: { x: disc.cx + body.side * (Rd + (portrait ? 0.42 : 1.06) * rb), y: 0.55 * glassB, r: rb },
    };
    const D = 2 * Rd;
    if (discCv.width !== D) {
      discCv.width = discCv.height = D;
      maskCv.width = maskCv.height = D;
      const m = maskCv.getContext('2d');
      const g = m.createRadialGradient(Rd, Rd, 0, Rd, Rd, Rd);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.74, 'rgba(0,0,0,1)'); g.addColorStop(0.9, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      m.clearRect(0, 0, D, D); m.fillStyle = g; m.fillRect(0, 0, D, D);
      fogPat = null;
    }
    // the ink field: about 0.8 cells per CSS pixel of the disc, fewer on the light tier
    const N = clamp(Math.round(((2 * Rd) / dpr) * (Tier.name === 'lite' ? 0.55 : 0.8)), 160, 360);
    if (!field || field.N !== N) {
      field = new InkField(N, fogSeed);
      inkCv.width = inkCv.height = N;
      targetCv.width = targetCv.height = N;
      inkImg = inkCv.getContext('2d').createImageData(N, N);
      inkPx = new Uint32Array(inkImg.data.buffer);
      targetKey = '';
    }
  }
  const plate = (place) => L[place];
  const slotX = (pl, s) => pl.cx + ((s - 2.5) / 3) * pl.rx * 0.86;
  const slotY = (pl) => pl.cy + pl.ry * 0.15;
  const slotAt = (pl, x) => clamp(Math.round(((x - pl.cx) / (pl.rx * 0.86)) * 3 + 2.5), 0, DAY.SLOTS - 1);
  const clampX = (x, pl) => clamp(x, pl.cx - pl.rx * 0.9, pl.cx + pl.rx * 0.9);
  const depthK = (y) => L.near.k + (1 - L.near.k) * clamp((y - L.hoverY.near) / (slotY(L.far) - L.hoverY.near), 0, 1);
  const inDisc = (p) => Math.hypot(p.x - L.disc.cx, p.y - L.disc.cy) < L.disc.Rd;

  /* What releasing a held thing does, by the height of its base. */
  function zoneAt(y) {
    if (y < L.z.give) return { kind: 'give', place: 'near' };
    if (y < L.z.nearDown) return { kind: 'hold', place: 'near' };
    if (y < L.z.split) return { kind: 'putdown', place: 'near' };
    if (y < L.z.farDown) return { kind: 'hold', place: 'far' };
    return { kind: 'putdown', place: 'far' };
  }
  /* What letting go would do now. Nothing while a thing is being taken: taking it is the whole gesture. */
  const dragZone = () => (drag && drag.kind === 'thing' && drag.lifted && !drag.fresh ? zoneAt(drag.p.y + drag.dy) : null);
  /* The hand comes to rest over a plate without an act. */
  function rest(place, x) { hover = { x: clampX(x, plate(place)), place }; hooks.carry?.(place); }

  /* Where each thing should be, from the record and the hand. */
  function targetOf(obj, st) {
    if (drag && drag.kind === 'thing' && drag.obj === obj) {
      const y = drag.p.y + drag.dy;
      return { x: drag.p.x + drag.dx, y, k: depthK(y), tau: OBJECTS[obj].size === 'large' ? 105 : 55 };
    }
    if (st.held && st.held.obj === obj) {
      const pl = plate(hover ? hover.place : st.held.over);
      return { x: hover ? hover.x : slotX(pl, st.held.slot ?? 2), y: L.hoverY[pl.place], k: pl.k, tau: OBJECTS[obj].size === 'large' ? 230 : 150 };
    }
    const at = whereIs(st, obj);
    if (!at) return null;
    const pl = plate(at.place);
    return { x: slotX(pl, at.slot), y: slotY(pl), k: pl.k, tau: OBJECTS[obj].size === 'large' ? 210 : 140 };
  }
  function snap() {
    const st = hooks.getState();
    for (const o of OBJ) { const t = targetOf(o, st); if (t) vis[o] = { x: t.x, y: t.y, k: t.k, a: 1 }; }
  }

  /* ---------------- the ink: its phase in time, and the field's target ---------------- */
  function phaseOf(k, now) {
    if (!k) return null;
    if (k.still) return { p: 1, erode: 0, crop: k.crop !== false, thinning: false, forming: now - k.t0 < TIME.bloom };
    const t = now - k.t0;
    if (reduced) {                  // no motion: the whole ring at once, a longer hang, then three still steps
      const rest = Math.max(9000, k.hang);
      if (t < rest) return { p: 1, erode: 0, crop: true, thinning: false, forming: false };
      const step = Math.floor((t - rest) / 1300);
      return step >= 3 ? null : { p: 1, erode: INK.ERODE_MAX * (step + 1) / 4, crop: true, thinning: true, forming: false };
    }
    if (t < TIME.bloom) return { p: ease(t / TIME.bloom), erode: 0, crop: t / TIME.bloom > 0.55, thinning: false, forming: true };
    if (t < TIME.bloom + k.hang) return { p: 1, erode: 0, crop: true, thinning: false, forming: false };
    const f = (t - TIME.bloom - k.hang) / TIME.thin;
    return f >= 1 ? null : { p: 1, erode: INK.ERODE_MAX * f, crop: true, thinning: true, forming: false };
  }
  function put(spec, act, opts = {}) {
    ink = { w: writing(spec), act, t0: performance.now(), still: !!opts.still, crop: opts.crop, hang: opts.hang ?? TIME.hang };
    targetKey = '';
    kick();
  }
  /* The field's target: the ring's ink at this moment of its thinning (24 steps over the thinning). */
  function syncTarget(ph) {
    const N = field.N;
    const q = ph ? Math.round((ph.erode / INK.ERODE_MAX) * 24) : -1;
    const key = ink && ph ? `${ink.t0}|${q}` : 'none';
    if (key === targetKey) return;
    const fresh = !targetKey.startsWith(ink && ph ? `${ink.t0}|` : '\u0000');
    targetKey = key;
    if (!ink || !ph) { field.clear(); if (reduced) field.snap(); return; }
    const erode = (q / 24) * INK.ERODE_MAX;
    let T;
    if (ink.w.kind === 'inked') T = inkedTarget(ink.w.fig, N, SPAN, erode);
    else {
      const c = targetCv.getContext('2d', { willReadFrequently: true });
      c.clearRect(0, 0, N, N);
      // ink in fog spreads: the strokes are laid half again as wide (the thinning still ends each stroke when its
      // own width is used up, as the crop reader counts it)
      drawInk(c, ink.w.strokes, { s: N / SPAN, ox: N / 2, oy: N / 2 }, { p: 1, erode, color: '#ffffff', minW: 1, widthScale: INK_SPREAD });
      const a = c.getImageData(0, 0, N, N).data;
      T = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) T[i] = a[4 * i + 3] / 255;
    }
    field.setTarget(T, fresh && !reduced);
    if (reduced) field.snap();
  }

  /* ---------------- drawing: beyond the glass ---------------- */
  /* A point of the outline at angle a (0 at the top, clockwise), its lobes from the species' seed. */
  function outlineAt(bx, by, r, a) {
    let k = 1;
    for (const l of body.lobes) k += l.a * Math.cos(l.k * a + l.ph);
    return [bx + r * k * 0.8 * Math.sin(a), by - r * k * 1.5 * Math.cos(a)];
  }
  function bodyPath(c, bx, by, r) {
    c.beginPath();
    for (let d = 0; d <= 360; d += 4) {
      const a = d * Math.PI / 180;
      let k = 1;
      for (const l of body.lobes) k += l.a * Math.cos(l.k * a + l.ph);
      const x = bx + r * k * 0.8 * Math.sin(a), y = by - r * k * 1.5 * Math.cos(a);
      if (d) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
  }
  function drawBeyond(ctx) {
    const { W, H, glassB, disc } = L;
    // the far dark, a little less dark toward the floor the disc lights
    const room = ctx.createLinearGradient(0, 0, 0, glassB);
    room.addColorStop(0, '#04060A'); room.addColorStop(1, '#090C12');
    ctx.fillStyle = room; ctx.fillRect(0, 0, W, glassB);
    // the disc's light in the air around it, and on the floor beneath it
    const air = ctx.createRadialGradient(disc.cx, disc.cy, disc.Rd * 0.8, disc.cx, disc.cy, disc.Rd * 2.9);
    air.addColorStop(0, rgba(HORIZON, 0.085)); air.addColorStop(0.4, rgba(HORIZON, 0.03)); air.addColorStop(1, rgba(HORIZON, 0));
    ctx.fillStyle = air; ctx.fillRect(0, 0, W, glassB);
    ctx.save();
    ctx.translate(disc.cx, glassB - 0.004 * H); ctx.scale(1, 0.055 * H / (1.7 * disc.Rd));
    const fl = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.7 * disc.Rd);
    fl.addColorStop(0, rgba(HORIZON, 0.075)); fl.addColorStop(1, rgba(HORIZON, 0));
    ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(0, 0, 1.7 * disc.Rd, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // the being, in the dark
    const lean = gaze.lean;
    const bx = L.body.x - body.side * lean * 0.025 * W + gaze.x * L.body.r * 0.04, by = L.body.y + gaze.y * L.body.r * 0.02, r = L.body.r * (1 + 0.025 * lean);
    ctx.save();
    bodyPath(ctx, bx, by, r);
    ctx.fillStyle = '#020305'; ctx.fill();
    ctx.clip();
    const lit = (a0, a1) => {
      const g = ctx.createRadialGradient(disc.cx, disc.cy, disc.Rd * 0.9, disc.cx, disc.cy, disc.Rd * 0.9 + 1.25 * r);
      g.addColorStop(0, rgba(HORIZON, a0)); g.addColorStop(0.3, rgba(HORIZON, a1)); g.addColorStop(1, rgba(HORIZON, 0));
      return g;
    };
    ctx.fillStyle = lit(0.2, 0.05); ctx.fillRect(bx - 1.5 * r, 0, 3 * r, glassB);
    // its folds, seen only where the disc's light reaches: each runs from top to foot between the two sides
    ctx.strokeStyle = lit(0.42, 0.08); ctx.lineWidth = Math.max(1, 0.9 * L.dpr);
    for (const f of body.folds) {
      ctx.beginPath();
      for (let i = 0; i <= 28; i++) {
        const t = f.t0 + (f.len * i) / 28, a = Math.PI * t;
        const [xr, yr] = outlineAt(bx, by, r, a), [xl, yl] = outlineAt(bx, by, r, 2 * Math.PI - a);
        const w = (f.u + 1) / 2, x = xl + (xr - xl) * w + f.amp * r * Math.sin(f.f * t * Math.PI + f.ph), y = yl + (yr - yl) * w;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // its gaze: light on the side of the body that faces what it attends to
    const lx = bx + gaze.x * r * 0.75, ly = by + gaze.y * r * 1.2;
    const gz = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.9);
    gz.addColorStop(0, rgba(HORIZON, 0.2 + 0.12 * lean)); gz.addColorStop(1, rgba(HORIZON, 0));
    ctx.fillStyle = gz; ctx.fillRect(bx - 1.5 * r, 0, 3 * r, glassB);
    ctx.restore();
    // its edge where the disc's light grazes it
    ctx.save();
    bodyPath(ctx, bx, by, r);
    ctx.strokeStyle = lit(0.62, 0.14); ctx.lineWidth = Math.max(1, 1.2 * L.dpr); ctx.stroke();
    ctx.restore();
  }

  function drawDisc(ctx) {
    const { disc } = L, D = discCv.width, Rd = disc.Rd;
    const c = discCv.getContext('2d');
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.clearRect(0, 0, D, D);
    // the fog gives light from inside: brightest a little above its centre
    const base = c.createRadialGradient(Rd * 0.94, Rd * 0.86, 0, Rd, Rd, Rd);
    base.addColorStop(0, '#D3D9E3'); base.addColorStop(0.45, '#B0B8C5'); base.addColorStop(0.8, '#6E7786'); base.addColorStop(1, '#2A303A');
    c.fillStyle = base; c.fillRect(0, 0, D, D);
    // its body: one texture at two scales, each carried its own way
    if (!fogPat) fogPat = c.createPattern(fogTex, 'repeat');
    if (fogPat && typeof DOMMatrix === 'function' && fogPat.setTransform) {
      c.globalCompositeOperation = 'soft-light';
      for (const [sc, vx, vy, a] of [[1.35, 0.011, 0.004, 0.55], [0.62, -0.007, 0.01, 0.38]]) {
        const s = (D / 256) * sc;
        fogPat.setTransform(new DOMMatrix().translate(fogT * vx * Rd + (sc > 1 ? 0 : 37), fogT * vy * Rd).scale(s));
        c.globalAlpha = a; c.fillStyle = fogPat; c.fillRect(0, 0, D, D);
      }
      c.globalAlpha = 1;
    }
    // the ink: what it takes from the fog's light
    c.globalCompositeOperation = 'source-over';
    if (!inkBlank) { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(inkCv, 0, 0, D, D); }
    // the fog ends softly at the disc's edge
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(maskCv, 0, 0);
    c.globalCompositeOperation = 'source-over';
    ctx.drawImage(discCv, disc.cx - Rd, disc.cy - Rd);
    // the bezel: the visitor's instrument around it, a tick every 6 degrees, the four quarters the keys keep longer
    const br = Rd * 1.045;
    ctx.save();
    ctx.lineWidth = Math.max(1, L.dpr * 0.8);
    ctx.strokeStyle = P.lineB; ctx.beginPath(); ctx.arc(disc.cx, disc.cy, br, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (let d = 0; d < 360; d += 6) {
      if (d % 90 === 0) continue;
      const a = d * Math.PI / 180, s = Math.sin(a), co = -Math.cos(a), l = (d % 30 === 0 ? 0.03 : 0.016) * Rd;
      ctx.moveTo(disc.cx + s * br, disc.cy + co * br); ctx.lineTo(disc.cx + s * (br + l), disc.cy + co * (br + l));
    }
    ctx.strokeStyle = P.faint; ctx.stroke();
    ctx.beginPath();
    for (let d = 0; d < 360; d += 90) {
      const a = d * Math.PI / 180, s = Math.sin(a), co = -Math.cos(a);
      ctx.moveTo(disc.cx + s * (br - 0.025 * Rd), disc.cy + co * (br - 0.025 * Rd)); ctx.lineTo(disc.cx + s * (br + 0.06 * Rd), disc.cy + co * (br + 0.06 * Rd));
    }
    ctx.strokeStyle = keys ? P.horizon : P.horizonDim; ctx.stroke();
    ctx.restore();
  }

  /* ---------------- drawing: the glass and this side ---------------- */
  function drawGlass(ctx) {
    const { W, H, glassB } = L;
    ctx.save();                                                       // two faint reflections: it is glass
    ctx.globalAlpha = 0.022; ctx.fillStyle = P.ink;
    for (const [a, b] of [[0.2, 0.27], [0.31, 0.322]]) { ctx.beginPath(); ctx.moveTo(a * W, 0); ctx.lineTo(b * W, 0); ctx.lineTo((b - 0.12) * W, glassB); ctx.lineTo((a - 0.12) * W, glassB); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    const lip = ctx.createLinearGradient(0, glassB - 0.025 * H, 0, glassB);
    lip.addColorStop(0, rgba(HORIZON, 0)); lip.addColorStop(1, rgba(HORIZON, 0.05));
    ctx.fillStyle = lip; ctx.fillRect(0, glassB - 0.025 * H, W, 0.025 * H);
  }
  function drawTable(ctx) {
    const { W, H, glassB, disc } = L;
    const t = ctx.createLinearGradient(0, glassB, 0, H);
    t.addColorStop(0, '#0C1018'); t.addColorStop(0.3, '#080B11'); t.addColorStop(1, '#06080D');
    ctx.fillStyle = t; ctx.fillRect(0, glassB, W, H - glassB);
    // the disc on the polished table, foreshortened, fading with distance from the sill
    const k = 0.32;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, glassB, W, H - glassB); ctx.clip();
    ctx.globalAlpha = 0.13;
    ctx.translate(disc.cx, glassB + k * (glassB - disc.cy)); ctx.scale(1, -k);
    ctx.drawImage(discCv, -disc.Rd, -disc.Rd);
    ctx.restore();
    const fade = ctx.createLinearGradient(0, glassB, 0, glassB + 0.75 * k * 2 * disc.Rd + 0.05 * H);
    fade.addColorStop(0, 'rgba(6, 8, 13, 0)'); fade.addColorStop(1, 'rgba(6, 8, 13, 1)');
    ctx.fillStyle = fade; ctx.fillRect(0, glassB, W, H - glassB);
    // the sill: where the glass meets the table
    const sill = ctx.createLinearGradient(0, glassB, 0, glassB + 0.06 * H);
    sill.addColorStop(0, rgba(HORIZON, 0.06)); sill.addColorStop(1, rgba(HORIZON, 0));
    ctx.fillStyle = sill; ctx.fillRect(0, glassB, W, 0.06 * H);
    ctx.fillStyle = dragZone()?.kind === 'give' ? P.horizon : P.lineB;
    ctx.fillRect(0, glassB, W, Math.max(1, Math.round(L.dpr)));
  }
  function drawDesk(ctx, st, now) {
    const lamp = 1 - 0.5 * Math.min(1, st.acts.length / DAY.ACTS);
    const target = dragZone();
    for (const pl of [L.near, L.far]) {
      ctx.save();
      ctx.translate(pl.cx, pl.cy); ctx.scale(1, (pl.ry * 2.6) / pl.rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, pl.rx * 1.25);
      g.addColorStop(0, `rgba(234, 240, 251, ${(0.1 * lamp).toFixed(3)})`); g.addColorStop(1, 'rgba(234, 240, 251, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, pl.rx * 1.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(pl.cx, pl.cy, pl.rx, pl.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(14, 18, 26, .7)'; ctx.fill();
      ctx.strokeStyle = target && target.kind === 'putdown' && target.place === pl.place ? P.horizon : P.lineB;
      ctx.lineWidth = Math.max(1, L.dpr); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(pl.cx, pl.cy, pl.rx * 0.97, pl.ry * 0.82, 0, Math.PI * 0.08, Math.PI * 0.92);   // the engraving's inner line
      ctx.strokeStyle = P.line; ctx.stroke();
    }
    const order = OBJ.filter((o) => vis[o] && vis[o].a > 0.01).sort((a, b) => vis[a].y - vis[b].y);
    for (const o of order) {
      const v = vis[o], u = L.u * v.k;
      const held = (st.held && st.held.obj === o) || (drag && drag.obj === o);
      const pl = v.y < L.z.split ? L.near : L.far;
      const ground = slotY(pl);
      const lift = clamp((ground - v.y) / (1.2 * L.u), 0, 1);
      if (v.y > L.glassB) drawShadow(ctx, o, v.x, ground, u, lift);
      if (held && (target ? target.kind === 'hold' : !(drag && drag.obj === o && !drag.lifted))) {   // the hand under a thing held up
        ctx.strokeStyle = P.horizonDim; ctx.lineWidth = Math.max(1, L.dpr);
        ctx.beginPath(); const hw = objW(o, u) * 0.55; ctx.moveTo(v.x - hw, v.y + u * 0.06); ctx.quadraticCurveTo(v.x, v.y + u * 0.3, v.x + hw, v.y + u * 0.06); ctx.stroke();
      }
      drawObject(ctx, o, v.x, v.y, u, v.a);
    }
    for (const g of givers) {                                      // a thing passing through the glass
      const f = (now - g.t0) / TIME.giveOut;
      if (f < 1) drawObject(ctx, g.obj, g.x, g.y - ease(f) * 0.16 * L.H, L.u * g.k * (1 - 0.25 * f), 1 - f);
    }
    if (keys && st.phase === 'day' && !st.held) {                  // the keyboard's choice of thing
      const things = onPlates(st);
      const o = things[Math.min(sel, things.length - 1)];
      if (o && vis[o]) { const v = vis[o], hw = objW(o, L.u * v.k) * 0.6; ctx.strokeStyle = P.horizon; ctx.lineWidth = Math.max(1, L.dpr); ctx.beginPath(); ctx.moveTo(v.x - hw, v.y + 0.1 * L.u); ctx.lineTo(v.x - hw, v.y + 0.2 * L.u); ctx.lineTo(v.x + hw, v.y + 0.2 * L.u); ctx.lineTo(v.x + hw, v.y + 0.1 * L.u); ctx.stroke(); }
    }
  }
  function drawCrop(ctx, now) {
    const box = (a, b, color, dash, alpha) => {
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y), t = Math.min(12 * L.dpr, w / 3, h / 3);
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, L.dpr);
      if (dash) { ctx.setLineDash([3 * L.dpr, 4 * L.dpr]); ctx.strokeRect(x0, y0, w, h); ctx.setLineDash([]); }
      ctx.lineWidth = Math.max(1.5, 1.5 * L.dpr); ctx.beginPath();
      for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + h, 1, -1], [x0 + w, y0 + h, -1, -1]]) { ctx.moveTo(x + sx * t, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * t); }
      ctx.stroke(); ctx.restore();
    };
    // on the light fog a crop is drawn dark, so it reads; its gold says a radical was kept
    if (drag && drag.kind === 'crop') box(drag.a, drag.b, '#10151D', true, 0.9);
    if (flash) {
      const f = (now - flash.t0) / TIME.flash;
      if (f >= 1) flash = null; else box(flash.a, flash.b, flash.kept ? P.gold : P.dim, false, 1 - f);
    }
  }
  function drawSlate(ctx, now) {
    if (!slate) return;
    const f = (now - slate.t0) / TIME.slate;
    if (f >= 1) { slate = null; return; }
    const a = Math.min(1, f * 8) * Math.min(1, (1 - f) * 5);
    const fs = Math.round(clamp(L.H * 0.032, 12 * L.dpr, 19 * L.dpr));
    ctx.save();
    ctx.font = `500 ${fs}px 'IBM Plex Mono', ui-monospace, monospace`;
    const w = Math.min(L.W * 0.8, ctx.measureText(slate.text).width + fs * 1.6), h = fs * 2, x = L.W / 2 - w / 2, y = L.glassB - h - 0.012 * L.H;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(6, 8, 13, .88)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = P.lineB; ctx.lineWidth = Math.max(1, L.dpr); ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(slate.text, L.W / 2, y + h / 2 + 1, w - fs);
    ctx.restore();
  }

  function frame(now) {
    raf = 0;
    if (dead || !running) return;
    if (!L) layout();
    const dt = lastT ? Math.min(100, now - lastT) : 16;
    lastT = now;
    const st = hooks.getState();
    const ctx = canvas.getContext('2d');
    let moving = false;

    // things ease toward where the record and the hand put them
    for (const o of OBJ) {
      const t = targetOf(o, st);
      const giving = givers.some((g) => g.obj === o);
      if (!t) continue;
      if (!vis[o]) vis[o] = { x: t.x, y: t.y, k: t.k, a: 1 };
      const v = vis[o];
      if (giving) { v.x = t.x; v.y = t.y; v.k = t.k; continue; }
      const kf = reduced ? 1 : 1 - Math.exp(-dt / t.tau);
      v.x += (t.x - v.x) * kf; v.y += (t.y - v.y) * kf; v.k += (t.k - v.k) * kf;
      if (v.a < 1) { v.a = Math.min(1, v.a + dt / 420); moving = true; }
      if (Math.abs(t.x - v.x) + Math.abs(t.y - v.y) > 0.4) moving = true;
    }
    for (let i = givers.length - 1; i >= 0; i--) {
      const g = givers[i], t = now - g.t0;
      if (t < TIME.giveOut + TIME.giveBack) { vis[g.obj].a = 0; moving = true; }
      else { givers.splice(i, 1); moving = true; }
    }

    // the ink: its phase, the field's target, one step of the field
    const ph = phaseOf(ink, now);
    if (!ph && ink && !ink.still) { ink = null; hooks.inkGone?.(); }
    syncTarget(ink ? ph : null);
    // the field is busy while a ring forms or thins, and while the ink of a ring that left is still in the fog
    const busy = !!(ph && (ph.forming || ph.thinning)) || (targetKey === 'none' && !inkBlank);
    const t0 = performance.now();
    if (!reduced) {
      stir += ((busy ? 3 : 1) - stir) * (1 - Math.exp(-dt / 700));    // the fog stirs while the being writes
      fogT += (dt / 1000) * stir;
      if (!inkBlank || field.residual > 0.002 || targetKey !== 'none') {
        field.step(Math.min(0.05, dt / 1000), busy ? MEDIUM.FLOW_FORM : MEDIUM.FLOW_HOLD);
        field.paint(inkPx, INK_RGB);
        inkCv.getContext('2d').putImageData(inkImg, 0, 0);
        inkBlank = targetKey === 'none' && field.residual <= 0.002;
      }
    } else {
      field.paint(inkPx, INK_RGB);
      inkCv.getContext('2d').putImageData(inkImg, 0, 0);
      inkBlank = targetKey === 'none';
    }
    Tier.sample(performance.now() - t0);   // the codec page's rule: a median of 60 over 20 ms takes the light tier

    // where the being looks
    let tx = L.W / 2, ty = slotY(L.near), lean = 0;
    if (slate) { ty = L.glassB - 0.05 * L.H; lean = 1; }
    else if (drag && drag.kind === 'thing') { tx = drag.p.x + drag.dx; ty = drag.p.y + drag.dy - 0.5 * L.u; lean = 0.6; }
    else if (ph && !ink.still && now - ink.t0 < TIME.bloom + Math.min(ink.hang, TIME.hang)) { tx = L.ring.cx; ty = L.ring.cy; lean = 1; }
    else if (st.held && vis[st.held.obj]) { tx = vis[st.held.obj].x; ty = vis[st.held.obj].y - 0.5 * L.u; lean = 0.3; }
    else if (pointer && now - pointerAt < 4000) { tx = pointer.x; ty = pointer.y; }
    const gx = tx - L.body.x, gy = ty - L.body.y, gl = Math.hypot(gx, gy) || 1;
    gaze.tx = gx / gl; gaze.ty = gy / gl;
    const gk = reduced ? 1 : 1 - Math.exp(-dt / 340);
    const before = gaze.x + gaze.y + gaze.lean;
    gaze.x += (gaze.tx - gaze.x) * gk; gaze.y += (gaze.ty - gaze.y) * gk; gaze.lean += (lean - gaze.lean) * gk;
    if (Math.abs(gaze.x + gaze.y + gaze.lean - before) > 0.002) moving = true;

    ctx.fillStyle = P.void; ctx.fillRect(0, 0, L.W, L.H);
    drawBeyond(ctx);
    drawDisc(ctx);
    drawGlass(ctx);
    drawTable(ctx);
    drawSlate(ctx, now);
    drawDesk(ctx, st, now);
    drawCrop(ctx, now);

    if (drag || moving || slate || flash || (!reduced && busy)) kick();
    else if (!reduced) idle(50);                       // at rest the fog drifts and the ink breathes
    else if (ph && !ink.still) idle(250);              // without motion, a ring still has its three steps to take
  }
  function kick() { if (!raf && running && !dead) { clearTimeout(timer); timer = 0; raf = requestAnimationFrame(frame); } }
  function idle(ms) { if (!timer && !raf && running && !dead) timer = setTimeout(() => { timer = 0; kick(); }, ms); }

  /* ---------------- acts ---------------- */
  const onPlates = (st) => ['near', 'far'].flatMap((p) => st.plates[p].filter(Boolean));
  function wrote(rec) {
    if (!rec) return false;
    const st = hooks.getState();
    put(ringSpec(sp, rec.scene, rec.emph), st.acts.length - 1);
    return true;
  }
  function lift(obj) {
    const st = hooks.getState();
    const at = whereIs(st, obj);
    if (!at) return false;
    const rec = hooks.act('lift', { obj });
    if (!rec) return false;
    hover = { x: slotX(plate(at.place), at.slot), place: at.place };
    return wrote(rec);
  }
  function held(kind, place, x) {
    const st = hooks.getState();
    if (!st.held) return false;
    const obj = st.held.obj, pl = plate(place);
    let rec = null;
    if (kind === 'hold') { rec = hooks.act('hold', { place }); if (rec) hover = { x: clampX(x, pl), place }; }
    else if (kind === 'putdown') { rec = hooks.act('putdown', { place, slot: freeSlot(st, place, slotAt(pl, x)) }); if (rec) hover = null; }
    else if (kind === 'give') {
      const v = vis[obj];
      rec = hooks.act('give', {});
      if (rec) { hover = null; if (!reduced && v) givers.push({ obj, t0: performance.now(), x: v.x, y: v.y, k: v.k }); else if (v) v.a = 0; }
    }
    return wrote(rec);
  }

  /* ---------------- crops ---------------- */
  function keep(rect, a, b) {
    const now = performance.now();
    const ph = phaseOf(ink, now);
    if (!ink || !ph || !ph.crop) return;
    const k = recogniseW(ink.w, rect, ph.erode);
    const res = k.cells > 0 ? hooks.crop(ink.act, rect, ph.erode, k) : null;      // no ink under the rectangle: nothing to keep
    lastKeep = { act: ink.act, erode: +ph.erode.toFixed(4), cells: k.cells, roles: k.roles, kept: res ? res.entry.tokens.length : null, rect: [rect.x0, rect.y0, rect.x1, rect.y1].map((v) => +v.toFixed(2)) };
    flash = { a, b, t0: now, kept: !!(res && res.entry.tokens.length) };
    kick();
  }
  function finishCrop(d) {
    const R = L.ring.R, { cx, cy } = L.ring;
    const rect = { x0: (Math.min(d.a.x, d.b.x) - cx) / R, y0: (Math.min(d.a.y, d.b.y) - cy) / R, x1: (Math.max(d.a.x, d.b.x) - cx) / R, y1: (Math.max(d.a.y, d.b.y) - cy) / R };
    if (rect.x1 - rect.x0 < 0.1 || rect.y1 - rect.y0 < 0.1) return;
    keep(rect, d.a, d.b);
  }
  function keepSector(role) {
    if (!ink || !phaseOf(ink, performance.now())?.crop) { hooks.say?.('There is no ring in the disc to keep.'); return; }
    const rect = sectorW(ink.w, role);
    if (!rect) { hooks.say?.('This ring has nothing on that side.'); return; }
    const R = L.ring.R, { cx, cy } = L.ring;
    keep(rect, { x: cx + rect.x0 * R, y: cy + rect.y0 * R }, { x: cx + rect.x1 * R, y: cy + rect.y1 * R });
  }

  /* ---------------- pointer and keys ---------------- */
  const pt = (e) => { const r = canvas.getBoundingClientRect(), k = canvas.width / Math.max(1, r.width); return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }; };
  function thingAt(p) {
    let best = null, bd = Infinity;
    for (const o of OBJ) {
      const v = vis[o];
      if (!v || v.a < 0.5) continue;
      const u = L.u * v.k, hw = Math.max(objW(o, u) / 2 + 0.16 * L.u, 20 * L.dpr), hh = Math.max(objH(o, u) / 2 + 0.16 * L.u, 20 * L.dpr);
      const cx = v.x, cy = v.y - objH(o, u) / 2;
      if (Math.abs(p.x - cx) > hw || Math.abs(p.y - cy) > hh) continue;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  const croppable = () => !!phaseOf(ink, performance.now())?.crop;
  const mine = (e) => !drag || drag.id == null || e.pointerId == null || e.pointerId === drag.id;
  function onDown(e) {
    if (!enabled || !L || drag || (e.button != null && e.button > 0)) return;      // one pointer at a time
    const p = pt(e), st = hooks.getState();
    pointer = p; pointerAt = performance.now(); keys = false;
    const hit = st.phase === 'day' ? thingAt(p) : null;
    if (hit) {
      const inHand = !!(st.held && st.held.obj === hit);
      if (!inHand && st.held) return;                     // one hand
      drag = { kind: 'thing', id: e.pointerId, obj: hit, fresh: !inHand, lifted: inHand, x0: p.x, y0: p.y, dx: vis[hit].x - p.x, dy: vis[hit].y - p.y, p };
    } else if (inDisc(p) && croppable()) drag = { kind: 'crop', id: e.pointerId, a: p, b: p };
    else return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer has no capture */ }
    e.preventDefault();
    kick();
  }
  function onMove(e) {
    if (!L || !mine(e)) return;
    const p = pt(e);
    pointer = p; pointerAt = performance.now();
    if (!drag) {
      const st = hooks.getState();
      canvas.style.cursor = st.phase === 'day' && enabled && thingAt(p) ? 'grab' : inDisc(p) && croppable() ? 'crosshair' : 'default';
      kick();
      return;
    }
    drag.p = p;
    if (drag.kind === 'crop') drag.b = p;
    else if (!drag.lifted && (drag.y0 - p.y > 0.45 * L.u || Math.hypot(p.x - drag.x0, p.y - drag.y0) > 0.75 * L.u)) {
      if (lift(drag.obj)) drag.lifted = true; else drag = null;
    }
    kick();
  }
  function onUp(e) {
    if (!drag || !mine(e)) return;
    const d = drag;
    drag = null;
    // the gesture ends where the pointer is let go: a browser may fold the last moves into the release when frames
    // are slow, and a crop then lost its far corner (found by the drive at 1440 px, 2026-11-17)
    d.p = pt(e);
    if (d.kind === 'crop') { d.b = d.p; finishCrop(d); kick(); return; }
    const x = d.p.x + d.dx, z = zoneAt(d.p.y + d.dy);
    if (!d.lifted && !lift(d.obj)) { kick(); return; }
    if (d.fresh) rest(z.place, x);            // taking it was the act: it stays in the hand, over the plate it was let go above
    else held(z.kind, z.place, x);
    kick();
  }
  /* The system took the pointer away (a scroll, a second finger): nothing was let go, so nothing is done. */
  function onCancel(e) {
    if (!drag || !mine(e)) return;
    const d = drag;
    drag = null;
    const st = hooks.getState();
    if (d.kind === 'thing' && st.held && !hover) hover = { x: slotX(plate(st.held.over), st.held.slot ?? 2), place: st.held.over };
    kick();
  }
  function onKey(e) {
    if (!enabled || !L || e.altKey || e.ctrlKey || e.metaKey) return;
    const st = hooks.getState();
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const sector = { w: 'pred', d: 'patient', s: 'recipient', a: 'agent' }[key];
    if (sector) { keys = true; keepSector(sector); e.preventDefault(); return; }
    if (st.phase !== 'day') return;
    const things = onPlates(st);
    let used = true;
    if (!st.held) {
      if (key === 'ArrowRight') { sel = (Math.min(sel, things.length - 1) + 1) % things.length; hooks.say?.(`${THING_NAME[things[sel]]}, on the plate ${whereIs(st, things[sel]).place === 'near' ? 'at the glass' : 'far from the glass'}.`); }
      else if (key === 'ArrowLeft') { sel = (Math.min(sel, things.length - 1) + things.length - 1) % things.length; hooks.say?.(`${THING_NAME[things[sel]]}, on the plate ${whereIs(st, things[sel]).place === 'near' ? 'at the glass' : 'far from the glass'}.`); }
      else if (key === 'Enter' || key === ' ') lift(things[Math.min(sel, things.length - 1)]);
      else used = false;
    } else {
      const x = hover ? hover.x : L.W / 2, place = hover ? hover.place : st.held.over;
      if (key === 'ArrowUp') held('hold', 'near', x);
      else if (key === 'ArrowDown') held('hold', 'far', x);
      else if (key === 'Enter' || key === ' ') held('putdown', place, x);
      else if (key === 'g') held('give', 'near', x);
      else used = false;
    }
    if (used) { keys = true; e.preventDefault(); kick(); }
  }
  /* A new size (a phone turned, a window dragged): a drag in progress is dropped, and a thing in the hand keeps
     its place across the plate instead of its old pixel. */
  const onResize = () => {
    const w0 = L ? L.W : 0;
    layout();
    if (hover && w0) hover.x = clampX((hover.x * L.W) / w0, plate(hover.place));
    drag = null;
    snap(); kick();
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(canvas);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('keydown', onKey);
  layout(); snap(); kick();

  return {
    script,
    /** The being writes its greeting: the ring of every arrival. */
    greet() { put(ringSpec(sp, GREETING), GREETING, { hang: Infinity }); },   // it stays until the visitor's first act
    /** Put a ring in the disc that stays until replaced (the evening's rings). */
    show(spec) { put(spec, null, { still: true, crop: false }); },
    clear() { if (ink) { ink = null; targetKey = ''; kick(); } },
    /** The visitor's slate, held up to the glass. */
    raise(text) { slate = { text, t0: performance.now() }; kick(); },
    setEnabled(on) { enabled = on; if (!on) { drag = null; canvas.style.cursor = 'default'; } },
    sync() { hover = null; drag = null; givers.length = 0; for (const o of OBJ) delete vis[o]; snap(); kick(); },
    /** Test and preview hook: do an act as the hand would, without a pointer. */
    perform(kind, opts = {}) { return kind === 'lift' ? lift(opts.obj) : held(kind, opts.place || 'near', opts.x ?? L.W / 2); },
    keepSector,
    /** Where things are, in CSS pixels of the viewport: for tools/drives/heptapod.mjs, which drives the page by hand. */
    probe() {
      const r = canvas.getBoundingClientRect(), k = r.width / L.W, st = hooks.getState(), ph = phaseOf(ink, performance.now());
      const at = (x, y) => ({ x: r.left + x * k, y: r.top + y * k });
      const things = {};
      for (const o of OBJ) if (vis[o]) things[o] = { ...at(vis[o].x, vis[o].y - objH(o, L.u * vis[o].k) / 2), held: !!(st.held && st.held.obj === o), place: whereIs(st, o)?.place || null };
      return {
        width: r.width, height: r.height, things, script,
        ring: { ...at(L.ring.cx, L.ring.cy), R: L.ring.R * k },
        disc: { ...at(L.disc.cx, L.disc.cy), R: L.disc.Rd * k },
        sill: at(L.W / 2, L.glassB).y,
        plates: { near: at(L.near.cx, slotY(L.near)), far: at(L.far.cx, slotY(L.far)) },
        air: { near: at(L.W / 2, L.hoverY.near), far: at(L.W / 2, L.hoverY.far) },
        glass: at(L.W / 2, 0.3 * L.H), ink: !!ph, crop: !!(ph && ph.crop), dragging: drag ? drag.kind : null, lastKeep, age: ink ? Math.round(performance.now() - ink.t0) : null,
        field: { N: field.N, fit: +field.fit().toFixed(3), mass: +field.mass().toFixed(1) },
        being: { ...at(L.body.x, L.body.y), side: body.side },
      };
    },
    pause() { running = false; cancelAnimationFrame(raf); clearTimeout(timer); raf = 0; timer = 0; },
    resume() { if (!running) { running = true; lastT = 0; kick(); } },
    destroy() {
      dead = true; cancelAnimationFrame(raf); clearTimeout(timer); ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('keydown', onKey);
    },
  };
}
