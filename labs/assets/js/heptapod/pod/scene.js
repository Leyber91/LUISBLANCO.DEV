/* ============================================================
   heptapod/pod/scene.js — the chamber.

   Material and motion (written before the code, the labs-design
   method; restaged by road item 1.07 under decision H8, and again
   by BAR_C slices C1 to C3, approved by Luis on 2026-11-18: one
   light, one air; the being grown and present; the things solid):

   The room is dark and large, and one thing in it gives light: a
   sphere of fog hanging beyond the glass, the being's air held in a
   ball and lit from inside. Seen from the table it is a disc, and it
   is the focal living element. Everything the being says happens in
   it, as ink in the fog: dark where the ink is, light where the fog
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

   One light, one air (pod/light.js). Nothing else in the room gives
   light: no lamp over the table, no glow of a gaze. Every surface is
   lit by the sphere through one function, falling off with the
   square of its distance and with the angle it turns from it; every
   view ray crosses the same faintly scattering air; a thing far
   from the glass is dimmer than one near it, and a thing held up to
   the glass enters the light. Nothing is drawn with an outline but
   the script: things and the being are matter, and a line on them
   is where the light falls.

   The being (pod/body.js) stands in the dark beyond the glass, to
   the disc's side and in front of it, so the fog lights only the
   edge of it that faces the disc. Its anatomy is grown from the
   species' seed: a stalk on a broad foot, fronds that alternate sides
   up it, and a head the neck turns toward what it attends to (the
   ring while it gathers, then the thing in your hand, your slate).
   It breathes, and a thing in your hand moves a little with the
   hand. It never writes with a limb: the ink condenses in the disc.

   On this side of the glass everything is the visitor's: a polished
   black table that holds the fog's reflection, and six things on it
   (pod/things.js), solids lit from beyond the glass, pale or dark,
   made or grown, each with its soft shadow cast away from the disc
   and a dark reflection in the polish where it hides the fog's. Held
   low over the table, a thing shows where it will be set down by the
   shadow it will cast there. The visitor's instruments are the only
   lines besides the script: the disc's bezel (a hairline ring with
   the four quarters the keys keep marked), the mark under the thing
   the keyboard has chosen, and a crop's corners. No view holds a
   bright glass wall, a fog wall behind it and a limb throwing ink
   (research/ip.md rule 7): the glass is dark and shows only as its
   sill, the fog is a sphere, and the being is in the dark.

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
import { OBJECTS, OBJ } from './world.js';
import { seedOf } from './species.js';
import { ringSpec, podStrokes, recognise, sectorRect, INK } from './ring.js';
import { DAY, GREETING, whereIs, freeSlot } from './day.js';
import { objW, objH, THING_NAME } from './objects.js';
import { InkField, fogNoise, flowFor } from './medium.js';
import { LIGHT, CAP, EDGE_LUMA, FOG_STOPS, DISC_WHOLE, makeRoom, paintRoom, encode, tableZ, lightAt, visibility, mirrorVisibility, toSRGB } from './light.js';
import { gbuffer, relight, occluders, placeOf, albedoOf } from './things.js';
import { growBody, poseBody, reachOf, fitBody, rasterBody, shadeBody, bodyOccluders } from './body.js';

export const TIME = { bloom: 2200, hang: 4000, thin: 3400, slate: 2800, giveOut: 640, giveBack: 760, flash: 700 };
/* The disc holds the ring with room for its longest threads: the disc's radius over the ring's. */
export const DISC_OVER_RING = 1.72;
const SPAN = 2 * DISC_OVER_RING;        // the field's side, in ring radii
const FOG_Q = 2;                         // the fog is drawn at half size and scaled up
const INK_RGB = [7, 9, 13];              // what the ink lets through is the fog's own light: this is the absorber
const INK_SPREAD = 1.5;                  // a ring-script stroke's width in the fog, over its width on the bench
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ROOM_Q = 3;                        // the still layers (room, table, shadows) are lit per cell of 3 device pixels
const BREATH_MS = 110;                   // while it only breathes, the being is redrawn about nine times a second

/* The room beside the disc that the being keeps, as a share of the canvas's width, on a wide canvas. */
export const BEING_ROOM = 0.25;

/**
 * Where the disc, the glass, the floor and the being go on a canvas of W x H device pixels. cap: the page caption's
 * bottom right corner in device pixels when it lies over the room (wide screens), else null. reach: the being's
 * reach (pod/body.js reachOf). Pure: tests/chamber.test.mjs lays out the widths a laptop has.
 */
export function chamberLayout(W, H, cap, reach) {
  const portrait = H > W * 1.05;
  // on a phone the disc stands a little left of the middle, so the being has room beside it, whole
  let Rd = Math.round(portrait ? Math.min(0.31 * W, 0.25 * H) : Math.min(0.26 * H, 0.3 * W));
  const disc = { cx: Math.round(portrait ? W / 2 - 0.15 * W : W / 2), cy: Math.round(0.045 * H + Rd), Rd };
  // the page's caption may lie over the room's top left: the disc and its bezel (1.1 of its radius) keep clear of
  // the caption's corner, first by moving right as far as the room allows (leaving the being BEING_ROOM of the
  // width beside its bezel), then down, then by growing smaller, the sill kept above 0.64 of the room's height
  // (found at 1024 px, where the caption lay on the disc; the being's room, by review on 2026-11-18, where the disc
  // moved right until the being was 6 px tall)
  if (cap) {
    const x1 = cap.x1 + 0.02 * W, y1 = cap.y1 + 0.01 * H;
    const clear = () => Math.hypot(Math.max(0, disc.cx - x1), Math.max(0, disc.cy - y1)) >= 1.1 * disc.Rd;
    for (let i = 0; i < 60 && !clear(); i++) {
      const need = 1.1 * disc.Rd, dy = Math.max(0, disc.cy - y1);
      const most = W - (1.13 + 0.02) * disc.Rd - (0.045 + BEING_ROOM) * W;
      disc.cx = Math.min(Math.max(disc.Rd, most), Math.max(disc.cx, x1 + (dy < need ? Math.sqrt(need * need - dy * dy) : 0)));
      if (clear()) break;
      const down = Math.min(0.64 * H - 0.03 * H - disc.Rd, y1 + 1.1 * disc.Rd);   // the lowest the centre may go
      if (down > disc.cy) { disc.cy = down; continue; }
      disc.Rd = Rd = Math.round(0.95 * disc.Rd);
      disc.cy = Math.round(0.045 * H + Rd);
    }
  }
  const glassB = Math.round(disc.cy + Rd + 0.03 * H);
  // their floor: it meets the far dark at a horizon a little above the sill; the being stands on it a little nearer
  // the glass than the fog's foot, whole, in the room right of the disc's bezel: scaled so that every pose it can
  // take (pod/body.js reachOf) fits
  const horizon = Math.round(glassB - 0.075 * H), foot = Math.round(glassB - 0.016 * H);
  const fit = fitBody(reach, { x0: disc.cx + 1.13 * Rd + 0.02 * W, x1: W - 0.025 * W, top: 0.04 * H, foot });
  return { portrait, disc, Rd, glassB, horizon, foot, fit };
}

export function initPod(canvas, hooks) {
  const { sp } = hooks;
  const inked = hooks.script === 'inked' ? hooks.inked : null;   // pod/inked.js, passed in only when the switch is on
  const script = inked ? 'inked' : 'ring';
  const P = palette();
  const reduced = hooks.reduced ?? prefersReduced();   // the platform's scene lifecycle passes it in
  // the being's anatomy, grown from the species' seed (pod/body.js); it stands to the right of the disc, where the
  // page's caption is not
  const anat = growBody(sp.target, sp.seed);
  const reach = reachOf(anat);
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
  const fogCv = document.createElement('canvas');            // the fog alone, at half size
  const roomCv = document.createElement('canvas');           // the room and the table, lit, one pixel a cell of ROOM_Q
  const shadeCv = document.createElement('canvas');          // the things' shadows on the table, one pixel a cell
  const bodyCv = document.createElement('canvas');           // the being, one pixel a cell of its grid
  const maskCv = document.createElement('canvas');           // the disc's soft edge
  const inkCv = document.createElement('canvas');            // the ink field, one pixel a cell
  const targetCv = document.createElement('canvas');         // where a ring-script ring's ink belongs
  let fogPat = null, field = null, inkImg = null, inkPx = null;
  let R = null, room = null, shadeImg = null;                // the room's light (light.js) and its still layer
  const sprites = {};                                        // thing -> { gb, cv, img, key, m }
  const patches = {};                                        // thing -> { key, i0, j0, w, h, vis } its shadow's cells
  let shadeKey = '', bodyAt = 0, bodyKey = '', bodyM = null, bodyOcc = null;
  const bodyCache = {};

  let L = null;                      // layout, device pixels
  let raf = 0, timer = 0, running = true, dead = false, lastT = 0, fogT = 0, stir = 1;
  const vis = {};                    // thing -> { x, y, k, a }
  let drag = null, pointer = null, pointerAt = -1e9;
  let ink = null;                    // { w (writing), act, t0, still, crop, hang }
  let targetKey = '', inkBlank = true;
  const gaze = { x: 0, y: 1, tx: 0, ty: 1, lean: 0 };
  let slate = null, flash = null, hover = null, enabled = true, sel = 0, keys = false;
  const givers = [];
  let lastKeep = null;               // what the last crop read, for the drive

  /* ---------------- what is written: the ring script, or the inked one behind its switch ---------------- */
  function writing(spec) {
    if (inked && spec.pod) {
      const fig = inked.figureOf(sp, spec.pod);
      if (fig.ok) return { kind: 'inked', spec, fig };
    }
    return { kind: 'ring', spec, strokes: podStrokes(spec) };
  }
  const recogniseW = (w, rect, erode) => (w.kind === 'inked' ? inked.recogniseInked(w.fig, rect, erode) : recognise(w.spec, rect, erode));
  const sectorW = (w, role) => (w.kind === 'inked' ? inked.sectorRectInked(w.fig, role) : sectorRect(w.spec, role));

  /* ---------------- layout ---------------- */
  function layout() {
    const { w: W, h: H } = fitCanvas(canvas);
    const c0 = hooks.keepClear?.(), kc = W / Math.max(1, canvas.getBoundingClientRect().width);
    const { portrait, disc, Rd, glassB, horizon, foot, fit } = chamberLayout(W, H, c0 ? { x1: c0.x1 * kc, y1: c0.y1 * kc } : null, reach);
    const u = Math.min(H * 0.125, W * 0.1);
    const near = { place: 'near', cx: W / 2, cy: Math.max(0.735 * H, glassB + 0.11 * H), rx: Math.min(0.31 * W, 4.3 * u), ry: 0.02 * H, k: 0.84 };
    const far = { place: 'far', cx: W / 2, cy: 0.915 * H, rx: Math.min(0.43 * W, 5.8 * u), ry: 0.046 * H, k: 1 };
    const dpr = W / Math.max(1, canvas.getBoundingClientRect().width);
    L = {
      W, H, glassB, u, near, far, disc, dpr, portrait,
      ring: { cx: disc.cx, cy: disc.cy, R: Rd / DISC_OVER_RING },
      // heights of a held thing's base: above z.give it goes through the glass, then held near, set down near,
      // held far, set down far. A thing at rest in the hand sits in the middle of its "held" band.
      z: { give: glassB - 0.04 * H, nearDown: near.cy - 0.03 * H, split: near.cy + 0.022 * H, farDown: far.cy - 0.053 * H },
      hoverY: { near: near.cy - near.ry - 0.95 * u * near.k, far: far.cy - far.ry - 0.6 * u },
      // x, y: where its head is about, for the direction of its attention
      body: { ...fit, x: fit.at.x, y: foot - fit.k * anat.H, foot },
      horizon,
    };
    R = makeRoom({ W, H, glassB, horizon, foot, disc });
    const D = 2 * Rd;
    if (discCv.width !== D) {
      discCv.width = discCv.height = D;
      maskCv.width = maskCv.height = D;
      const m = maskCv.getContext('2d');
      const g = m.createRadialGradient(Rd, Rd, 0, Rd, Rd, Rd);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(DISC_WHOLE, 'rgba(0,0,0,1)'); g.addColorStop(0.9, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      m.clearRect(0, 0, D, D); m.fillStyle = g; m.fillRect(0, 0, D, D);
      fogCv.width = fogCv.height = Math.ceil(D / FOG_Q);
      fogPat = null;
    }
    paintStill();
    // the things' geometry stays while their size does (spriteOf marches again only when it changes); their light and
    // shadows are taken again
    for (const o of OBJ) { if (sprites[o]) sprites[o].key = ''; delete patches[o]; }
    delete patches.landing;
    shadeKey = ''; bodyKey = '';
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
  /* Where a thing is in the room of light.js, from where it is drawn: its base's centre, and its scale. A thing on a
     plate rests on the table at that row's depth; a thing in the hand is lifted and brought toward the glass. */
  function worldOf(v) {
    const pl = v.y < L.z.split ? L.near : L.far, ground = slotY(pl);
    return { W: placeOf(R, v.x, v.y, ground), s: L.u * v.k, ground };
  }
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
      // a hand is never quite still: what it holds rises and falls a little (still with motion reduced)
      const bob = reduced ? 0 : 0.03 * L.u * Math.sin(performance.now() / 520);
      return { x: hover ? hover.x : slotX(pl, st.held.slot ?? 2), y: L.hoverY[pl.place] + bob, k: pl.k, tau: OBJECTS[obj].size === 'large' ? 230 : 150 };
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
    if (ink.w.kind === 'inked') T = inked.inkedTarget(ink.w.fig, N, SPAN, erode);
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
  /* The room's still layer: the dark beyond, the being's floor with the being's shadow on it, and the table, each lit
     by light.js once per layout (it changes only with the layout). */
  function paintStill() {
    const occ = bodyOcc = bodyOccluders(anat, L.body.at, L.body.k, R.Zb);
    room = paintRoom(R, ROOM_Q, occ);
    roomCv.width = room.cw; roomCv.height = room.ch;
    const c = roomCv.getContext('2d');
    const img = c.createImageData(room.cw, room.ch);
    encode(room.rgb, img.data);
    c.putImageData(img, 0, 0);
    shadeCv.width = room.cw; shadeCv.height = room.ch;
    shadeImg = shadeCv.getContext('2d').createImageData(room.cw, room.ch);
  }
  function drawRoom(ctx) {
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(roomCv, 0, 0, room.cw * ROOM_Q, room.ch * ROOM_Q);
  }
  /* The being: posed for this moment and what it attends to, lit, drawn. Redrawn when it turns, and every BREATH_MS
     while it breathes (a breath takes five to eight seconds). */
  function drawBeing(ctx, now) {
    const b = L.body;
    const att = { x: gaze.x, y: -gaze.y, w: 0.55 + 0.45 * gaze.lean };
    const key = `${att.x.toFixed(3)}|${att.y.toFixed(3)}|${att.w.toFixed(3)}`;
    const every = Tier.name === 'lite' ? 2 * BREATH_MS : BREATH_MS;
    if (!bodyKey || (key !== bodyKey && now - bodyAt > 45) || (!reduced && now - bodyAt > every)) {
      bodyKey = key; bodyAt = now;
      const prims = poseBody(anat, reduced ? 0 : now / 1000, att);
      const F = rasterBody(prims, b.at, b.k, b.c, b.box);
      if (bodyCv.width !== F.gw || bodyCv.height !== F.gh) { bodyCv.width = F.gw; bodyCv.height = F.gh; }
      const c = bodyCv.getContext('2d');
      const img = c.createImageData(F.gw, F.gh);
      bodyM = shadeBody(F, R, b.at, b.k, anat, img.data, bodyOcc, bodyCache);
      c.putImageData(img, 0, 0);
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bodyCv, b.box.x0, b.box.y0, bodyCv.width * b.c, bodyCv.height * b.c);
  }

  function drawDisc(ctx) {
    const { disc } = L, D = discCv.width, Rd = disc.Rd;
    // the fog is soft: it is laid at half size and scaled up; the ink is laid at full size over it
    const c = fogCv.getContext('2d');
    c.setTransform(fogCv.width / D, 0, 0, fogCv.width / D, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    // the fog gives light from inside: brightest a little above its centre
    const base = c.createRadialGradient(Rd * 0.94, Rd * 0.86, 0, Rd, Rd, Rd);
    for (const [at, col] of FOG_STOPS) base.addColorStop(at, col);   // light.js: the fog's light is the room's one light
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
    c.globalCompositeOperation = 'source-over';
    const dc = discCv.getContext('2d');
    dc.globalCompositeOperation = 'source-over'; dc.globalAlpha = 1;
    dc.clearRect(0, 0, D, D);
    dc.imageSmoothingEnabled = true; dc.imageSmoothingQuality = 'high';
    dc.drawImage(fogCv, 0, 0, D, D);
    // the ink: what it takes from the fog's light
    if (!inkBlank) dc.drawImage(inkCv, 0, 0, D, D);
    // the fog ends softly at the disc's edge
    dc.globalCompositeOperation = 'destination-in';
    dc.drawImage(maskCv, 0, 0);
    dc.globalCompositeOperation = 'source-over';
    ctx.drawImage(discCv, disc.cx - Rd, disc.cy - Rd);
    // the bezel, the visitor's instrument: a hairline round the disc, and on it the life of the ring in the disc,
    // an arc from the top that fills as the ring gathers, stays full while it hangs and drains as it thins (how long
    // is left to cut a piece); under the ring script, the four quarters its keys keep are marked
    const br = Rd * 1.045;
    ctx.save();
    ctx.lineWidth = Math.max(1, L.dpr * 0.8);
    ctx.strokeStyle = P.line; ctx.beginPath(); ctx.arc(disc.cx, disc.cy, br, 0, Math.PI * 2); ctx.stroke();
    const life = lifeOf(ink, performance.now());
    if (life > 0.002) {
      ctx.strokeStyle = P.horizonDim; ctx.lineWidth = Math.max(1.5, 1.6 * L.dpr);
      ctx.beginPath(); ctx.arc(disc.cx, disc.cy, br, -Math.PI / 2, -Math.PI / 2 + life * 2 * Math.PI); ctx.stroke();
    }
    if (script === 'ring') {
      ctx.lineWidth = Math.max(1, L.dpr * 0.8);
      ctx.beginPath();
      for (let d = 0; d < 360; d += 90) {
        const a = d * Math.PI / 180, s = Math.sin(a), co = -Math.cos(a);
        ctx.moveTo(disc.cx + s * (br - 0.025 * Rd), disc.cy + co * (br - 0.025 * Rd)); ctx.lineTo(disc.cx + s * (br + 0.06 * Rd), disc.cy + co * (br + 0.06 * Rd));
      }
      ctx.strokeStyle = keys ? P.horizon : P.horizonDim; ctx.stroke();
    }
    ctx.restore();
  }
  /* The share of the ring's life left, for the bezel: 0 to 1 while it gathers, 1 while it hangs, down to 0 as it thins. */
  function lifeOf(k, now) {
    const ph = phaseOf(k, now);
    if (!ph) return 0;
    if (ph.forming) return ph.p;
    return ph.thinning ? Math.max(0, 1 - ph.erode / INK.ERODE_MAX) : 1;
  }

  /* ---------------- drawing: this side of the glass ---------------- */
  /* The sill: the glass's lower edge, catching the fog's light where it is near the disc. A thing held over it lights
     it fully: let go there, the thing is passed through the glass. */
  function drawSill(ctx) {
    const { W, glassB } = L;
    const g = ctx.createLinearGradient(0, 0, W, 0);
    const rgb = LIGHT.RGB.map((c) => toSRGB(c * 0.9)).join(', ');
    for (let i = 0; i <= 8; i++) {
      const x = (i / 8) * W, e = lightAt(R, [x, 0, 0], [0, 0.6, -0.8]);
      g.addColorStop(i / 8, `rgba(${rgb}, ${Math.min(0.5, 6 * e).toFixed(3)})`);
    }
    ctx.fillStyle = dragZone()?.kind === 'give' ? P.horizon : g;
    ctx.fillRect(0, glassB, W, Math.max(1, Math.round(L.dpr)));
  }
  /* A thing's picture, lit where it is now; the geometry is marched once per size (things.js). */
  function spriteOf(o, v) {
    const res = clamp(Math.round(L.u), 40, 140);
    let s0 = sprites[o];
    if (!s0 || s0.gb.res !== res) {
      const gb = gbuffer(o, res), cv = document.createElement('canvas');
      cv.width = gb.w; cv.height = gb.h;
      s0 = sprites[o] = { gb, cv, img: cv.getContext('2d').createImageData(gb.w, gb.h), key: '', m: null };
    }
    const key = `${Math.round(v.x)}|${Math.round(v.y)}|${v.k.toFixed(3)}`;
    if (key !== s0.key) {
      const w = worldOf(v);
      s0.key = key;
      s0.m = relight(s0.gb, R, { x: v.x, y: v.y }, w.W, w.s, s0.img.data);
      s0.cv.getContext('2d').putImageData(s0.img, 0, 0);
    }
    return s0;
  }
  function drawThing(ctx, o, v, alpha = 1) {
    const s0 = spriteOf(o, v), f = (L.u * v.k) / s0.gb.res;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(s0.cv, v.x - s0.gb.ox * f, v.y - s0.gb.oy * f, s0.gb.w * f, s0.gb.h * f);
    ctx.restore();
  }
  /* The cells of the table near a thing at v: for each, the share of the fog it still sees past the thing (light.js
     visibility) and the share of the fog's reflection it still shows (mirrorVisibility: in front of a thing the
     polish shows the thing's dark reflection instead). A thing that is moving is taken at every second cell. */
  function patchOf(o, v, coarse) {
    const q = ROOM_Q, { cw, ch } = room;
    const w = worldOf(v), occ = occluders(o, w.W, w.s);
    const hw = 1.5 * objW(o, w.s), down = 2.4 * w.s + 1.4 * objH(o, w.s);
    const i0 = clamp(Math.floor((v.x - hw) / q), 0, cw - 1), i1 = clamp(Math.ceil((v.x + hw) / q), 0, cw - 1);
    const j0 = clamp(Math.floor(Math.max(L.glassB, v.y - 0.5 * w.s) / q), 0, ch - 1), j1 = clamp(Math.ceil((w.ground + down) / q), 0, ch - 1);
    const pw = i1 - i0 + 1, ph = j1 - j0 + 1, visA = new Float32Array(pw * ph), mirA = new Float32Array(pw * ph);
    const st = coarse ? 2 : 1;
    for (let j = 0; j < ph; j += st) {
      const y = (j0 + j + 0.5) * q;
      for (let i = 0; i < pw; i += st) {
        const x = (i0 + i + 0.5) * q, P = [x, 0, tableZ(R, y)];
        const a = y < L.glassB ? 1 : visibility(R, P, occ), m = y < L.glassB ? 1 : mirrorVisibility(R, P, occ);
        for (let dj = 0; dj < st && j + dj < ph; dj++) for (let di = 0; di < st && i + di < pw; di++) { visA[(j + dj) * pw + i + di] = a; mirA[(j + dj) * pw + i + di] = m; }
      }
    }
    return { i0, j0, w: pw, h: ph, vis: visA, mir: mirA };
  }
  /* Where letting go now would set the thing down: the place on the table and its scale, or null. */
  function landing() {
    const z = dragZone();
    if (!z || z.kind !== 'putdown') return null;
    const st = hooks.getState(), pl = plate(z.place);
    const slot = freeSlot(st, z.place, slotAt(pl, drag.p.x + drag.dx));
    return slot < 0 ? null : { x: slotX(pl, slot), y: slotY(pl), k: pl.k };
  }
  /* The things' shadows on the table, taken from each cell's direct light and its reflection by what the things hide,
     and, while a thing is held low over the table, the shadow it will cast where letting go sets it down. A thing's
     cells are kept until it moves. The darkening is laid in linear light: a cell keeping a share s of its light is
     drawn at s of its linear value (black at alpha 1 - s^(1/2.2) over the sRGB bytes). */
  function drawShadows(ctx) {
    const q = ROOM_Q, { cw, ch } = room;
    let key = '';
    for (const o of OBJ) {
      const v = vis[o];
      if (!v || v.a < 0.5 || givers.some((g) => g.obj === o)) { delete patches[o]; continue; }
      const moving = !!(drag && drag.obj === o);
      const pk = `${Math.round(v.x)}|${Math.round(v.y)}|${v.k.toFixed(3)}|${moving ? 'c' : 'f'}`;
      key += o + pk;
      if (patches[o] && patches[o].key === pk) continue;
      patches[o] = { key: pk, ...patchOf(o, v, moving) };
    }
    const land = landing();
    if (land) {
      const lk = `${drag.obj}|${Math.round(land.x)}|${Math.round(land.y)}`;
      key += 'L' + lk;
      if (!patches.landing || patches.landing.key !== lk) patches.landing = { key: lk, ...patchOf(drag.obj, land, false) };
    } else delete patches.landing;
    if (key !== shadeKey) {
      shadeKey = key;
      const d = shadeImg.data;
      d.fill(0);
      const keep = new Float32Array(cw * ch).fill(1), keepM = new Float32Array(cw * ch).fill(1);
      for (const p of Object.values(patches)) {
        for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
          const c = (p.j0 + j) * cw + p.i0 + i;
          keep[c] *= p.vis[j * p.w + i]; keepM[c] *= p.mir[j * p.w + i];
        }
      }
      for (let c = 0; c < cw * ch; c++) {
        const lost = (1 - keep[c]) * room.direct[c] + (1 - keepM[c]) * room.mirror[c];
        if (lost > 0.002) d[4 * c + 3] = Math.round(255 * (1 - Math.pow(Math.max(0, 1 - lost), 1 / 2.2)));
      }
      shadeCv.getContext('2d').putImageData(shadeImg, 0, 0);
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(shadeCv, 0, 0, cw * q, ch * q);
  }
  function drawDesk(ctx, st, now) {
    const order = OBJ.filter((o) => vis[o] && vis[o].a > 0.01).sort((a, b) => vis[a].y - vis[b].y);
    for (const o of order) drawThing(ctx, o, vis[o], vis[o].a);
    for (const g of givers) {                                      // a thing passing through the glass
      const f = (now - g.t0) / TIME.giveOut;
      if (f < 1) drawThing(ctx, g.obj, { x: g.x, y: g.y - ease(f) * 0.16 * L.H, k: g.k * (1 - 0.25 * f) }, 1 - f);
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
    const busy = !!(ph && (ph.forming || ph.thinning)) || (targetKey === 'none' && !inkBlank) || field.oldLive;
    const t0 = performance.now();
    if (!reduced) {
      stir += ((busy ? 3 : 1) - stir) * (1 - Math.exp(-dt / 700));    // the fog stirs while the being writes
      fogT += (dt / 1000) * stir;
      if (!inkBlank || field.residual > 0.002 || targetKey !== 'none' || field.oldLive) {
        field.step(Math.min(0.05, dt / 1000), flowFor(ph ? (ph.forming ? 'forming' : ph.thinning ? 'thinning' : 'hanging') : 'leaving'));
        field.paint(inkPx, INK_RGB);
        inkCv.getContext('2d').putImageData(inkImg, 0, 0);
        inkBlank = targetKey === 'none' && field.residual <= 0.002 && !field.oldLive;
      }
    } else {
      field.paint(inkPx, INK_RGB);
      inkCv.getContext('2d').putImageData(inkImg, 0, 0);
      inkBlank = targetKey === 'none';
    }

    // where the being looks
    let tx = L.W / 2, ty = slotY(L.near), lean = 0;
    if (slate) { ty = L.glassB - 0.05 * L.H; lean = 1; }
    else if (drag && drag.kind === 'thing') { tx = drag.p.x + drag.dx; ty = drag.p.y + drag.dy - 0.5 * L.u; lean = 0.6; }
    else if (ph && !ink.still && now - ink.t0 < TIME.bloom) { tx = L.ring.cx; ty = L.ring.cy; lean = 1; }   // the ring while it gathers
    else if (st.held && vis[st.held.obj]) { tx = vis[st.held.obj].x; ty = vis[st.held.obj].y - 0.5 * L.u; lean = 0.8; }   // then what you hold
    else if (pointer && now - pointerAt < 4000) { tx = pointer.x; ty = pointer.y; }
    const gx = tx - L.body.x, gy = ty - L.body.y, gl = Math.hypot(gx, gy) || 1;
    gaze.tx = gx / gl; gaze.ty = gy / gl;
    const gk = reduced ? 1 : 1 - Math.exp(-dt / 340);
    const before = gaze.x + gaze.y + gaze.lean;
    gaze.x += (gaze.tx - gaze.x) * gk; gaze.y += (gaze.ty - gaze.y) * gk; gaze.lean += (lean - gaze.lean) * gk;
    if (Math.abs(gaze.x + gaze.y + gaze.lean - before) > 0.002) moving = true;

    ctx.fillStyle = P.void; ctx.fillRect(0, 0, L.W, L.H);
    drawRoom(ctx);
    drawBeing(ctx, now);
    drawDisc(ctx);
    drawSill(ctx);
    drawShadows(ctx);
    drawSlate(ctx, now);
    drawDesk(ctx, st, now);
    drawCrop(ctx, now);
    // the codec page's rule, on the whole frame (the ink, the being, the things, their shadows): a median of 60 frames
    // over 20 ms takes the light tier, which lays the ink on a coarser grid and redraws the being's breath half as often
    Tier.sample(performance.now() - t0);

    if (drag || moving || slate || flash || (!reduced && busy)) kick();
    else if (!reduced) idle(50);                       // at rest the fog drifts and the ink breathes
    else if (ph && !ink.still) wakeAt(nextStep(ink, now));  // without motion, a ring still has its three steps to take
  }
  function kick() { if (!raf && running && !dead) { clearTimeout(timer); timer = 0; raf = requestAnimationFrame(frame); } }
  function idle(ms) { if (!timer && !raf && running && !dead) timer = setTimeout(() => { timer = 0; kick(); }, ms); }
  /* With motion reduced, the page sleeps until the ring's next still step is due, and not at all for a ring that
     stays (the greeting): nothing is drawn between changes. */
  function nextStep(k, now) {
    const rest = Math.max(9000, k.hang);
    if (!Number.isFinite(rest)) return Infinity;
    const t = now - k.t0;
    return t < rest ? k.t0 + rest : k.t0 + rest + (Math.floor((t - rest) / 1300) + 1) * 1300;
  }
  function wakeAt(at) { if (Number.isFinite(at)) idle(Math.max(16, at - performance.now() + 5)); }

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
      if (key === 'ArrowRight') { sel = (Math.min(sel, things.length - 1) + 1) % things.length; hooks.say?.(`${THING_NAME[things[sel]]}, on the table ${whereIs(st, things[sel]).place === 'near' ? 'at the glass' : 'far from the glass'}.`); }
      else if (key === 'ArrowLeft') { sel = (Math.min(sel, things.length - 1) + things.length - 1) % things.length; hooks.say?.(`${THING_NAME[things[sel]]}, on the table ${whereIs(st, things[sel]).place === 'near' ? 'at the glass' : 'far from the glass'}.`); }
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
  // the light tier, once the page takes it, reaches the field at once (a smaller grid), not at the next resize. The
  // size has not changed, so a drag in progress goes on: through onResize, a tier taken during a crop dropped the
  // crop, and the release then kept nothing (the drive at 1440 px, 2026-11-18, where the frames slow while it reads
  // the canvas; a slow laptop takes the tier the same way)
  const onTier = () => { if (L && !dead) { layout(); kick(); } };
  Tier.listeners.add(onTier);
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
    /** Draw the being again at this moment (for the drive: with motion reduced it must come out the same). */
    redraw() { bodyKey = ''; kick(); },
    /** The density of ink in the disc's field at a point of the viewport (CSS pixels): for the drive's G11 check. */
    inkAt(x, y) {
      const r = canvas.getBoundingClientRect(), k = L.W / r.width, { disc } = L;
      const i = Math.floor((((x - r.left) * k - (disc.cx - disc.Rd)) / (2 * disc.Rd)) * field.N), j = Math.floor((((y - r.top) * k - (disc.cy - disc.Rd)) / (2 * disc.Rd)) * field.N);
      if (!(i >= 0 && j >= 0 && i < field.N && j < field.N)) return 0;
      return field.D[j * field.N + i] + field.O[j * field.N + i];
    },
    /** Where things are, in CSS pixels of the viewport: for tools/drives/heptapod.mjs, which drives the page by hand. */
    probe() {
      const r = canvas.getBoundingClientRect(), k = r.width / L.W, st = hooks.getState(), ph = phaseOf(ink, performance.now());
      const at = (x, y) => ({ x: r.left + x * k, y: r.top + y * k });
      const things = {};
      for (const o of OBJ) {
        if (!vis[o]) continue;
        const v = vis[o], s0 = sprites[o];
        // its picture's box on the screen, and the light the fog gives the half of it facing the disc and the other
        const f = s0 ? (L.u * v.k) / s0.gb.res : 0;
        const box = s0 ? { x0: at(v.x - s0.gb.ox * f, 0).x, x1: at(v.x + (s0.gb.w - s0.gb.ox) * f, 0).x, y0: at(0, v.y - s0.gb.oy * f).y, y1: at(0, v.y + (s0.gb.h - s0.gb.oy) * f).y } : null;
        const w = L ? worldOf(v) : null;
        const sm = (A) => A.map((p) => ({ ...p, ...at(p.x, p.y) }));
        things[o] = { ...at(v.x, v.y - objH(o, L.u * v.k) / 2), held: !!(st.held && st.held.obj === o), place: whereIs(st, o)?.place || null,
          base: at(v.x, v.y), box, alb: albedoOf(o), u: L.u * v.k * k,
          light: s0 && s0.m ? { ...s0.m, samples: undefined } : null,
          samples: s0 && s0.m ? { lit: sm(s0.m.samples.lit), dark: sm(s0.m.samples.dark) } : null,
          dist: w ? Math.round(Math.hypot(w.W[0] - R.S[0], w.W[1] - R.S[1], w.W[2] - R.S[2]) * k) : null };
      }
      return {
        width: r.width, height: r.height, things, script,
        ring: { ...at(L.ring.cx, L.ring.cy), R: L.ring.R * k },
        disc: { ...at(L.disc.cx, L.disc.cy), R: L.disc.Rd * k },
        sill: at(L.W / 2, L.glassB).y,
        plates: { near: at(L.near.cx, slotY(L.near)), far: at(L.far.cx, slotY(L.far)) },
        air: { near: at(L.W / 2, L.hoverY.near), far: at(L.W / 2, L.hoverY.far) },
        glass: at(L.W / 2, 0.3 * L.H), ink: !!ph, crop: !!(ph && ph.crop), dragging: drag ? drag.kind : null, lastKeep, age: ink ? Math.round(performance.now() - ink.t0) : null,
        field: { N: field.N, fit: +field.fit().toFixed(3), mass: +field.mass().toFixed(1) }, tier: Tier.name,
        being: {
          foot: at(L.body.at.x, L.body.at.y), head: at(L.body.x, L.body.y), k: L.body.k * k, limbs: anat.fronds.length,
          box: { x0: at(L.body.box.x0, 0).x, x1: at(L.body.box.x1, 0).x, y0: at(0, L.body.box.y0).y, y1: at(0, L.body.box.y1).y },
          light: bodyM ? { near: bodyM.near, far: bodyM.far, top: bodyM.top, low: bodyM.low, lit: bodyM.lit } : null,
          drawn: bodyM && bodyM.drawn.x1 > bodyM.drawn.x0 ? { x0: at(bodyM.drawn.x0, 0).x, x1: at(bodyM.drawn.x1, 0).x, y0: at(0, bodyM.drawn.y0).y, y1: at(0, bodyM.drawn.y1).y } : null,
          still: reduced, key: bodyKey,
        },
        response: { exposure: LIGHT.EXPOSURE, cap: CAP, edge: EDGE_LUMA },
        whole: DISC_WHOLE,
      };
    },
    pause() { running = false; cancelAnimationFrame(raf); clearTimeout(timer); raf = 0; timer = 0; },
    resume() { if (!running) { running = true; lastT = 0; kick(); } },
    destroy() {
      dead = true; cancelAnimationFrame(raf); clearTimeout(timer); ro.disconnect(); Tier.listeners.delete(onTier);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('keydown', onKey);
    },
  };
}
