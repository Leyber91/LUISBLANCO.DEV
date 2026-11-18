/* ============================================================
   heptapod/pod/things.js — the six things as solids in the room.

   Each thing is a closed solid, given by its signed distance (the
   distance to its surface, negative inside; the shapes and their
   smooth union follow Inigo Quilez's distance functions,
   iquilezles.org). Its four attributes are in its matter, not in
   a line around it: tone is its albedo (dark things are glazed or
   waxy, so the fog shows on them as a sheen at the edge), size is
   its size, form is its shape (a block, a vessel, folded cloth),
   and a made thing has ruled edges and smooth glaze where a grown
   thing is uneven and rough.

   A thing is drawn in two steps. Once per size, a small orthographic
   camera looking down 37 degrees (a desk seen from a chair) marches a ray through each pixel
   of its picture and keeps where the ray met the surface, the
   surface's normal and its material (gbuffer). Then, each time the
   thing moves, every kept pixel is lit by the room's one light
   (light.js: lightAt, the airlight and the haze), with a Lambertian
   body and a Fresnel sheen that reflects the fog where the reflected
   view meets it (relight). So a thing has a lit side facing the
   disc, goes dark on the side away from it, is brighter held up in
   the light than set down far from it, and casts a soft shadow
   (occluders: the spheres light.js's visibility hides the fog with).
   No outline is drawn.

   Pure computation: arrays in, arrays out, no DOM, so
   tests/chamber.test.mjs renders the things in Node.
   [ILLUSTRATIVE: the things are designed for this lab]
   ============================================================ */

import { LIGHT, lightAt, fillAt, toLight, airlight, haze, fresnel, glossy, respond, tableZ, toSRGB } from './light.js';

export const ELEV = 0.65;                       // the camera looks down this many radians (37 degrees), as at a desk
const SE = Math.sin(ELEV), CE = Math.cos(ELEV);
/* The viewer's ray into the room, in the room's frame (x across, y up, z away). */
export const VIEW_IN = Object.freeze([0, -SE, CE]);

/* ---------------- distance functions (object units: the scene's unit u is 1) ---------------- */
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
function sdBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function sdEll(x, y, z, a, b, c) {          // a bound, not exact: the march takes smaller steps (STEP)
  const k0 = len3(x / a, y / b, z / c), k1 = len3(x / (a * a), y / (b * b), z / (c * c));
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(a, b, c);
}
function sdCyl(x, y, z, r, y0, y1) {        // a vertical cylinder from y0 to y1
  const dr = Math.hypot(x, z) - r, dy = Math.max(y0 - y, y - y1);
  return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0));
}
const sdTorusY = (x, y, z, R, r) => Math.hypot(Math.hypot(x, z) - R, y) - r;       // in the horizontal plane
const sdTorusZ = (x, y, z, R, r) => Math.hypot(Math.hypot(x, y) - R, z) - r;       // in the picture's plane
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - (h * h * k) / 4; }

/* The stone's faces: a rounded block cut by planes, one of them the broken face (fixed, not seeded: one stone). */
const BROKEN = (() => { const n = [0.78, 0.42, 0.46], l = len3(...n); return n.map((v) => v / l); })();
const SEED_ROT = -0.16, SR_C = Math.cos(SEED_ROT), SR_S = Math.sin(SEED_ROT);

/* Materials: albedo (a grey, of the light's colour), f0 (reflectance at normal incidence) and rough (radians). */
const MAT = {
  lacquer: { alb: 0.055, f0: 0.05, rough: 0.2 },
  glaze: { alb: 0.78, f0: 0.04, rough: 0.28 },
  darkglaze: { alb: 0.06, f0: 0.05, rough: 0.16 },
  wax: { alb: 0.08, f0: 0.04, rough: 0.3 },
  cloth: { alb: 0.7, f0: 0.02, rough: 0.7 },
  stone: { alb: 0.62, f0: 0.03, rough: 0.55 },
};

export const SHAPES = {
  /* small, dark, made, rigid: a block with eased edges */
  cube: {
    box: [0.31, 0, 0.56, 0.28],
    sd: (x, y, z) => sdBox(x, y - 0.27, z, 0.3, 0.27, 0.27, 0.028),
    mat: () => MAT.lacquer,
    occ: [[0, 0.27, 0, 0.31]],
  },
  /* large, light, made, a vessel: an open bowl on a foot ring */
  bowl: {
    box: [0.66, 0, 0.45, 0.66],
    sd(x, y, z) {
      const outer = sdEll(x, y - 0.44, z, 0.65, 0.42, 0.65), inner = sdEll(x, y - 0.44, z, 0.6, 0.37, 0.6);
      const shell = Math.max(outer, -inner, y - 0.44);
      const foot = Math.max(sdCyl(x, y, z, 0.24, 0, 0.06), -sdCyl(x, y, z, 0.19, -1, 0.1));
      return Math.min(shell, foot);
    },
    mat: () => MAT.glaze,
    occ: [[-0.32, 0.27, 0, 0.27], [0.32, 0.27, 0, 0.27], [0, 0.22, 0, 0.3]],
  },
  /* large, dark, made, a vessel: a jug with a neck, a lip and a handle */
  jug: {
    box: [0.56, 0, 1.25, 0.34],
    sd(x, y, z) {
      const body = sdEll(x, y - 0.46, z, 0.33, 0.46, 0.33);
      const neck = sdCyl(x, y, z, 0.115, 0.7, 1.17);
      let d = smin(body, neck, 0.16);
      d = Math.min(d, sdTorusY(x, y - 1.17, z, 0.12, 0.036));
      d = Math.max(d, -sdCyl(x, y, z, 0.085, 0.98, 1.4));                 // the mouth
      const handle = Math.max(sdTorusZ(x - 0.27, y - 0.78, z, 0.19, 0.036), 0.27 - x);
      return Math.min(d, handle);
    },
    mat: () => MAT.darkglaze,
    occ: [[0, 0.44, 0, 0.34], [0, 0.88, 0, 0.16], [0, 1.1, 0, 0.13], [0.38, 0.78, 0, 0.1]],
  },
  /* small, dark, grown, rigid: a seed pointed at one end, with a seam along its ridge */
  seed: {
    box: [0.44, 0, 0.4, 0.22],
    sd(x, y, z) {
      const px = SR_C * x - SR_S * (y - 0.19), py = SR_S * x + SR_C * (y - 0.19);
      return smin(sdEll(px + 0.05, py, z, 0.32, 0.18, 0.19), sdEll(px - 0.19, py + 0.01, z, 0.2, 0.1, 0.11), 0.1);
    },
    mat(x, y, z) {
      const py = SR_S * x + SR_C * (y - 0.19);
      return Math.abs(z) < 0.014 && py > 0.05 ? MAT.lacquer : MAT.wax;     // the seam is darker and glossier
    },
    occ: [[-0.04, 0.18, 0, 0.19], [0.2, 0.17, 0, 0.12]],
  },
  /* large, light, made, soft: a cloth folded twice, its folds' edges round */
  cloth: {
    box: [0.68, 0, 0.36, 0.42],
    sd(x, y, z) {
      const w = 0.012 * Math.sin(8.5 * x + 3 * z);
      const a = sdBox(x, y - 0.06, z, 0.66, 0.06, 0.4, 0.055);
      const b = sdBox(x + 0.015, y - 0.175 - w, z + 0.01, 0.635, 0.058, 0.38, 0.055);
      const c = sdBox(x - 0.01, y - 0.288 - 1.4 * w, z + 0.03, 0.6, 0.052, 0.355, 0.05);
      return Math.min(a, b, c);
    },
    mat: () => MAT.cloth,
    occ: [[-0.42, 0.16, 0, 0.19], [0, 0.17, 0, 0.2], [0.42, 0.16, 0, 0.19]],
  },
  /* small, light, grown, rigid: a stone with one broken face */
  stone: {
    box: [0.4, 0, 0.46, 0.34],
    sd(x, y, z) {
      // a river pebble, flattened and uneven, with one face broken off along a plane
      const wob = 0.03 * Math.sin(5.1 * x + 1.7 * z + 2) * Math.cos(4.3 * z - 0.8) + 0.016 * Math.sin(9.7 * x - 6.1 * y + 3.3 * z);
      const d = sdEll(x + 0.02, y - 0.19, z, 0.37, 0.19, 0.29) + wob;
      return Math.max(smin(d, sdEll(x - 0.13, y - 0.21, z + 0.06, 0.2, 0.16, 0.18) + wob, 0.12), BROKEN[0] * x + BROKEN[1] * (y - 0.2) + BROKEN[2] * z - 0.21);
    },
    mat: () => MAT.stone,
    occ: [[0, 0.23, 0, 0.3]],
  },
};

/* A thing in the hand is lifted and brought toward the glass: of each pixel it rises on the screen above the row it
   is over, LIFT_UP is height and LIFT_IN is depth toward the glass (in pixels of the table's rows). */
export const LIFT_UP = 0.55, LIFT_IN = 1.3;

/**
 * Where a thing is in the room of light.js, from where it is drawn: x and y, the screen pixel of its base's centre,
 * and ground, the screen row of the plate it rests on or is held over. On the plate it lies on the table at that
 * row's depth; held, it is lifted and brought toward the glass, nearer the fog, and never through it.
 */
export function placeOf(R, x, y, ground) {
  const lift = Math.max(0, ground - y);
  return [x, LIFT_UP * lift, Math.min(-0.02 * R.H, tableZ(R, ground) + LIFT_IN * lift * LIGHT.TABLE_DEPTH)];
}

/* A tiny value noise for the grain of grown and rough things (stable: a hash of the cell). */
function grain(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

const STEP = 0.75;         // the march's step, as a share of the distance (the ellipsoid's distance is a bound)

/**
 * The thing's picture as geometry, at res pixels per unit: for each pixel its coverage (a), the surface point (P,
 * object units: x across, y up, z toward the viewer), its normal (N), and its material (alb, f0, rough).
 * ox, oy: the pixel of the base's centre.
 */
export function gbuffer(name, res) {
  const S = SHAPES[name];
  const [bx, y0, y1, bz] = S.box;
  const m = 0.04;
  // the picture's extent: the box's corners seen from the camera (up = y cos e - z sin e)
  const top = (y1 + m) * CE + (bz + m) * SE, bot = (y0 - m) * CE - (bz + m) * SE;
  const w = Math.ceil(2 * (bx + m) * res), h = Math.ceil((top - bot) * res);
  const ox = w / 2, oy = top * res;
  const n = w * h;
  const a = new Float32Array(n), P = new Float32Array(3 * n), N = new Float32Array(3 * n);
  const alb = new Float32Array(n), f0 = new Float32Array(n), rough = new Float32Array(n);
  const eps = 0.35 / res, hN = 0.5 / res;
  const dz0 = -CE, dy0 = -SE;                        // the ray: toward -z (away from the viewer) and down
  const sd = S.sd;
  for (let j = 0; j < h; j++) {
    const sy = (oy - (j + 0.5)) / res;
    for (let i = 0; i < w; i++) {
      const sx = (i + 0.5 - ox) / res;
      // start in front of the box: the origin on the picture's plane, moved 3 units toward the viewer
      let x = sx, y = sy * CE + 3 * SE, z = -sy * SE + 3 * CE;
      let t = 0, hit = false;
      for (let k = 0; k < 96 && t < 6.5; k++) {
        const d = sd(x, y, z);
        if (d < eps) { hit = true; break; }
        const s = Math.max(d * STEP, eps * 0.5);
        y += dy0 * s; z += dz0 * s; t += s;
      }
      const c = j * w + i;
      if (!hit) continue;
      a[c] = 1;
      P[3 * c] = x; P[3 * c + 1] = y; P[3 * c + 2] = z;
      // the normal: four samples on a tetrahedron (Quilez)
      const k1 = sd(x + hN, y - hN, z - hN), k2 = sd(x - hN, y - hN, z + hN), k3 = sd(x - hN, y + hN, z - hN), k4 = sd(x + hN, y + hN, z + hN);
      let nx = k1 - k2 - k3 + k4, ny = -k1 - k2 + k3 + k4, nz = -k1 + k2 - k3 + k4;
      const nl = len3(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      N[3 * c] = nx; N[3 * c + 1] = ny; N[3 * c + 2] = nz;
      const M = S.mat(x, y, z);
      const g = name === 'stone' || name === 'seed' ? 0.86 + 0.28 * grain(x * 40, y * 40, z * 40) : 1;
      alb[c] = M.alb * g; f0[c] = M.f0; rough[c] = M.rough;
    }
  }
  // soft edges: a covered pixel next to an empty one keeps a share of its light by how many of its neighbours are
  // covered (the picture is drawn scaled, and the scaling smooths what is left)
  const a2 = a.slice();
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const c = j * w + i;
    if (!a[c]) continue;
    const k = a[c - 1] + a[c + 1] + a[c - w] + a[c + w];
    if (k < 4) a2[c] = 0.55 + 0.1 * k;
  }
  return { name, res, w, h, ox, oy, a: a2, P, N, alb, f0, rough };
}

/**
 * Light a thing's picture where it stands. at: { x, y } the screen pixel of its base's centre, W: [x, y, z] its
 * base's centre in the room, s: device pixels per unit as drawn. Writes RGBA bytes into out (w * h * 4) and returns
 * what it measured, over the pixels whose surface faces the fog (its normal turned toward the fog's centre, as seen
 * from the base) and over those that face away: the mean light received (E) and the mean luma of the pixels
 * written (sRGB, 0 to 255). Inside a vessel the wall that faces the fog is the far one, and it is counted there.
 */
export function relight(gb, R, at, W, s, out) {
  const { w, h, a, P, N, alb, f0, rough } = gb;
  const k = s / gb.res;                              // device pixels per picture pixel
  const [lr, lg, lb] = LIGHT.RGB;
  const X = LIGHT.EXPOSURE;
  const vx = VIEW_IN[0], vy = VIEW_IN[1], vz = VIEW_IN[2];
  const Pw = [0, 0, 0], Nw = [0, 0, 0];
  let near = 0, nN = 0, far = 0, nF = 0, lNear = 0, lFar = 0, all = 0, nA = 0;
  const L0 = toLight(R, W).l;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = j * w + i, o = 4 * c;
    if (!a[c]) { out[o + 3] = 0; continue; }
    Pw[0] = W[0] + s * P[3 * c]; Pw[1] = W[1] + s * P[3 * c + 1]; Pw[2] = W[2] - s * P[3 * c + 2];
    Nw[0] = N[3 * c]; Nw[1] = N[3 * c + 1]; Nw[2] = -N[3 * c + 2];
    const E = lightAt(R, Pw, Nw);
    const F = fillAt(R, Nw);
    // the sheen: the view reflected about the normal, and how much of it meets the fog
    const vn = vx * Nw[0] + vy * Nw[1] + vz * Nw[2];
    const rx = vx - 2 * vn * Nw[0], ry = vy - 2 * vn * Nw[1], rz = vz - 2 * vn * Nw[2];
    const L = toLight(R, Pw);
    const spec = vn < 0 ? fresnel(-vn, f0[c]) * glossy(rx * L.l[0] + ry * L.l[1] + rz * L.l[2], Math.asin(L.s), rough[c]) : 0;
    const sx = at.x + k * (i + 0.5 - gb.ox), sy = at.y + k * (j + 0.5 - gb.oy);
    const lin = respond(X * (alb[c] * (E + F) + spec));
    const out1 = haze(R, Pw[2]) * lin + airlight(R, Math.hypot(sx - R.disc.cx, sy - R.disc.cy), R.eyeZ, Pw[2]);
    out[o] = toSRGB(out1 * lr); out[o + 1] = toSRGB(out1 * lg); out[o + 2] = toSRGB(out1 * lb);
    out[o + 3] = Math.round(255 * a[c]);
    // facing the fog (its normal turned toward the fog's centre as seen from the base), or away from it
    if (a[c] < 1) continue;
    all += E; nA++;
    const face = Nw[0] * L0[0] + Nw[1] * L0[1] + Nw[2] * L0[2], luma = 0.2126 * out[o] + 0.7152 * out[o + 1] + 0.0722 * out[o + 2];
    if (face > 0.2) { near += E; lNear += luma; nN++; } else if (face < -0.2) { far += E; lFar += luma; nF++; }
  }
  return { near: nN ? near / nN : 0, far: nF ? far / nF : 0, lumNear: nN ? lNear / nN : 0, lumFar: nF ? lFar / nF : 0, nNear: nN, nFar: nF, all: nA ? all / nA : 0 };
}

/** The spheres a thing hides the fog with, in the room: for light.js's visibility. */
export function occluders(name, W, s) {
  return SHAPES[name].occ.map(([x, y, z, r]) => ({ c: [W[0] + s * x, W[1] + s * y, W[2] - s * z], r: s * r }));
}

/** Its body's albedo, for the probe: what the light it receives is divided by. */
export const albedoOf = (name) => SHAPES[name].mat(0, 0.3, 0.3).alb;
