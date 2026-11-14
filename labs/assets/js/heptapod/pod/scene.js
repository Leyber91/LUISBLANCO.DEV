/* ============================================================
   heptapod/pod/scene.js — the pod: fog behind a wall of glass, a
   body in the fog, ink on the glass, a tray under one lamp.

   What each mark encodes:
   - The ring is the being's whole thought about the act just
     done, solved as one curve, so it appears along its whole
     length at once. It hangs, then thins: every stroke loses the
     same width per second, so the lightest ink goes first and the
     sector the being pressed on goes last.
   - The light on the body's edge is its gaze: it lies on the side
     facing what the being attends to (the thing in your hand, the
     ring it is writing, your slate). The body has no other motion.
   - A thing follows the hand with a lag set by its size, and its
     shadow widens and fades as it leaves the plate. The shadow
     says which plate it is over.
   - The lamp burns down with the day: its pools on the plates dim
     as the rings of the day are used.
   One gesture is one act, and one act is one ring. Taking a thing
   always ends with it in the hand, wherever it is let go; a second
   gesture holds it up, sets it down or gives it.

   Lifecycle: initPod returns { destroy, pause, resume, ... } and is
   mounted through Labs OS (os/scene.js), which pauses it while the
   tab is hidden or the canvas is off screen. At rest it redraws
   only the fog, about twelve times a second.
   ============================================================ */

import { InkLayer, fitCanvas, palette, prefersReduced } from '../render.js';
import { Tier } from '../stage.js';
import { mulberry32 } from '../raster.js';
import { OBJECTS, OBJ } from './world.js';
import { seedOf } from './species.js';
import { ringSpec, podStrokes, recognise, sectorRect, INK } from './ring.js';
import { DAY, GREETING, whereIs, freeSlot } from './day.js';
import { drawObject, drawShadow, objW, objH, THING_NAME } from './objects.js';

export const TIME = { bloom: 2200, hang: 4000, thin: 3400, cut: 420, slate: 2800, giveOut: 640, giveBack: 760, flash: 700 };
const FOG_Q = 2;                 // the fog and the body are drawn at half size and scaled up
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function initPod(canvas, hooks) {
  const { sp } = hooks;
  const P = palette();
  const reduced = hooks.reduced ?? prefersReduced();   // the platform's scene lifecycle passes it in
  const layer = new InkLayer();
  const inkCv = document.createElement('canvas');
  const fogCv = document.createElement('canvas');
  const rnd = mulberry32(seedOf('body', sp.target, sp.seed));
  const body = {
    side: rnd() < 0.5 ? -1 : 1,
    lobes: [[2, 0.1], [3, 0.13], [5, 0.07], [7, 0.04]].map(([k, a]) => ({ k, a: a * (0.7 + 0.6 * rnd()), ph: rnd() * Math.PI * 2 })),
    strands: Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => ({ at: -0.7 + 1.4 * rnd(), sway: -0.5 + rnd(), len: 0.7 + 0.6 * rnd(), w: 0.07 + 0.06 * rnd() })),
  };
  const blobs = Array.from({ length: 6 }, (_, i) => ({ x: rnd(), y: rnd(), r: 0.24 + 0.22 * rnd(), a: 0.05 + 0.045 * rnd(), px: 38 + 50 * rnd(), py: 46 + 60 * rnd(), ph: rnd() * 6.28, front: i >= 4 }));

  let L = null;                      // layout, device pixels
  let raf = 0, timer = 0, running = true, dead = false, lastT = 0, fogT = 0;
  const vis = {};                    // thing -> { x, y, k, a }
  let drag = null, pointer = null, pointerAt = -1e9;
  let ink = null, prev = null;       // { spec, strokes, act, t0, still, crop }
  let inkKey = '';
  const gaze = { x: 0, y: 1, tx: 0, ty: 1, lean: 0 };
  let slate = null, flash = null, hover = null, enabled = true, sel = 0, keys = false;
  const givers = [];

  /* ---------------- layout ---------------- */
  function layout() {
    const { w: W, h: H } = fitCanvas(canvas);
    const glassB = Math.round(0.6 * H);
    const u = Math.min(H * 0.125, W * 0.1);
    const near = { place: 'near', cx: W / 2, cy: 0.735 * H, rx: Math.min(0.31 * W, 4.3 * u), ry: 0.02 * H, k: 0.84 };
    const far = { place: 'far', cx: W / 2, cy: 0.915 * H, rx: Math.min(0.43 * W, 5.8 * u), ry: 0.046 * H, k: 1 };
    L = {
      W, H, glassB, u, near, far,
      ring: { cx: W / 2, cy: 0.305 * H, R: Math.min(0.184 * H, 0.27 * W) },
      // heights of a held thing's base: above z.give it goes through the glass, then held near, set down near,
      // held far, set down far. A thing at rest in the hand sits in the middle of its "held" band.
      z: { give: 0.56 * H, nearDown: near.cy - 0.03 * H, split: near.cy + 0.022 * H, farDown: far.cy - 0.053 * H },
      hoverY: { near: near.cy - near.ry - 0.95 * u * near.k, far: far.cy - far.ry - 0.6 * u },
      dpr: W / Math.max(1, canvas.getBoundingClientRect().width),
      body: { x: W / 2 + body.side * 0.085 * W, y: 0.5 * glassB, r: 0.4 * glassB },
    };
    const side = Math.ceil(L.ring.R * 3.3);
    if (inkCv.width !== side) { inkCv.width = inkCv.height = side; inkKey = ''; }
    const fw = Math.ceil(W / FOG_Q), fh = Math.ceil(glassB / FOG_Q);
    if (fogCv.width !== fw || fogCv.height !== fh) { fogCv.width = fw; fogCv.height = fh; }
  }
  const plate = (place) => L[place];
  const slotX = (pl, s) => pl.cx + ((s - 2.5) / 3) * pl.rx * 0.86;
  const slotY = (pl) => pl.cy + pl.ry * 0.15;
  const slotAt = (pl, x) => clamp(Math.round(((x - pl.cx) / (pl.rx * 0.86)) * 3 + 2.5), 0, DAY.SLOTS - 1);
  const clampX = (x, pl) => clamp(x, pl.cx - pl.rx * 0.9, pl.cx + pl.rx * 0.9);
  const depthK = (y) => L.near.k + (1 - L.near.k) * clamp((y - L.hoverY.near) / (slotY(L.far) - L.hoverY.near), 0, 1);

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

  /* ---------------- the ink ---------------- */
  function phaseOf(k, now) {
    if (!k) return null;
    if (k.cutAt != null) {
      const f = (now - k.cutAt) / TIME.cut;
      return f >= 1 ? null : { p: k.cutP, erode: k.cutErode + (INK.ERODE_MAX - k.cutErode) * f, crop: false };
    }
    if (k.still) return { p: 1, erode: 0, crop: k.crop !== false };
    const t = now - k.t0;
    if (reduced) {                  // no motion: the whole ring at once, a longer hang, then three still steps
      const rest = Math.max(9000, k.hang);
      if (t < rest) return { p: 1, erode: 0, crop: true };
      const step = Math.floor((t - rest) / 1300);
      return step >= 3 ? null : { p: 1, erode: INK.ERODE_MAX * (step + 1) / 4, crop: true };
    }
    if (t < TIME.bloom) return { p: ease(t / TIME.bloom), erode: 0, crop: t / TIME.bloom > 0.55 };
    if (t < TIME.bloom + k.hang) return { p: 1, erode: 0, crop: true };
    const f = (t - TIME.bloom - k.hang) / TIME.thin;
    return f >= 1 ? null : { p: 1, erode: INK.ERODE_MAX * f, crop: true };
  }
  function put(spec, act, opts = {}) {
    const now = performance.now();
    const ph = phaseOf(ink, now);
    if (ink && ph) prev = { ...ink, cutAt: now, cutP: ph.p, cutErode: ph.erode };
    ink = { spec, strokes: podStrokes(spec), act, t0: now, still: !!opts.still, crop: opts.crop, hang: opts.hang ?? TIME.hang };
    inkKey = '';
    kick();
  }
  function drawRing(ctx, k, ph, alpha = 1) {
    const side = inkCv.width, R = L.ring.R;
    const key = `${k.t0}|${ph.p.toFixed(4)}|${ph.erode.toFixed(5)}|${Tier.glow}`;
    if (key !== inkKey) {
      const t0 = performance.now();
      inkCv.getContext('2d').clearRect(0, 0, side, side);
      layer.render(inkCv, k.strokes, { s: R, ox: side / 2, oy: side / 2 }, { p: ph.p, order: 'ts', erode: ph.erode, glow: Tier.glow });
      inkKey = key;
      Tier.sample(performance.now() - t0);     // the codec page's rule: a median of 60 renders over 20 ms drops two glow passes, a hitch does not
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(inkCv, L.ring.cx - side / 2, L.ring.cy - side / 2);
    ctx.globalAlpha = 1;
  }

  /* ---------------- drawing ---------------- */
  function bodyPath(c, bx, by, r) {
    c.beginPath();
    for (let d = 0; d <= 360; d += 6) {
      const a = d * Math.PI / 180;
      let k = 1;
      for (const l of body.lobes) k += l.a * Math.cos(l.k * a + l.ph);
      const x = bx + r * k * 0.8 * Math.sin(a), y = by - r * k * 1.22 * Math.cos(a);
      if (d) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
  }
  function drawFog() {
    const c = fogCv.getContext('2d');
    const { W, glassB } = L;
    c.setTransform(1 / FOG_Q, 0, 0, 1 / FOG_Q, 0, 0);
    const base = c.createLinearGradient(0, 0, 0, glassB);
    base.addColorStop(0, '#0F141D'); base.addColorStop(1, '#070A10');
    c.fillStyle = base; c.fillRect(0, 0, W, glassB);
    const bx = L.body.x + gaze.x * L.body.r * 0.05, by = L.body.y + gaze.y * L.body.r * 0.03, r = L.body.r * (1 + 0.03 * gaze.lean);
    // the fog is lit from inside, behind the body
    const span = Math.max(W, glassB);
    const core = c.createRadialGradient(L.body.x, L.body.y - 0.08 * glassB, 0, L.body.x, L.body.y - 0.08 * glassB, 0.72 * span);
    core.addColorStop(0, 'rgba(159, 179, 214, .30)'); core.addColorStop(0.45, 'rgba(159, 179, 214, .10)'); core.addColorStop(1, 'rgba(159, 179, 214, 0)');
    c.fillStyle = core; c.fillRect(0, 0, W, glassB);
    const blob = (b) => {
      const x = (b.x + 0.07 * Math.sin(fogT / b.px + b.ph)) * W, y = (b.y + 0.06 * Math.cos(fogT / b.py + b.ph)) * glassB, rr = b.r * span;
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, `rgba(159, 179, 214, ${b.a})`); g.addColorStop(1, 'rgba(159, 179, 214, 0)');
      c.fillStyle = g; c.fillRect(0, 0, W, glassB);
    };
    blobs.filter((b) => !b.front).forEach(blob);
    // the body: a darker volume, and strands that go down past the sill
    c.fillStyle = 'rgba(4, 6, 10, .9)';
    for (const s of body.strands) {
      const x0 = bx + s.at * r * 0.62, y0 = by + r * 0.75, x1 = x0 + s.sway * r * 0.5, y1 = y0 + s.len * r * 1.3, w = s.w * r;
      c.beginPath(); c.moveTo(x0 - w, y0); c.quadraticCurveTo(x0 - w * 0.4 + s.sway * r * 0.1, (y0 + y1) / 2, x1, y1);
      c.quadraticCurveTo(x0 + w * 0.4 + s.sway * r * 0.1, (y0 + y1) / 2, x0 + w, y0); c.closePath(); c.fill();
    }
    // a soft edge without a filter: the same outline four times, each a little smaller and denser
    for (const [k, al] of [[1.07, 0.22], [1.035, 0.34], [1, 0.55], [0.965, 0.9]]) { c.fillStyle = `rgba(4, 6, 10, ${al})`; bodyPath(c, bx, by, r * k); c.fill(); }
    // its gaze: light on the side of the body that faces what it attends to
    c.save();
    bodyPath(c, bx, by, r); c.clip();
    const lx = bx + gaze.x * r * 0.92, ly = by + gaze.y * r * 1.3;
    const rim = c.createRadialGradient(lx, ly, 0, lx, ly, r * 0.95);
    rim.addColorStop(0, `rgba(159, 179, 214, ${(0.34 + 0.16 * gaze.lean).toFixed(3)})`); rim.addColorStop(1, 'rgba(159, 179, 214, 0)');
    c.fillStyle = rim; c.fillRect(0, 0, W, glassB);
    c.restore();
    blobs.filter((b) => b.front).forEach(blob);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  function drawGlass(ctx) {
    const { W, glassB, H } = L;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fogCv, 0, 0, W, glassB);
    for (const [x0, x1] of [[0, 0.16 * W], [W, 0.84 * W]]) {         // the wall darkens toward its edges
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, 'rgba(6, 8, 13, .85)'); g.addColorStop(1, 'rgba(6, 8, 13, 0)');
      ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), glassB);
    }
    ctx.save();                                                       // two bands of sheen: it is glass
    ctx.globalAlpha = 0.03; ctx.fillStyle = P.ink;
    for (const [a, b] of [[0.2, 0.3], [0.335, 0.352]]) { ctx.beginPath(); ctx.moveTo(a * W, 0); ctx.lineTo(b * W, 0); ctx.lineTo((b - 0.16) * W, glassB); ctx.lineTo((a - 0.16) * W, glassB); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    const sill = ctx.createLinearGradient(0, glassB, 0, glassB + 0.09 * H);
    sill.addColorStop(0, 'rgba(159, 179, 214, .07)'); sill.addColorStop(1, 'rgba(159, 179, 214, 0)');
    ctx.fillStyle = sill; ctx.fillRect(0, glassB, W, 0.09 * H);
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
      ctx.fillStyle = 'rgba(17, 22, 31, .72)'; ctx.fill();
      ctx.strokeStyle = target && target.kind === 'putdown' && target.place === pl.place ? P.horizon : P.lineB;
      ctx.lineWidth = Math.max(1, L.dpr); ctx.stroke();
    }
    const order = OBJ.filter((o) => vis[o] && vis[o].a > 0.01).sort((a, b) => vis[a].y - vis[b].y);
    for (const o of order) {
      const v = vis[o], u = L.u * v.k;
      const held = (st.held && st.held.obj === o) || (drag && drag.obj === o);
      const pl = v.y < L.z.split ? L.near : L.far;
      const ground = slotY(pl);
      const lift = clamp((ground - v.y) / (1.2 * L.u), 0, 1);
      if (v.y > 0.5 * L.H) drawShadow(ctx, o, v.x, ground, u, lift);
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
    if (drag && drag.kind === 'crop') box(drag.a, drag.b, P.horizon, true, 1);
    if (flash) {
      const f = (now - flash.t0) / TIME.flash;
      if (f >= 1) flash = null; else box(flash.a, flash.b, flash.kept ? P.gold : P.dim, false, 1 - f);   // gold: a radical was kept
    }
  }
  function drawSlate(ctx, now) {
    if (!slate) return;
    const f = (now - slate.t0) / TIME.slate;
    if (f >= 1) { slate = null; return; }
    const a = Math.min(1, f * 8) * Math.min(1, (1 - f) * 5);
    const fs = Math.round(clamp(L.H * 0.034, 12 * L.dpr, 20 * L.dpr));
    ctx.save();
    ctx.font = `500 ${fs}px 'IBM Plex Mono', ui-monospace, monospace`;
    const w = Math.min(L.W * 0.8, ctx.measureText(slate.text).width + fs * 1.6), h = fs * 2, x = L.W / 2 - w / 2, y = L.glassB - h - 0.016 * L.H;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(6, 8, 13, .82)'; ctx.fillRect(x, y, w, h);
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
    if (!reduced) fogT += dt / 1000;
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

    // where the being looks
    const ph = phaseOf(ink, now), pph = phaseOf(prev, now);
    if (!ph && ink && !ink.still) { ink = null; hooks.inkGone?.(); }
    if (!pph) prev = null;
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
    drawFog();
    drawGlass(ctx);
    if (prev && pph) { inkKey = ''; drawRing(ctx, prev, pph, 1); inkKey = ''; }
    if (ink && ph) drawRing(ctx, ink, ph, 1);
    drawSlate(ctx, now);
    drawDesk(ctx, st, now);
    drawCrop(ctx, now);

    const inkMoving = !reduced && ((ph && !ink.still && !(now - ink.t0 > TIME.bloom && now - ink.t0 < TIME.bloom + ink.hang)) || !!pph);
    if (drag || moving || inkMoving || slate || flash) kick();
    else if (!reduced) idle(80);                       // at rest only the fog moves
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
    const k = recognise(ink.spec, rect, ph.erode);
    const res = k.cells > 0 ? hooks.crop(ink.act, rect, ph.erode, k) : null;      // no ink under the rectangle: nothing to keep
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
    if (!ink || !phaseOf(ink, performance.now())?.crop) { hooks.say?.('There is no ring on the glass to keep.'); return; }
    const rect = sectorRect(ink.spec, role);
    if (!rect) { hooks.say?.('This ring has nothing on that side.'); return; }
    const R = L.ring.R, { cx, cy } = L.ring;
    keep(rect, { x: cx + rect.x0 * R, y: cy + rect.y0 * R }, { x: cx + rect.x1 * R, y: cy + rect.y1 * R });
  }

  /* ---------------- pointer and keys ---------------- */
  const pt = (e) => { const r = canvas.getBoundingClientRect(), k = canvas.width / Math.max(1, r.width); return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }; };
  function thingAt(p, st) {
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
  const mine = (e) => !drag || drag.id == null || e.pointerId == null || e.pointerId === drag.id;
  function onDown(e) {
    if (!enabled || !L || drag || (e.button != null && e.button > 0)) return;      // one pointer at a time
    const p = pt(e), st = hooks.getState();
    pointer = p; pointerAt = performance.now(); keys = false;
    const hit = st.phase === 'day' ? thingAt(p, st) : null;
    if (hit) {
      const inHand = !!(st.held && st.held.obj === hit);
      if (!inHand && st.held) return;                     // one hand
      drag = { kind: 'thing', id: e.pointerId, obj: hit, fresh: !inHand, lifted: inHand, x0: p.x, y0: p.y, dx: vis[hit].x - p.x, dy: vis[hit].y - p.y, p };
    } else if (p.y < L.glassB && phaseOf(ink, performance.now())?.crop) drag = { kind: 'crop', id: e.pointerId, a: p, b: p };
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
      canvas.style.cursor = st.phase === 'day' && enabled && thingAt(p, st) ? 'grab' : p.y < L.glassB && phaseOf(ink, performance.now())?.crop ? 'crosshair' : 'default';
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
    if (d.kind === 'crop') { finishCrop(d); kick(); return; }
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
    snap(); inkKey = ''; kick();
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
    /** The being writes its greeting: the ring of every arrival. */
    greet() { put(ringSpec(sp, GREETING), GREETING, { hang: Infinity }); },   // it stays until the visitor's first act
    /** Put a ring on the glass that stays until replaced (the evening's rings). */
    show(spec) { put(spec, null, { still: true, crop: false }); },
    clear() { if (ink) { const now = performance.now(), ph = phaseOf(ink, now); if (ph) prev = { ...ink, cutAt: now, cutP: ph.p, cutErode: ph.erode }; ink = null; kick(); } },
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
        width: r.width, height: r.height, things,
        ring: { ...at(L.ring.cx, L.ring.cy), R: L.ring.R * k },
        plates: { near: at(L.near.cx, slotY(L.near)), far: at(L.far.cx, slotY(L.far)) },
        air: { near: at(L.W / 2, L.hoverY.near), far: at(L.W / 2, L.hoverY.far) },
        glass: at(L.W / 2, 0.3 * L.H), ink: !!ph, crop: !!(ph && ph.crop),
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
