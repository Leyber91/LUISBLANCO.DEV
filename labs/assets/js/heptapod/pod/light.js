/* ============================================================
   heptapod/pod/light.js — the chamber's one light and one air.

   The fog in the disc is the only thing in the room that gives
   light. Every surface the visitor sees (the table, the being's
   floor, the six things, the being) is lit by this file's one
   function, lightAt, and every view ray passes through this file's
   one air, airlight and haze. Nothing else lights the room: no lamp
   over the table, no glow of a gaze.

   The room, in device pixels of the canvas: x across (as on the
   screen), y up from the floor, z away from the viewer. The glass
   stands at z = 0. The table is the plane y = 0 on the visitor's
   side (z < 0) and the being's floor is the same plane beyond it
   (z > 0). A row v of the table lies at depth -(v - sill) * TABLE_DEPTH;
   a row of the floor beyond lies further the nearer it is to the
   horizon, and the horizon is infinitely far. The fog is a sphere
   of the disc's radius whose centre is seen at the disc's centre,
   at depth SPHERE_DEPTH beyond the glass, as high above the floor as
   the disc's centre is above the sill. This is a stage, not a
   camera: heights above a row are read in screen pixels, and depths
   are given by the rows. It is the same stage for every surface, so
   their light agrees.

   The light. A sphere of uniform radiance L lights a surface point
   that sees all of it exactly as a point source of the same power
   at its centre would: E = pi L (R/d)^2 cos(theta), the inverse
   square and Lambert's cosine law (J. H. Lambert, Photometria, 1760).
   Normalised by pi L, a white Lambertian surface then has the
   radiance (R/d)^2 cos(theta) of the fog's own. Near the horizon of a
   surface part of the sphere sinks below it; wrapSphere joins the
   two regimes with a quadratic that matches the cosine and its slope
   at sin(alpha) and goes to zero at -sin(alpha), where alpha is the
   sphere's angular radius [ILLUSTRATIVE: an approximation of the
   exact horizon integral, chosen for a smooth rim].

   The air. Dust in the room scatters the fog's light toward the eye.
   For a point source in a uniform medium with single, isotropic
   scattering and no extinction, a ray that passes the source at a
   distance h collects (1/h) (atan(t1/h) - atan(t0/h)) of it between
   its ends t0 and t1, measured along the ray from the point nearest
   the source (the airlight integral of B. Sun, R. Ramamoorthi,
   S. Narasimhan and S. Nayar, "A practical analytic single scattering
   model for real time rendering", ACM Transactions on Graphics 24(3),
   SIGGRAPH 2005, without its attenuation). A ray that ends on the
   table near the viewer has collected little; one that ends on the
   being has collected the air in front of it; one that goes on into
   the dark beyond has collected the most, so the being reads as a
   darker shape in a faint glow. Depth haze dims what lies far away
   by exp(-sigma z) (the extinction of the same air).

   Shadows. The fog is a large light, so a shadow is soft and a
   contact is dark: the share of the sphere hidden from a point by an
   occluding sphere is the overlap of their two discs as seen from
   the point, in the small-angle plane [ILLUSTRATIVE: exact for small
   discs, approximate for the near ones]. Each thing and the being
   are given to it as a few spheres. The table is polished, so it
   also shows the fog's reflection; a thing standing on it hides
   that reflection in front of itself as well (mirrorVisibility: the
   same overlap, taken on the cone of the reflected view), and that
   dark pool is its contact with the table. The lacquer's gloss and
   body vary a little in long streaks (grainAt) [ILLUSTRATIVE].

   One bounce. The fog's light that crosses the glass reaches the
   visitor's side of the room and comes back: the wall behind the
   viewer, lit by the fog, lights the faces of things turned toward
   the viewer (fillAt). It is the same light, weaker by the square
   of the room's depth, so the front of a pale bowl is dim and the
   front of a dark jug is nearly black, and the tone of a thing can
   still be told from the front.

   Colour. The light is the fog's own colour (#B0B8C5, its middle
   stop) and nothing is lit by any other, so the room keeps the ink
   ladder's cold grey and adds no hue. Values are linear light and
   are encoded to sRGB once, at the end.

   Pure computation: no DOM, so tests/chamber.test.mjs runs it in
   Node. [ILLUSTRATIVE: the room is designed for this lab; the laws
   it applies are published, cited above]
   ============================================================ */

/* sRGB 8-bit to linear and back (IEC 61966-2-1). */
export const toLinear = (c8) => { const c = c8 / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const srgbExact = (x) => { const c = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(255 * c))); };
/* The encoding by table: indexed by the square root of the light, so the darks, where the eye tells steps apart, get
   most of the table's entries (within one level of the exact encoding: tests/chamber.test.mjs). */
const SRGB_N = 4096;
const SRGB_LUT = Uint8Array.from({ length: SRGB_N + 1 }, (_, i) => srgbExact((i / SRGB_N) ** 2));
export const toSRGB = (x) => (x <= 0 ? 0 : x >= 1 ? 255 : SRGB_LUT[Math.round(Math.sqrt(x) * SRGB_N)]);
export { srgbExact };

/* The fog's light from its centre to its edge, by share of the disc's radius (scene.js draws the disc with it). */
export const FOG_STOPS = Object.freeze([[0, '#D3D9E3'], [0.45, '#B0B8C5'], [0.8, '#6E7786'], [1, '#2A303A']]);
const hexLin = (h) => [1, 3, 5].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16)));
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const FOG_MID = hexLin(FOG_STOPS[1][1]);
const FOG_MAX = Math.max(...FOG_MID);

export const LIGHT = Object.freeze({
  RGB: Object.freeze(FOG_MID.map((c) => c / FOG_MAX)),   // the fog's own colour, as linear light, its largest channel 1
  EXPOSURE: 3.2,      // linear radiance of a white surface touching the fog and facing it [ILLUSTRATIVE: set by the look;
                      // what it lights is held under the disc's edge by respond, below]
  SPHERE_DEPTH: 0.5, // the fog's centre beyond the glass, in heights of the canvas
  BEING_FRONT: 0.46,  // the being stands this much nearer the glass than the fog's centre, so the fog is behind it
  TABLE_DEPTH: 1.0,   // depth of the table per screen row below the sill
  EYE: 1.0,           // the viewer's distance before the glass, in heights of the canvas
  EYE_HEIGHT: 0.34,   // the viewer's eye above the table, in heights of the canvas
  SIGMA: 0.12,        // the air's extinction per height of the canvas of depth
  AIR_EDGE: 0.006,    // linear airlight of a ray that grazes the disc's edge and goes on into the dark
  FLOOR: 0.025,       // albedo of the being's floor, a dark ground
  TABLE: 0.035,       // albedo of the table, a polished black
  TABLE_GLOSS: 0.16,  // the share of a mirror's reflection the table keeps, and its roughness in radians
  TABLE_ROUGH: 0.32,
  F0: 0.04,           // reflectance of a polished dielectric at normal incidence (glass, lacquer, glaze)
  BOUNCE: 0.6,        // albedo of the visitor's side of the room (the wall behind the viewer), which returns the fog's light
});

/* The disc is whole (its fog not yet fading into the dark) to this share of its radius; scene.js draws its mask so. */
export const DISC_WHOLE = 0.74;
/* The fog's colour at a share of the disc's radius, as the canvas lays the gradient (between stops, in sRGB). */
export function fogAt(f) {
  let i = 0;
  while (i < FOG_STOPS.length - 2 && f > FOG_STOPS[i + 1][0]) i++;
  const [a, ca] = FOG_STOPS[i], [b, cb] = FOG_STOPS[i + 1], t = Math.max(0, Math.min(1, (f - a) / (b - a)));
  return [1, 3, 5].map((k) => { const x = parseInt(ca.slice(k, k + 2), 16), y = parseInt(cb.slice(k, k + 2), 16); return Math.round(x + (y - x) * t); });
}
/* The disc's edge: the fog where the disc is still whole, as the luma of its sRGB colour (Rec. 709 weights on the
   bytes, as the drive measures the frame). Nothing the fog lights may be brighter. */
export const EDGE_LUMA = (() => { const c = fogAt(DISC_WHOLE); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; })();
/* The most any lit surface gives back (respond's ceiling), in linear light before the light's colour: 0.95 of the fog's
   stop at 0.8 of the radius, which is darker than the fog where the disc is whole, so the bound has a margin. */
export const EDGE_LUM = lum(hexLin(FOG_STOPS[2][1]));
export const CAP = (0.95 * EDGE_LUM) / lum(LIGHT.RGB);

/**
 * What a lit surface gives back, from the light it reflects (linear, before the light's colour): unchanged while dim,
 * and rolling off toward CAP, so nothing the fog lights is ever brighter than the fog's own edge. One response for
 * every surface in the room (a film's shoulder: x -> CAP tanh(x / CAP)).
 */
export const respond = (x) => CAP * Math.tanh(x / CAP);

/* The room for a layout: see the header. All lengths in device pixels. */
export function makeRoom({ W, H, glassB, horizon, foot, disc }) {
  const Zs = LIGHT.SPHERE_DEPTH * H;
  const Zb = Zs - LIGHT.BEING_FRONT * H;
  const eyeZ = -LIGHT.EYE * H;
  // the floor beyond: z = floorK (sill - v) / (v - horizon), so the being's foot row lies at the being's depth
  const floorK = Zb * Math.max(1, foot - horizon) / Math.max(1, glassB - foot);
  const Rs = disc.Rd;
  const t0e = eyeZ - Zs;
  // the air's strength: a ray grazing the disc's edge and going on into the dark collects AIR_EDGE
  const airK = LIGHT.AIR_EDGE * Rs / (Math.PI / 2 - Math.atan(t0e / Rs));
  // the visitor's side: the wall behind the viewer, lit by the fog through the glass, lights the faces of things
  // turned toward the viewer (one bounce of the same light, so the fronts of things are not black)
  const fill = LIGHT.BOUNCE * (Rs / (Zs - eyeZ)) ** 2;
  return {
    W, H, glassB, horizon, foot, disc, Rs, Zs, Zb, eyeZ, floorK, airK, fill,
    S: [disc.cx, glassB - disc.cy, Zs],
    eye: [W / 2, LIGHT.EYE_HEIGHT * H, eyeZ],
  };
}

/* Depth of a row of the table (v below the sill), and of the floor beyond (v between the horizon and the sill). */
export const tableZ = (R, v) => -(v - R.glassB) * LIGHT.TABLE_DEPTH;
export const floorZ = (R, v) => (v <= R.horizon + 0.5 ? Infinity : R.floorK * (R.glassB - v) / (v - R.horizon));
/* The row of the table at a depth (the inverse of tableZ). */
export const rowOfZ = (R, z) => R.glassB - z / LIGHT.TABLE_DEPTH;

/* The sphere's light as cos(theta) goes below sin(alpha): see the header. */
export function wrapSphere(c, s) {
  if (c >= s) return c;
  if (c <= -s) return 0;
  return ((c + s) * (c + s)) / (4 * s);
}

/**
 * The light a surface at P (x, y, z) with unit normal n receives from the fog, as a share of the fog's own radiance:
 * (R/d)^2 * wrapSphere(n.l). A point inside the fog receives all of it.
 */
export function lightAt(R, P, n) {
  const dx = R.S[0] - P[0], dy = R.S[1] - P[1], dz = R.S[2] - P[2];
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= R.Rs) return 1;
  const s = R.Rs / d, c = (n[0] * dx + n[1] * dy + n[2] * dz) / d;
  return s * s * wrapSphere(c, s);
}

/**
 * The light of the visitor's side on a surface with unit normal n: the wall behind the viewer is large, so a face
 * turned to it receives its whole radiance and a face turned away receives none, by the view factor of a plane
 * (1 + cos) / 2 to the face's own plane.
 */
export const fillAt = (R, n) => (R.fill * (1 - n[2])) / 2;

/* The unit direction from P to the fog's centre, the distance, and the sine of the fog's angular radius from P. */
export function toLight(R, P) {
  const dx = R.S[0] - P[0], dy = R.S[1] - P[1], dz = R.S[2] - P[2];
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  return { l: [dx / d, dy / d, dz / d], d, s: Math.min(1, R.Rs / d) };
}

/**
 * Airlight: what a view ray at screen distance r from the disc's centre collects between depths z0 and z1
 * (linear radiance, before the light's colour). Rays run along z; r is clamped to the disc's radius.
 */
export function airlight(R, r, z0, z1) {
  const h = Math.max(r, R.Rs);
  const a1 = z1 === Infinity ? Math.PI / 2 : Math.atan((z1 - R.Zs) / h);
  const a0 = Math.atan((z0 - R.Zs) / h);
  return (R.airK * Math.max(0, a1 - a0)) / h;
}

/* The share of light that crosses the air from depth z to the viewer. */
export const haze = (R, z) => (z === Infinity ? 0 : Math.exp(-LIGHT.SIGMA * Math.max(0, z - R.eyeZ) / R.H));

/* Schlick's approximation of the Fresnel reflectance (C. Schlick, Computer Graphics Forum 13(3), 1994). */
export const fresnel = (cosV, f0 = LIGHT.F0) => f0 + (1 - f0) * Math.pow(1 - Math.max(0, Math.min(1, cosV)), 5);

/**
 * How much of the fog a rough mirror shows along a reflected ray, as a share of the fog's radiance: the ray meets the
 * fog within its angular radius a, and roughness rho spreads the image with a Gaussian tail, keeping its power (the
 * peak falls as the image widens). cosA: the cosine between the reflected ray and the direction of the fog's centre.
 */
export function glossy(cosA, a, rho) {
  const th = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const out = Math.max(0, th - a);
  return Math.exp(-(out * out) / (2 * rho * rho)) * (a * a) / (a * a + 2 * rho * rho);
}

/* The view ray from the eye to a point P of the table, reflected about the table's normal; cosV: the cosine of the
   angle between the view and the normal (for Fresnel). */
export function reflected(R, P) {
  const ex = P[0] - R.eye[0], ey = P[1] - R.eye[1], ez = P[2] - R.eye[2], el = Math.hypot(ex, ey, ez);
  return { r: [ex / el, -ey / el, ez / el], cosV: -ey / el };
}

/* The table's grain, 0 to 1: two octaves of smooth value noise, stretched across the table into long streaks. */
function hash2(i, j) { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export const grainAt = (x, z) => 0.65 * vnoise(1.5 * x, 22 * z) + 0.35 * vnoise(4 * x + 7, 61 * z + 3);

/**
 * How much of the fog's reflection a point P of the table still shows past occluding spheres: the reflected view ray
 * spreads into a cone as wide as the table's roughness, and each sphere hides the overlap of its disc with that cone.
 * A thing standing on the polish so hides the fog's reflection in front of it (its own reflection is dark). The cone
 * is taken at the reflection's whole spread (twice the roughness), so a thing's reflection is as soft as the fog's.
 */
export function mirrorVisibility(R, P, spheres) {
  const { r } = reflected(R, P);
  const aL = 2 * LIGHT.TABLE_ROUGH;
  let v = 1;
  for (const o of spheres) {
    const dx = o.c[0] - P[0], dy = o.c[1] - P[1], dz = o.c[2] - P[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d <= o.r) return 0;
    const cos = (dx * r[0] + dy * r[1] + dz * r[2]) / d;
    if (cos <= 0) continue;
    const aO = Math.asin(Math.min(1, o.r / d)), t = Math.acos(Math.min(1, cos));
    v *= 1 - Math.min(1, lens(aL, aO, t) / (Math.PI * aL * aL));
    if (v <= 0) return 0;
  }
  return v;
}

/* The overlap area of two discs of radii a and b whose centres are t apart. */
function lens(a, b, t) {
  if (t >= a + b) return 0;
  if (t <= Math.abs(a - b)) { const m = Math.min(a, b); return Math.PI * m * m; }
  const x = (t * t + a * a - b * b) / (2 * t * a), y = (t * t + b * b - a * a) / (2 * t * b);
  const k = (-t + a + b) * (t + a - b) * (t - a + b) * (t + a + b);
  return a * a * Math.acos(Math.max(-1, Math.min(1, x))) + b * b * Math.acos(Math.max(-1, Math.min(1, y))) - 0.5 * Math.sqrt(Math.max(0, k));
}

/**
 * The share of the fog a point P still sees past occluding spheres [{ c: [x, y, z], r }]: 1 in full light, 0 in full
 * shadow. Each sphere hides the overlap of its disc with the fog's, both seen from P; the shares multiply. A sphere
 * whose centre is within skip times its radius of P is passed over (P lies on the part it stands for).
 */
export function visibility(R, P, spheres, skip = 0) {
  const L = toLight(R, P);
  const aL = Math.asin(L.s);
  let v = 1;
  for (const o of spheres) {
    const dx = o.c[0] - P[0], dy = o.c[1] - P[1], dz = o.c[2] - P[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (skip > 0 && d <= skip * o.r) continue;          // a point on the occluder's own surface (skip > 1)
    if (d <= o.r) return 0;                             // inside the occluder
    const cos = (dx * L.l[0] + dy * L.l[1] + dz * L.l[2]) / d;
    if (cos <= 0 || d >= L.d) continue;                 // behind the point, or beyond the fog
    const aO = Math.asin(Math.min(1, o.r / d));
    const t = Math.acos(Math.min(1, cos));
    v *= 1 - Math.min(1, lens(aL, aO, t) / (Math.PI * aL * aL));
    if (v <= 0) return 0;
  }
  return v;
}

/* ---------------- the two still layers of a layout ---------------- */

/**
 * The room beyond the glass and the table, per cell of q device pixels: linear RGB (3 floats a cell) and, for the
 * table, the shares of each cell's light that come straight from the fog (direct) and from its reflection (mirror),
 * so a thing standing there can take away what it hides of each. Rows above the horizon are the dark beyond, lit only
 * by the air; rows to the sill are the being's floor; rows below the sill are the table.
 */
export function paintRoom(R, q, occluders = []) {
  const cw = Math.ceil(R.W / q), ch = Math.ceil(R.H / q);
  const rgb = new Float32Array(cw * ch * 3);
  const direct = new Float32Array(cw * ch), mirror = new Float32Array(cw * ch);
  const up = [0, 1, 0];
  const [lr, lg, lb] = LIGHT.RGB;
  const X = LIGHT.EXPOSURE;
  for (let j = 0; j < ch; j++) {
    const v = (j + 0.5) * q;
    for (let i = 0; i < cw; i++) {
      const x = (i + 0.5) * q;
      const r = Math.hypot(x - R.disc.cx, v - R.disc.cy);
      let lin = 0, dir = 0, ref = 0;
      if (v < R.horizon) lin = airlight(R, r, R.eyeZ, Infinity);
      else if (v < R.glassB) {
        const z = floorZ(R, v);
        if (z === Infinity) lin = airlight(R, r, R.eyeZ, Infinity);
        else {
          const P = [x, 0, z];
          const vis = occluders.length ? visibility(R, P, occluders) : 1;
          lin = haze(R, z) * respond(LIGHT.FLOOR * X * lightAt(R, P, up) * vis) + airlight(R, r, R.eyeZ, z);
        }
      } else {
        const z = tableZ(R, v), P = [x, 0, z];
        // the lacquer's grain: its gloss and its body vary a little across the table, in long low streaks
        const g = grainAt(x / R.H, z / R.H);
        dir = LIGHT.TABLE * X * lightAt(R, P, up) * (0.85 + 0.3 * g);
        // the polish: the fog's reflection, blurred by the table's roughness and weighted by Fresnel
        const rd = reflected(R, P);
        const L = toLight(R, P);
        let refl = LIGHT.TABLE_GLOSS * fresnel(rd.cosV) * X * glossy(rd.r[0] * L.l[0] + rd.r[1] * L.l[1] + rd.r[2] * L.l[2], Math.asin(L.s), LIGHT.TABLE_ROUGH);
        refl *= 0.8 + 0.4 * g;
        const tot = respond(dir + refl);
        ref = tot * (refl / Math.max(1e-9, dir + refl));
        dir = tot - ref;
        lin = haze(R, z) * tot + airlight(R, r, R.eyeZ, z);
        dir *= haze(R, z); ref *= haze(R, z);
      }
      const c = 3 * (j * cw + i);
      rgb[c] = lin * lr; rgb[c + 1] = lin * lg; rgb[c + 2] = lin * lb;
      direct[j * cw + i] = lin > 0 ? dir / lin : 0;
      mirror[j * cw + i] = lin > 0 ? ref / lin : 0;
    }
  }
  return { cw, ch, q, rgb, direct, mirror };
}

/** Linear RGB to an RGBA byte buffer (alpha 255), for putImageData. */
export function encode(rgb, out) {
  for (let i = 0, k = 0; i < rgb.length; i += 3, k += 4) {
    out[k] = toSRGB(rgb[i]); out[k + 1] = toSRGB(rgb[i + 1]); out[k + 2] = toSRGB(rgb[i + 2]); out[k + 3] = 255;
  }
  return out;
}
