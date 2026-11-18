/* ============================================================
   heptapod/pod/body.js — the being, grown from its species' seed.

   Material and motion. The being is a living volume standing in
   the dark beyond the glass, and the fog is the only light on it.
   The fog hangs a little behind it, so the fog's light reaches only
   the being's edge on the side that faces the disc: a rim, brightest
   where the body is nearest the fog and fading down to its foot,
   with the growth lines of its skin showing only inside that rim.
   Its thin parts let the light through. The rest of it is a shape
   darker than the faint glow of the air behind it. It breathes:
   a slow swell rises from its foot to its head, and its fronds
   lift with it. When the visitor holds a thing, writes, or raises
   the slate, its neck turns its head toward that, and the whole
   stalk leans a little after it. With motion reduced it does not
   breathe; it still turns, at once.

   How it grows (deterministic from the species' seed; anatomy, not
   decoration):
   - one stalk rising from a broad foot, its thickness along its
     height a smooth profile of six seeded radii, its axis bent by a
     seeded curvature;
   - fronds along the stalk, one per node, alternating sides (the
     distichous arrangement of grasses, a divergence of half a turn,
     R. V. Jean, "Phyllotaxis: a systemic study in plant
     morphogenesis", Cambridge University Press, 1994), each turned
     a seeded little toward or away from the viewer, and no two
     leave the stalk at one height;
     older fronds, lower down, are longer, as in acropetal growth;
     each frond rises from the stalk, curls upward and widens to a
     blade before its point;
   - a head at the stalk's tip, the place where it attends: a long
     bud that the neck turns toward what it attends to, with a dark
     wet opening at its point.
   Never the film's creature and never a seven-limbed radial body
   (research/ip.md rule 7, as amended by H8): the frond count is
   drawn from 4, 5, 6, 8, 9 and 10, the fronds leave the stalk at
   different heights (no centre they radiate from), and none of them
   reaches the floor (it stands on its foot, not on limbs).
   tests/chamber.test.mjs checks the three by count, by the spread of
   the roots and by the silhouette's rotational self-similarity, and
   measures how far apart the three species' silhouettes are.

   How it is drawn. Each part is a round cone (a sphere swept along
   a segment, its radius changing along it). Seen from the front,
   the surface of the nearest cone at a pixel and its normal follow
   from the distance to the cone's axis, so the body is a height
   field with exact normals for every round part; light.js lights
   each pixel with lightAt (the fog), a Fresnel sheen (the fog seen
   in its wet skin) and the light that passes through thin tissue,
   and dims it by the air in front of it (haze, airlight).
   Pure computation: no DOM, so tests run it in Node.
   [ILLUSTRATIVE: the being is invented for this lab; the growth
   rule and the light are cited above]
   ============================================================ */

import { mulberry32, seedOf } from '../../kit/rng.js';
import { LIGHT, lightAt, toLight, airlight, haze, fresnel, glossy, respond, visibility, toSRGB } from './light.js';

export const LIMB_COUNTS = Object.freeze([4, 5, 6, 8, 9, 10]);   // never seven (rule 7)
const STALK = 26;                                        // round cones along the stalk
const FROND = 14;                                        // round cones along a frond
const HEAD_SEG = 18;                                     // round cones along the head

const SKIN = { alb: 0.4, f0: 0.05, rough: 0.38, lines: true };
const HEAD = { alb: 0.4, f0: 0.05, rough: 0.38, lines: false };
const BLADE = HEAD;                       // the fronds' skin: smooth, no growth lines
const MOUTH = { alb: 0.04, f0: 0.06, rough: 0.3, lines: false };
export const BODY = Object.freeze({
  BREATH: 0.035,     // the swell of a breath, as a share of the radius
  SWAY: 0.07,        // how far a frond lifts with a breath, radians at its tip
  TURN: 2.2,         // the most the head turns from upright, radians (it can look down at the table)
  LEAN: 0.1,         // how far the lower stalk leans back against a reach, radians
  TRANSLUCENT: 0.55, // how much of the fog's light thin tissue lets through, at no thickness
  THIN: 0.14,        // the thickness, in body units, over which it falls to 1/e
});

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* Catmull-Rom through points [s, r] sorted by s, evaluated at s. */
function profileAt(P, s) {
  let i = 0;
  while (i < P.length - 2 && s > P[i + 1][0]) i++;
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
  const t = (s - p1[0]) / (p2[0] - p1[0] || 1);
  const m1 = (p2[1] - p0[1]) / 2, m2 = (p3[1] - p1[1]) / 2;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}

/* A chain of points [{ x, y, z, r, s }] to round cones, each carrying the taper's angle at both its ends (from the
   radii either side of each point), so the normals turn smoothly along the chain instead of by segment. */
let CHAIN = 0;
function chain(prims, pts, extra) {
  const n = pts.length, id = ++CHAIN;
  const slope = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1e-9;
    return Math.atan2(a.r - b.r, l);
  });
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    prims.push({ a: [p.x, p.y, p.z], b: [q.x, q.y, q.z], ra: p.r, rb: q.r, ga: slope[i], gb: slope[i + 1], s0: p.s, s1: q.s, chain: id, ...extra(i) });
  }
}

/** The anatomy of one species' being: its numbers, in body units (the stalk is about 4 to 5.2 tall). */
export function growBody(target, sSeed) {
  const rnd = mulberry32(seedOf('body', target, sSeed));
  const r = (a, b) => a + (b - a) * rnd();
  const H = r(4.0, 5.2);
  const sTorso = r(0.32, 0.48);
  // the stalk's thickness up its height: a foot spreading into the floor, the trunk, the torso's swell, the neck
  const profile = [[0, r(0.72, 0.86)], [0.1, r(0.54, 0.62)], [0.24, r(0.42, 0.5)], [sTorso + 0.06, r(0.5, 0.74)], [0.72, r(0.26, 0.34)],
    [0.88, r(0.17, 0.22)], [1, r(0.17, 0.22)]];
  const bend = { a: r(0.12, 0.26), k: r(0.8, 1.4), ph: r(-0.6, 0.6), z: r(-0.1, 0.1), bumps: r(0.015, 0.035), bk: r(5, 9) };
  const sac = { s: sTorso + r(-0.06, 0.08), r: r(0.55, 0.85), len: r(0.18, 0.3) };
  const n = LIMB_COUNTS[Math.floor(rnd() * LIMB_COUNTS.length)];
  const lo = r(0.2, 0.3), hi = r(0.68, 0.8), L0 = r(1.7, 2.6), phi0 = r(-0.25, 0.25);
  const blade = r(0.4, 1);
  const fronds = Array.from({ length: n }, (_, i) => {
    const s = lo + ((hi - lo) * (i + 0.5 + 0.35 * (rnd() - 0.5))) / n;
    const len = L0 * (1.15 - (0.5 * (s - lo)) / (hi - lo)) * r(0.85, 1.12);
    // alternate sides: at phi = +-pi/2 a frond lies across the picture; each is turned a seeded little toward or
    // away from the viewer
    const phi = (i % 2 ? -1 : 1) * (Math.PI / 2 + phi0) + r(-0.3, 0.3);
    return { s, phi, len, r0: r(0.08, 0.13) * Math.sqrt(len / L0) + 0.02, rise: r(0.2, 0.75), curl: r(0.8, 2.2), blade };
  });
  const head = { r: r(0.2, 0.36), len: r(2.4, 4.8), bow: r(0.15, 0.7), lift: r(-0.15, 0.2) };
  return {
    target, seed: sSeed, H, profile, bend, sac, fronds, head,
    lines: r(9, 16),                 // growth lines along the stalk, per unit of its height
    breath: r(5.5, 7.5),             // seconds a breath takes
    breathPh: r(0, 2 * Math.PI),
  };
}

/**
 * The body at a moment: its round cones [{ a: [x, y, z], b, ra, rb, s0, s1, mat }] in body units (x across, y up,
 * z toward the viewer; the foot's centre at the origin). t: seconds (frozen at 0 with motion reduced). att: what it
 * attends to, { x, y } a direction in the picture's plane from its head (y up), with a strength w from 0 to 1. The
 * neck cranes toward it and the head points at it; the lower stalk leans back a little against the reach.
 */
export function poseBody(B, t = 0, att = { x: 0, y: 1, w: 0 }) {
  const prims = [];
  CHAIN = 0;                                   // chains are numbered within one pose
  const ph = (2 * Math.PI * t) / B.breath + B.breathPh;
  const breath = (s) => 1 + BODY.BREATH * Math.sin(ph - 2.4 * s);
  const w = att.w ?? 0;
  const want = Math.max(-BODY.TURN, Math.min(BODY.TURN, Math.atan2(att.x, att.y)));   // from upright, + toward +x
  const turn = want * w;
  // the stalk: integrate its direction up its length
  const pts = [];
  let x = 0, y = 0, z = 0;
  for (let i = 0; i <= STALK; i++) {
    const s = i / STALK;
    const bump = 1 + B.bend.bumps * Math.sin(B.bend.bk * Math.PI * s + B.bend.ph * 3);
    pts.push({ x, y, z, s, r: profileAt(B.profile, s) * breath(s) * bump });
    const ang = B.bend.a * Math.sin(Math.PI * B.bend.k * s + B.bend.ph)
      - BODY.LEAN * Math.sign(turn) * Math.min(1, Math.abs(turn)) * Math.sin(Math.PI * Math.min(1, s / 0.5))
      + 0.42 * turn * smooth(0.45, 1, s);
    const ds = B.H / STALK;
    x += ds * Math.sin(ang); y += ds * Math.cos(ang); z += ds * B.bend.z * Math.cos(Math.PI * s);
  }
  chain(prims, pts.map((p) => ({ ...p, s: p.s * B.H })), () => ({ mat: SKIN }));
  // the sac: a mass on its back (the side away from the disc), along the torso
  {
    const i0 = Math.max(1, Math.round((B.sac.s - B.sac.len / 2) * STALK)), i1 = Math.min(STALK - 1, Math.round((B.sac.s + B.sac.len / 2) * STALK));
    const a = pts[i0], b = pts[i1], m = pts[Math.round((i0 + i1) / 2)];
    const off = 0.45 * m.r;
    prims.push({ a: [a.x + off, a.y, a.z - 0.2 * off], b: [b.x + off, b.y, b.z - 0.2 * off], ra: B.sac.r * a.r, rb: B.sac.r * 0.7 * b.r, s0: a.s * B.H, s1: b.s * B.H, mat: SKIN });
  }
  // the head: it leaves the neck along the neck's own direction and bends to point at what it attends to; its
  // thickness is one smooth swell to its point, cut in HEAD_SEG cones
  const tip = pts[STALK], prev = pts[STALK - 2];
  const a0 = Math.atan2(tip.x - prev.x, tip.y - prev.y);
  const a1 = w > 0 ? a0 + (want - a0) * w : a0 + B.head.bow;            // at rest it bows, by its seed
  const hr = B.head.r * (1 + 0.5 * BODY.BREATH * Math.sin(ph - 2.4));
  const thick = (u) => 0.9 + 0.32 * Math.sin(Math.PI * Math.min(1, u * 1.3)) - 0.6 * u * u;   // the neck's width, a swell, a blunt point
  const L = (B.head.len * hr) / HEAD_SEG;
  const hp = [{ x: tip.x, y: tip.y, z: tip.z, r: hr * thick(0), s: B.H }];
  for (let j = 0; j < HEAD_SEG; j++) {
    const u1 = (j + 1) / HEAD_SEG, ang = a0 + (a1 - a0) * smooth(0, 0.55, u1), p = hp[j];
    hp.push({ x: p.x + L * Math.sin(ang), y: p.y + L * Math.cos(ang), z: p.z + B.head.lift * L, r: hr * Math.max(0.3, thick(u1)), s: B.H + (j + 1) * L });
  }
  chain(prims, hp, (j) => ({ mat: j / HEAD_SEG >= 0.86 ? MOUTH : HEAD }));
  // the fronds
  for (const [fi, f] of B.fronds.entries()) {
    const i = Math.min(STALK - 1, Math.floor(f.s * STALK));
    const p = pts[i], q = pts[i + 1], u = f.s * STALK - i;
    const rx = p.x + (q.x - p.x) * u, ry = p.y + (q.y - p.y) * u, rz = p.z + (q.z - p.z) * u, rr = p.r + (q.r - p.r) * u;
    const ox = Math.sin(f.phi), oz = Math.cos(f.phi);              // outward from the stalk (z toward the viewer)
    const lift = BODY.SWAY * Math.sin(ph - 2.4 * f.s + 0.6 * fi);
    // a frond tapers from the stalk and widens to a blade before its point
    const width = (u) => f.r0 * ((1 - 0.85 * u) + f.blade * 2.2 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 2) * u);
    const fp = [{ x: rx + 0.72 * rr * ox, y: ry, z: rz + 0.72 * rr * oz, r: width(0), s: 0 }];
    for (let k = 0; k < FROND; k++) {
      const u1 = (k + 1) / FROND, p = fp[k];
      const beta = f.rise + f.curl * Math.pow(u1, 1.4) + lift * u1, Lk = f.len / FROND;
      fp.push({ x: p.x + Lk * Math.cos(beta) * ox, y: p.y + Lk * Math.sin(beta), z: p.z + Lk * Math.cos(beta) * oz, r: width(u1), s: u1 * f.len });
    }
    chain(prims, fp, () => ({ mat: BLADE, frond: fi }));
  }
  return prims;
}

/** The box a pose covers in the picture, body units: { x0, x1, y0, y1 }. */
export function boxOf(prims) {
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of prims) {
    x0 = Math.min(x0, p.a[0] - p.ra, p.b[0] - p.rb); x1 = Math.max(x1, p.a[0] + p.ra, p.b[0] + p.rb);
    y1 = Math.max(y1, p.a[1] + p.ra, p.b[1] + p.rb);
  }
  return { x0, x1, y0: 0, y1 };
}

/** The box every pose of the being can reach (breaths, and attention turned fully either way), body units. */
export function reachOf(B) {
  const box = { x0: Infinity, x1: -Infinity, y0: 0, y1: -Infinity };
  for (const t of [0, B.breath / 4, B.breath / 2, (3 * B.breath) / 4]) {
    for (const att of [{ x: 0, y: 1, w: 0 }, { x: -1, y: 0.2, w: 1 }, { x: 1, y: 0.2, w: 1 }, { x: -1, y: -1, w: 1 }, { x: 1, y: -1, w: 1 }]) {
      const b = boxOf(poseBody(B, t, att));
      box.x0 = Math.min(box.x0, b.x0); box.x1 = Math.max(box.x1, b.x1); box.y1 = Math.max(box.y1, b.y1);
    }
  }
  return box;
}

/**
 * Where the being stands and how large it is drawn: the largest scale at which every pose it can take (reach, from
 * reachOf) fits the region { x0, x1, top, foot } of the canvas, centred across it, its foot on the foot row. Returns
 * k (device pixels per body unit), at (the foot's centre), c (its grid's cell, 280 cells tall at most) and box
 * (the grid's extent, device pixels).
 */
export function fitBody(reach, region) {
  const w = Math.max(1, region.x1 - region.x0), hgt = Math.max(1, region.foot - region.top);
  const k = Math.max(1, Math.min(hgt / reach.y1, w / (reach.x1 - reach.x0)));
  const at = { x: region.x0 - k * reach.x0 + Math.max(0, w - k * (reach.x1 - reach.x0)) / 2, y: region.foot };
  const c = Math.max(1, (k * reach.y1) / 280);
  return { k, at, c, box: { x0: at.x + k * reach.x0 - 2 * c, x1: at.x + k * reach.x1 + 2 * c, y0: region.foot - k * reach.y1 - 2 * c, y1: region.foot + c } };
}

/**
 * The body's picture as a height field on a grid of cells c device pixels wide: for each cell the nearest surface's
 * height toward the viewer (h), its normal (n: x across, y down the picture, z toward the viewer), its thickness,
 * the coordinate its growth lines run along, its material, and how much of the cell it covers. at: the screen pixel
 * of the foot's centre; k: device pixels per body unit; box: the grid's extent in device pixels.
 */
export function rasterBody(prims, at, k, c, box) {
  const gw = Math.max(1, Math.ceil((box.x1 - box.x0) / c)), gh = Math.max(1, Math.ceil((box.y1 - box.y0) / c));
  const n = gw * gh;
  const h = new Float32Array(n).fill(-Infinity), cov = new Float32Array(n);
  const N = new Float32Array(3 * n), thick = new Float32Array(n), u = new Float32Array(n);
  const mat = new Array(n).fill(null), ch = new Int32Array(n);
  for (const p of prims) {
    const Ax = at.x + k * p.a[0], Ay = at.y - k * p.a[1], Az = k * p.a[2];
    const Bx = at.x + k * p.b[0], By = at.y - k * p.b[1], Bz = k * p.b[2];
    const ra = k * p.ra, rb = k * p.rb, rm = Math.max(ra, rb) + c;
    const ex = Bx - Ax, ey = By - Ay, e2 = ex * ex + ey * ey || 1e-9;
    // the axis in 3D (screen x, screen y down, toward the viewer) and the taper's angle
    const ez = Bz - Az, el = Math.hypot(ex, ey, ez) || 1e-9, tx = ex / el, ty = ey / el, tz = ez / el;
    const g0 = p.ga ?? Math.atan2(ra - rb, el), g1 = p.gb ?? g0;
    const i0 = Math.max(0, Math.floor((Math.min(Ax, Bx) - rm - box.x0) / c)), i1 = Math.min(gw - 1, Math.ceil((Math.max(Ax, Bx) + rm - box.x0) / c));
    const j0 = Math.max(0, Math.floor((Math.min(Ay, By) - rm - box.y0) / c)), j1 = Math.min(gh - 1, Math.ceil((Math.max(Ay, By) + rm - box.y0) / c));
    for (let j = j0; j <= j1; j++) {
      const py = box.y0 + (j + 0.5) * c;
      if (py > at.y) break;                                   // nothing of it below its foot: it stands on the floor
      for (let i = i0; i <= i1; i++) {
        const px = box.x0 + (i + 0.5) * c;
        // the nearest point of the axis in the picture, and how far the pixel's ray passes from it
        const t0 = Math.max(0, Math.min(1, ((px - Ax) * ex + (py - Ay) * ey) / e2));
        const c0x = Ax + t0 * ex, c0y = Ay + t0 * ey, r0 = ra + t0 * (rb - ra);
        const d0x = px - c0x, d0y = py - c0y, d02 = d0x * d0x + d0y * d0y;
        const d0 = Math.sqrt(d02);
        if (d0 >= r0 + c) continue;
        const q = j * gw + i;
        const cv = Math.min(1, (r0 - d0) / c + 0.5);
        if (cv > cov[q]) cov[q] = cv;
        const inside = d0 < r0;
        // where the ray meets the swept sphere first: along an axis that leans toward the viewer the highest point lies a
        // little further along it than the nearest one (exact for a constant radius: maximise z(t) + sqrt(r^2 - d(t)^2))
        let t = t0;
        if (inside) {
          const k = ez / Math.sqrt(e2), rho = Math.sqrt(r0 * r0 - d02);
          t = Math.max(0, Math.min(1, t0 + (rho * k) / Math.sqrt(1 + k * k) / Math.sqrt(e2)));
        }
        const cx = Ax + t * ex, cy = Ay + t * ey, r = ra + t * (rb - ra), zc = Az + t * ez;
        const dx = px - cx, dy = py - cy, d2 = dx * dx + dy * dy;
        // a cell inside a cone always wins over a cell only at another cone's soft edge
        const hz = inside && d2 < r * r ? zc + Math.sqrt(r * r - d2) : -1e6 + zc - (Math.sqrt(d2) - r);
        // a neighbour along the same chain whose surface meets this one here: their normals are averaged, so a joint
        // does not show as a ring
        const blend = p.chain && ch[q] === p.chain && hz > -1e5 && Math.abs(hz - h[q]) < 1.5 * c;
        if (hz <= h[q] && !blend) continue;
        const keep = blend ? [N[3 * q], N[3 * q + 1], N[3 * q + 2]] : null;
        h[q] = Math.max(h[q], hz); ch[q] = p.chain || 0;
        // the normal: from the axis point to the surface point, tilted along the axis by the cone's taper (so joints
        // between cones of different taper do not show as rings)
        let nx, ny, nz;
        // its thickness where the light would cross it: the chord across the part at the pixel, from the radius there
        if (hz > -1e5) { nx = dx / r; ny = dy / r; nz = (hz - zc) / r; thick[q] = 2 * Math.sqrt(Math.max(0, r0 * r0 - d02)); }
        else { const d = Math.sqrt(d2) || 1; nx = dx / d; ny = dy / d; nz = 0; thick[q] = 0; }
        const gam = g0 + t * (g1 - g0), cg = Math.cos(gam), sg = Math.sin(gam);
        nx = nx * cg + tx * sg; ny = ny * cg + ty * sg; nz = nz * cg + tz * sg;
        if (keep) { const l0 = Math.hypot(nx, ny, nz) || 1; nx = nx / l0 + keep[0]; ny = ny / l0 + keep[1]; nz = nz / l0 + keep[2]; }
        const nl = Math.hypot(nx, ny, nz) || 1;
        N[3 * q] = nx / nl; N[3 * q + 1] = ny / nl; N[3 * q + 2] = nz / nl;
        u[q] = p.s0 + t * (p.s1 - p.s0);
        mat[q] = p.mat;
      }
    }
  }
  return { gw, gh, c, box, h, cov, N, thick, u, mat };
}

/**
 * Light the body's height field in the room R (light.js) and write RGBA bytes (gw * gh * 4). Its cells stand at depth
 * R.Zb less their height. Returns the light (lightAt) on the half of the body facing the disc and on the other half,
 * and on its top and bottom thirds, the share of its area the fog lights (lit), and the box its covered cells span
 * (drawn, device pixels).
 */
export function shadeBody(F, R, at, k, B, out, occ = [], cache = {}) {
  const { gw, gh, c, box, h, cov, N, thick, u, mat } = F;
  // the air in front of the being, per cell: it depends only on where the cell is, so it is kept while the grid stays
  const ck = `${gw}|${gh}|${box.x0}|${box.y0}|${c}|${R.W}|${R.H}`;
  if (cache.key !== ck) {
    cache.key = ck;
    cache.air = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      cache.air[j * gw + i] = airlight(R, Math.hypot(box.x0 + (i + 0.5) * c - R.disc.cx, box.y0 + (j + 0.5) * c - R.disc.cy), R.eyeZ, R.Zb);
    }
    cache.T = haze(R, R.Zb);
  }
  const AIR = cache.air, T = cache.T;
  const [lr, lg, lb] = LIGHT.RGB, X = LIGHT.EXPOSURE;
  const P = [0, 0, 0], n = [0, 0, 0];
  const toward = Math.sign(R.disc.cx - at.x) || 1;
  const m = { near: 0, nN: 0, far: 0, nF: 0, top: 0, nT: 0, low: 0, nL: 0, area: 0, litA: 0 };
  const drawn = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  let ytop = Infinity;
  for (let q = 0; q < gw * gh; q++) if (cov[q] > 0) { ytop = box.y0 + Math.floor(q / gw) * c; break; }
  const tall = Math.max(1, at.y - ytop);
  for (let j = 0; j < gh; j++) {
    const py = box.y0 + (j + 0.5) * c;
    for (let i = 0; i < gw; i++) {
      const q = j * gw + i, o = 4 * q;
      if (!(cov[q] > 0) || !mat[q]) { out[o + 3] = 0; continue; }
      const px = box.x0 + (i + 0.5) * c;
      P[0] = px; P[1] = at.y - py; P[2] = R.Zb - h[q];
      n[0] = N[3 * q]; n[1] = -N[3 * q + 1]; n[2] = -N[3 * q + 2];
      let E = lightAt(R, P, n);
      // its own body hides the fog from the parts below it (the foot under the torso): the spheres that stand for
      // it, less any that this point lies on
      if (E > 0 && occ.length) E *= visibility(R, P, occ, 1.6);
      const M = mat[q];
      const L = toLight(R, P);
      // thin tissue lets the fog's light through when the fog is behind it
      const through = thick[q] < 3 * BODY.THIN * k ? BODY.TRANSLUCENT * Math.exp(-thick[q] / (BODY.THIN * k)) * L.s * L.s * Math.max(0, L.l[2]) : 0;
      let lin = 0;
      if (E > 0 || through > 0) {
        // growth lines: thin darker rings along its length, seen only where the light falls
        const ring = 0.5 + 0.5 * Math.cos(2 * Math.PI * u[q] * B.lines);
        const alb = M.lines ? M.alb * (1 - 0.3 * ring ** 12) : M.alb;
        const vn = n[2];                                       // the view runs along +z: v.n
        const rx = -2 * vn * n[0], ry = -2 * vn * n[1], rz = 1 - 2 * vn * n[2];
        const spec = vn < 0 && E > 0 ? fresnel(-vn, M.f0) * glossy(rx * L.l[0] + ry * L.l[1] + rz * L.l[2], Math.asin(L.s), M.rough) : 0;
        lin = respond(X * (alb * E + spec + M.alb * through));
      }
      const v = T * lin + AIR[q];
      out[o] = toSRGB(v * lr); out[o + 1] = toSRGB(v * lg); out[o + 2] = toSRGB(v * lb);
      out[o + 3] = Math.round(255 * cov[q]);
      if (cov[q] > 0.05) { drawn.x0 = Math.min(drawn.x0, px - c / 2); drawn.x1 = Math.max(drawn.x1, px + c / 2); drawn.y0 = Math.min(drawn.y0, py - c / 2); drawn.y1 = Math.max(drawn.y1, py + c / 2); }
      if (cov[q] < 1) continue;
      m.area++;
      if (E > 0.002) m.litA++;
      if ((px - at.x) * toward > 0) { m.near += E; m.nN++; } else { m.far += E; m.nF++; }
      const fy = (at.y - py) / tall;
      if (fy > 2 / 3) { m.top += E; m.nT++; } else if (fy < 1 / 3) { m.low += E; m.nL++; }
    }
  }
  return { near: m.nN ? m.near / m.nN : 0, far: m.nF ? m.far / m.nF : 0, top: m.nT ? m.top / m.nT : 0, low: m.nL ? m.low / m.nL : 0,
    lit: m.area ? m.litA / m.area : 0, drawn };
}

/** Spheres that stand for the body when it hides the fog from its floor (light.js visibility), in the room. */
export function bodyOccluders(B, at, k, Zb) {
  const prims = poseBody(B, 0);
  const out = [];
  for (const s of [0.16, 0.3, 0.44, 0.58, 0.72, 0.86]) {
    const p = prims[Math.min(STALK - 1, Math.floor(s * STALK))];
    // a sphere for the stalk there, never reaching below the floor (where it would cut a hole of shadow)
    const r = Math.min(k * p.ra * 0.95, k * p.a[1]);
    out.push({ c: [at.x + k * p.a[0], k * p.a[1], Zb - k * p.a[2]], r });
  }
  return out;
}

/* ---------------- rule 7, measured ---------------- */

/** The silhouette of a pose on a square grid of g cells, scaled so its height fills the grid and its foot is centred. */
export function silhouette(prims, g = 96) {
  const b = boxOf(prims);
  const span = Math.max(b.y1, b.x1 - b.x0);
  const k = (g - 2) / span;
  const F = rasterBody(prims, { x: g / 2 - k * (b.x0 + b.x1) / 2, y: g - 1 }, k, 1, { x0: 0, y0: 0, x1: g, y1: g });
  const m = new Uint8Array(g * g);
  for (let q = 0; q < g * g; q++) m[q] = F.cov[q] >= 0.5 ? 1 : 0;
  return m;
}

/** Intersection over union of two masks. */
export function iou(a, b) {
  let i = 0, u = 0;
  for (let q = 0; q < a.length; q++) { i += a[q] & b[q]; u += a[q] | b[q]; }
  return u ? i / u : 1;
}

/**
 * How alike a silhouette is to itself turned by a seventh (and by every share from a third to a ninth) of a turn about
 * its centroid: the largest intersection over union. A radial body of k limbs scores near 1 at its own k.
 */
export function radialSelfSimilarity(m, g = 96) {
  let sx = 0, sy = 0, n = 0;
  for (let q = 0; q < m.length; q++) if (m[q]) { sx += q % g; sy += Math.floor(q / g); n++; }
  const cx = sx / n, cy = sy / n;
  const by = {};
  for (let k = 3; k <= 9; k++) {
    const a = (2 * Math.PI) / k, ca = Math.cos(a), sa = Math.sin(a);
    const r = new Uint8Array(g * g);
    for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) {
      const dx = x - cx, dy = y - cy;
      const X = Math.round(cx + ca * dx - sa * dy), Y = Math.round(cy + sa * dx + ca * dy);
      if (X >= 0 && Y >= 0 && X < g && Y < g) r[y * g + x] = m[Y * g + X];
    }
    by[k] = iou(m, r);
  }
  return by;
}

/** Rule 7's numbers for one anatomy: limbs, the spread of their roots up the stalk, and the lowest frond tip. */
export function rule7(B) {
  const prims = poseBody(B, 0);
  const roots = B.fronds.map((f) => f.s);
  const mean = roots.reduce((a, b) => a + b, 0) / roots.length;
  const spread = Math.sqrt(roots.reduce((a, b) => a + (b - mean) ** 2, 0) / roots.length);
  let low = Infinity;
  for (const p of prims) if (p.frond != null) low = Math.min(low, p.a[1] - p.ra, p.b[1] - p.rb);
  return { limbs: B.fronds.length, rootSpread: spread, lowestLimb: low / B.H };
}
