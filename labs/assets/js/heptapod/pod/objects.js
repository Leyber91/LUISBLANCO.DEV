/* ============================================================
   heptapod/pod/objects.js — the six things on the tray, and the
   small pictures of scenes the notebook and the evening use.

   Nothing here carries a word. A thing shows its four attributes
   by how it is drawn: its tone (dark or light), its size, its
   form (rigid, a vessel, soft) and whether it was made (ruled
   edges) or grown (an uneven outline). A scene picture shows the
   glass at the top, the plate beside it, the plate far from it,
   the thing, and one mark for the act.
   Drawn with the ink ladder only; the lamp is above.
   ============================================================ */

import { cappedDpr } from '../render.js';
import { OBJECTS, SCENES } from './world.js';

/* Plain words for a thing and a scene. They name what a visitor sees and does, never what the being means:
   they are for a screen reader and a tooltip, and no picture on the page carries them. */
export const THING_NAME = { cube: 'the small dark block', bowl: 'the pale bowl', jug: 'the dark jug', seed: 'the dark seed', cloth: 'the pale cloth', stone: 'the pale stone' };
const ACT_NAME = { lift: 'taken', hold: 'held up', putdown: 'set down', give: 'passed through the glass' };
export const sceneName = (i) => { const s = SCENES[i]; return `${THING_NAME[s.obj]}, ${ACT_NAME[s.act]}${s.act === 'give' ? '' : s.place === 'near' ? ' at the glass' : ' far from the glass'}`; };

/* Tints of the ink ladder (--text-bright, --horizon, --surface): light things take the lamp, dark
   things show as an edge of light on a body near the ground colour. */
const TONE = {
  light: { top: '#D9E1F0', front: '#9AA8C0', shade: '#5C6980', edge: 'rgba(234, 240, 251, .8)', inside: '#2A3342' },
  dark: { top: '#28313F', front: '#10151D', shade: '#090C12', edge: 'rgba(159, 179, 214, .5)', inside: '#05070B' },
};
export const SIZE = { small: 0.62, large: 1.12 };          // of the scene's unit
const WIDTH = { cube: 0.62, bowl: 1.3, jug: 0.86, seed: 0.74, cloth: 1.34, stone: 0.72 };
const HEIGHT = { cube: 0.74, bowl: 0.6, jug: 1.3, seed: 0.42, cloth: 0.4, stone: 0.5 };
export const objW = (name, u) => WIDTH[name] * u;
export const objH = (name, u) => HEIGHT[name] * u;

const poly = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };

const DRAW = {
  /* small, dark, made, rigid: a block seen from a little above */
  cube(ctx, u, T) {
    const w = 0.62 * u, h = 0.52 * u, d = 0.22 * u, k = 0.1 * u;
    poly(ctx, [[-w / 2, 0], [w / 2, 0], [w / 2, -h], [-w / 2, -h]]); ctx.fillStyle = T.front; ctx.fill();
    poly(ctx, [[-w / 2, -h], [w / 2, -h], [w / 2 - k, -h - d], [-w / 2 + k, -h - d]]); ctx.fillStyle = T.top; ctx.fill();
    ctx.strokeStyle = T.edge; ctx.lineWidth = Math.max(1, u * 0.018);
    poly(ctx, [[-w / 2 + k, -h - d], [w / 2 - k, -h - d], [w / 2, -h], [-w / 2, -h]]); ctx.stroke();
    ctx.globalAlpha *= 0.45; ctx.beginPath(); ctx.moveTo(-w / 2, -h); ctx.lineTo(-w / 2, 0); ctx.moveTo(w / 2, -h); ctx.lineTo(w / 2, 0); ctx.stroke();
  },
  /* large, light, made, a vessel: an open bowl */
  bowl(ctx, u, T) {
    const rx = 0.65 * u, ry = 0.15 * u, h = 0.44 * u;
    ctx.beginPath(); ctx.moveTo(-rx, -h); ctx.bezierCurveTo(-rx, -h * 0.1, -rx * 0.42, 0, 0, 0); ctx.bezierCurveTo(rx * 0.42, 0, rx, -h * 0.1, rx, -h); ctx.closePath();
    const g = ctx.createLinearGradient(-rx, 0, rx, 0); g.addColorStop(0, T.shade); g.addColorStop(0.45, T.front); g.addColorStop(1, T.shade);
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -h, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = T.inside; ctx.fill();
    ctx.strokeStyle = T.edge; ctx.lineWidth = Math.max(1, u * 0.024); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -h, rx * 0.86, ry * 0.7, 0, Math.PI * 1.06, Math.PI * 1.94); ctx.globalAlpha *= 0.5; ctx.strokeStyle = T.top; ctx.lineWidth = Math.max(1, u * 0.014); ctx.stroke();
  },
  /* large, dark, made, a vessel: a jug with a neck, a lip and a handle */
  jug(ctx, u, T) {
    const w = 0.3 * u, n = 0.13 * u, h = 1.24 * u;
    ctx.strokeStyle = T.edge; ctx.lineWidth = Math.max(1.2, u * 0.05);
    ctx.beginPath(); ctx.moveTo(n + u * 0.03, -h * 0.84); ctx.bezierCurveTo(w + u * 0.34, -h * 0.86, w + u * 0.3, -h * 0.4, w * 0.92, -h * 0.4);
    ctx.globalAlpha *= 0.7; ctx.stroke(); ctx.globalAlpha /= 0.7;
    ctx.beginPath(); ctx.moveTo(-w * 0.7, 0); ctx.bezierCurveTo(-w * 1.25, -h * 0.2, -w * 1.2, -h * 0.58, -n, -h * 0.74);
    ctx.lineTo(-n * 1.25, -h); ctx.lineTo(n * 1.05, -h); ctx.lineTo(n, -h * 0.74);
    ctx.bezierCurveTo(w * 1.2, -h * 0.58, w * 1.25, -h * 0.2, w * 0.7, 0); ctx.closePath();
    const g = ctx.createLinearGradient(-w, 0, w, 0); g.addColorStop(0, T.top); g.addColorStop(0.3, T.front); g.addColorStop(1, T.shade);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1, u * 0.018); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-n * 0.1, -h, n * 1.15, n * 0.34, 0, 0, Math.PI * 2); ctx.fillStyle = T.inside; ctx.fill(); ctx.stroke();
  },
  /* small, dark, grown, rigid: a seed, pointed at one end, with its seam */
  seed(ctx, u, T) {
    const a = 0.36 * u, b = 0.19 * u;
    ctx.save(); ctx.translate(0, -b * 1.02); ctx.rotate(-0.16);
    ctx.beginPath(); ctx.moveTo(-a, 0); ctx.bezierCurveTo(-a * 0.62, -b * 1.25, a * 0.5, -b * 1.12, a * 1.06, -b * 0.06);
    ctx.bezierCurveTo(a * 0.5, b * 1.05, -a * 0.6, b * 1.12, -a, 0); ctx.closePath();
    const g = ctx.createLinearGradient(0, -b, 0, b); g.addColorStop(0, T.top); g.addColorStop(0.55, T.front); g.addColorStop(1, T.shade);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = T.edge; ctx.lineWidth = Math.max(1, u * 0.018); ctx.stroke();
    ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.moveTo(-a * 0.9, 0); ctx.quadraticCurveTo(0, -b * 0.42, a * 0.98, -b * 0.04); ctx.stroke();
    ctx.restore();
  },
  /* large, light, made, soft: a cloth folded twice */
  cloth(ctx, u, T) {
    const w = 0.67 * u, h = 0.17 * u;
    const slab = (y, k, fill) => {
      ctx.beginPath(); ctx.moveTo(-w * k, y); ctx.bezierCurveTo(-w * k * 1.04, y - h * 0.6, -w * k * 0.98, y - h, -w * k * 0.9, y - h * 1.04);
      ctx.bezierCurveTo(-w * 0.3, y - h * 1.22, w * 0.3, y - h * 0.9, w * k * 0.92, y - h * 1.06);
      ctx.bezierCurveTo(w * k * 1.03, y - h * 0.9, w * k * 1.04, y - h * 0.4, w * k, y);
      ctx.bezierCurveTo(w * 0.3, y + h * 0.1, -w * 0.3, y - h * 0.08, -w * k, y); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
    };
    ctx.strokeStyle = T.edge; ctx.lineWidth = Math.max(1, u * 0.016);
    slab(0, 1, T.shade); slab(-h * 0.98, 0.95, T.front);
    ctx.beginPath(); ctx.moveTo(-w * 0.84, -h * 2.0); ctx.bezierCurveTo(-w * 0.3, -h * 2.26, w * 0.34, -h * 1.92, w * 0.86, -h * 2.06);
    ctx.lineTo(w * 0.7, -h * 2.36); ctx.bezierCurveTo(w * 0.3, -h * 2.24, -w * 0.3, -h * 2.52, -w * 0.72, -h * 2.32); ctx.closePath();
    ctx.fillStyle = T.top; ctx.fill(); ctx.stroke();
  },
  /* small, light, grown, rigid: a stone with one broken face */
  stone(ctx, u, T) {
    const s = 0.36 * u;
    const out = [[-1, -0.12], [-0.86, -0.78], [-0.3, -1.3], [0.42, -1.22], [0.96, -0.7], [1.0, -0.1], [0.5, 0], [-0.62, 0]].map(([x, y]) => [x * s, y * s]);
    poly(ctx, out); ctx.fillStyle = T.front; ctx.fill();
    poly(ctx, [[-0.86, -0.78], [-0.3, -1.3], [0.42, -1.22], [0.12, -0.72]].map(([x, y]) => [x * s, y * s])); ctx.fillStyle = T.top; ctx.fill();
    poly(ctx, [[0.42, -1.22], [0.96, -0.7], [1.0, -0.1], [0.5, 0], [0.12, -0.72]].map(([x, y]) => [x * s, y * s])); ctx.fillStyle = T.shade; ctx.fill();
    ctx.strokeStyle = T.edge; ctx.lineWidth = Math.max(1, u * 0.016); poly(ctx, out); ctx.stroke();
  },
};

/** Draw a thing with its base centre at (x, y). u is the scene's unit in pixels. */
export function drawObject(ctx, name, x, y, u, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  DRAW[name](ctx, u, TONE[OBJECTS[name].tone]);
  ctx.restore();
}

/** Its shadow on a plate at (x, y): tight and dark when resting, wide and faint when raised (lift 0..1). */
export function drawShadow(ctx, name, x, y, u, lift = 0, squash = 0.3) {
  const rx = objW(name, u) * (0.56 + 0.2 * lift), ry = rx * squash;
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0, 0, 0, ${(0.62 - 0.36 * lift).toFixed(3)})`); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ---------------- scene pictures ---------------- */

/* One mark for the act, drawn beside the thing: a stroke with a head going up (taken), going down
   (set down), up through the glass (given), or a cupped line under it (held). */
function actMark(ctx, act, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, s * 0.09); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (act === 'hold') { ctx.moveTo(x - s * 0.9, y - s * 0.25); ctx.quadraticCurveTo(x, y + s * 0.5, x + s * 0.9, y - s * 0.25); }
  else {
    const up = act !== 'putdown';
    const y0 = up ? y : y - s * 1.3, y1 = up ? y - s * 1.3 : y, k = up ? 1 : -1;
    ctx.moveTo(x, y0); ctx.lineTo(x, y1);
    ctx.moveTo(x - s * 0.42, y1 + k * s * 0.5); ctx.lineTo(x, y1); ctx.lineTo(x + s * 0.42, y1 + k * s * 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * A picture of one scene type in a w x h box: glass, two plates, the thing where the act left it.
 * colors: { ink, dim, faint } from the page's palette.
 */
export function drawScene(ctx, w, h, sceneIdx, colors) {
  const sc = SCENES[sceneIdx];
  const u = h * 0.3;
  const glassY = h * 0.1, nearY = h * 0.56, farY = h * 0.93;
  const plateY = sc.place === 'near' ? nearY : farY;
  const lw = Math.max(1, h * 0.012);
  ctx.save();
  ctx.lineWidth = lw; ctx.lineCap = 'round';
  // the glass: one line, lit when a thing goes through it
  ctx.strokeStyle = sc.act === 'give' ? colors.ink : colors.dim;
  ctx.beginPath(); ctx.moveTo(w * 0.06, glassY); ctx.lineTo(w * 0.94, glassY); ctx.stroke();
  // the two plates: the one the scene happens at is drawn brighter
  for (const [y, rx, on] of [[nearY, w * 0.26, sc.place === 'near' && sc.act !== 'give'], [farY, w * 0.4, sc.place === 'far']]) {
    ctx.strokeStyle = on ? colors.ink : colors.faint;
    ctx.globalAlpha = on ? 0.9 : 1;
    ctx.beginPath(); ctx.ellipse(w / 2, y, rx, h * 0.035, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const x = w * 0.44;
  const raised = h * 0.2;
  let base = plateY - h * 0.012;
  if (sc.act === 'lift' || sc.act === 'hold') base = plateY - raised;
  if (sc.act === 'give') base = glassY + objH(sc.obj, u) * 0.5;
  if (sc.act !== 'give') drawShadow(ctx, sc.obj, x, plateY, u, sc.act === 'putdown' ? 0 : 0.8);
  drawObject(ctx, sc.obj, x, base, u, 1);
  const mx = x + objW(sc.obj, u) / 2 + u * 0.42;
  const s = u * 0.36;
  if (sc.act === 'hold') actMark(ctx, 'hold', x, base + s * 0.5, objW(sc.obj, u) * 0.52, colors.ink);
  else if (sc.act === 'give') actMark(ctx, 'give', mx, glassY + s * 0.9, s, colors.ink);
  else actMark(ctx, sc.act, mx, base - objH(sc.obj, u) * 0.5 + s * 0.65, s, colors.ink);
  ctx.restore();
}

const cache = new Map();
/** A scene picture as an image URL, drawn once per size. */
export function sceneImage(sceneIdx, cssW, cssH, colors) {
  const dpr = cappedDpr();
  const key = `${sceneIdx}|${cssW}|${cssH}|${dpr}`;
  if (!cache.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    drawScene(cv.getContext('2d'), cv.width, cv.height, sceneIdx, colors);
    cache.set(key, cv.toDataURL());
  }
  return cache.get(key);
}

/** A thing alone, for the notebook's key. */
export function objectImage(name, css, colors) {
  const dpr = cappedDpr();
  const key = `o|${name}|${css}|${dpr}`;
  if (!cache.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(css * dpr);
    const u = cv.width * 0.62;
    drawObject(cv.getContext('2d'), name, cv.width / 2, cv.height / 2 + objH(name, u) / 2, u, 1);
    cache.set(key, cv.toDataURL());
  }
  return cache.get(key);
}

/** The mark for an act at a place, alone, for the notebook's key: plate line, glass line, act mark. */
export function actImage(act, place, css, colors) {
  const dpr = cappedDpr();
  const key = `a|${act}|${place}|${css}|${dpr}`;
  if (!cache.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(css * dpr);
    const ctx = cv.getContext('2d'), n = cv.width, s = n * 0.2;
    ctx.lineWidth = Math.max(1, n * 0.05); ctx.lineCap = 'round';
    ctx.strokeStyle = act === 'give' ? colors.ink : colors.faint;
    ctx.beginPath(); ctx.moveTo(n * 0.1, n * 0.12); ctx.lineTo(n * 0.9, n * 0.12); ctx.stroke();
    const py = place === 'near' ? n * 0.52 : n * 0.9;
    if (act !== 'give') { ctx.strokeStyle = colors.dim; ctx.beginPath(); ctx.moveTo(n * 0.22, py); ctx.lineTo(n * 0.78, py); ctx.stroke(); }
    if (act === 'hold') actMark(ctx, 'hold', n / 2, py - s * 1.5, s * 1.1, colors.ink);
    else if (act === 'give') actMark(ctx, 'give', n / 2, n * 0.52, s, colors.ink);
    else actMark(ctx, act, n / 2, py - s * 0.5, s, colors.ink);
    cache.set(key, cv.toDataURL());
  }
  return cache.get(key);
}
