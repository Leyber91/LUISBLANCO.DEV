/* ============================================================
   blackhole/kerr.js — the physics engine. Pure functions, no DOM,
   no WebGL. The shader in shaders.js integrates the SAME equations
   (same Hamiltonian, same RK4, same step rule); this module is the
   reference copy that the page and verify.mjs use to measure.

   Units: G = c = M = 1 inside this file unless a name says otherwise
   (…Kelvin, …Seconds, …Metres). Spin a = J/M, charge q = Q/M,
   a^2 + q^2 < 1 (a hole, not a naked singularity).

   Spacetime: Kerr-Newman in Cartesian Kerr-Schild coordinates
   (Kerr 1963, Phys. Rev. Lett. 11, 237; form as in Visser 2007,
   arXiv:0706.0622, with the charged f):
     g_mn = eta_mn + f k_m k_n,   f = r^2 (2 r - q^2) / (r^4 + a^2 z^2)
     k_m  = (1, (r x + a y)/(r^2+a^2), (r y - a x)/(r^2+a^2), z/r)
     r^4 - (x^2+y^2+z^2 - a^2) r^2 - a^2 z^2 = 0
   The spin axis is +z; frame dragging turns +phi (x toward y).
   Null geodesics follow from H = 1/2 g^mn p_m p_n = 0 with
   g^mn = eta^mn - f k^m k^n (photons carry no charge, so the metric is
   all they feel). p_t is conserved (stationary), so the state is
   (x, y, z, p_x, p_y, p_z).

   Tracing direction. A photon that reaches the camera, followed back
   in time, is a past-directed ray; in these ingoing coordinates such
   rays pile up on the past horizon and never cross it. Kerr-Newman is
   invariant under the isometry (t, phi) -> (-t, -phi), which maps the
   camera (a zero-angular-momentum observer) and the prograde disk to
   themselves and turns that past-directed ray into a FUTURE-directed
   one leaving the camera along the azimuthally mirrored direction. So
   we trace future-directed rays with the screen's right axis negated;
   they cross the horizon smoothly, and inner products such as the
   redshift factor are preserved by the isometry. A disk hit at azimuth
   phi in the traced (mirrored) world is the point -phi of the real one.
   (A moving camera is mirrored too: its azimuthal velocity flips.)
   ============================================================ */

/* ---------------- physical constants (SI) ---------------- */
export const SI = {
  G: 6.67430e-11,              // CODATA 2018
  c: 299792458,
  GMsun: 1.3271244e20,         // IAU 2015 nominal solar mass parameter, m^3 s^-2
  Msun: 1.98847e30,            // kg
  pc: 3.0856775814913673e16,   // m (IAU 2015)
  au: 1.495978707e11,          // m (IAU 2012)
  sigma: 5.670374419e-8,       // Stefan-Boltzmann, W m^-2 K^-4
  kB: 1.380649e-23,
  hbar: 1.054571817e-34,
  LeddPerMsun: 1.2572e31,      // W per solar mass, Eddington luminosity for kappa_es = 0.4 cm^2/g
  uasPerRad: 206264.80624709636e6,
  g0: 9.80665,
};
SI.rgSun = SI.GMsun / (SI.c * SI.c);       // GM_sun/c^2 = 1476.6 m
SI.tgSun = SI.GMsun / (SI.c ** 3);         // GM_sun/c^3 = 4.925 us

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---------------- horizons ---------------- */
export function horizon(a, q = 0) { return 1 + Math.sqrt(Math.max(0, 1 - a * a - q * q)); }
export function innerHorizon(a, q = 0) { return 1 - Math.sqrt(Math.max(0, 1 - a * a - q * q)); }

/* ---------------- circular equatorial orbits ---------------- */
/**
 * Prograde circular equatorial orbit at Boyer-Lindquist radius r. Kepler frequency of
 * Kerr-Newman, Omega = sqrt(r - q^2) / (r^2 + a sqrt(r - q^2)) (reduces to the
 * Bardeen, Press & Teukolsky 1972 1/(r^1.5 + a) at q = 0); u^t, E = -u_t, L = u_phi
 * from the equatorial BL metric. ut is NaN where no timelike orbit exists.
 */
export function circular(a, r, q = 0) {
  const w = Math.sqrt(Math.max(r - q * q, 1e-12));
  const Omega = w / (r * r + a * w);
  const F = (2 * r - q * q) / (r * r);
  const gtt = -(1 - F), gtp = -a * F, gpp = r * r + a * a + a * a * F;
  const N = -(gtt + 2 * Omega * gtp + Omega * Omega * gpp);
  const ut = N > 0 ? 1 / Math.sqrt(N) : NaN;
  return { Omega, ut, E: -ut * (gtt + Omega * gtp), L: ut * (gtp + Omega * gpp), N };
}

/** Circular equatorial photon orbit, prograde (sign=+1) or retrograde. Closed form at
 *  q = 0 (BPT 1972), bisection on the null condition otherwise. */
export function photonOrbit(a, sign = 1, q = 0) {
  if (q === 0) return 2 * (1 + Math.cos((2 / 3) * Math.acos(-sign * a)));
  const s = sign > 0 ? a : -a;
  let lo = horizon(a, q) + 1e-9, hi = 4.5;
  for (let i = 0; i < 80; i++) {
    const m = 0.5 * (lo + hi);
    if (circular(s, m, q).N > 0) hi = m; else lo = m;
  }
  return hi;
}

/** Prograde (sign=+1) or retrograde (sign=-1) innermost stable circular orbit. Closed form
 *  at q = 0 (BPT 1972); otherwise the minimum of E(r) by golden-section search. */
export function isco(a, sign = 1, q = 0) {
  if (q === 0) {
    const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
    const z2 = Math.sqrt(3 * a * a + z1 * z1);
    return 3 + z2 - sign * Math.sqrt(Math.max(0, (3 - z1) * (3 + z1 + 2 * z2)));
  }
  const s = sign > 0 ? a : -a;
  let lo = photonOrbit(a, sign, q) + 1e-4, hi = 12;
  const E = (r) => circular(s, r, q).E;
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
  for (let i = 0; i < 120; i++) {
    if (E(c) < E(d)) hi = d; else lo = c;
    c = hi - gr * (hi - lo); d = lo + gr * (hi - lo);
  }
  return 0.5 * (lo + hi);
}

/** Energy per unit rest mass at the prograde ISCO, and the radiative efficiency 1 - E. */
export function iscoEnergy(a, q = 0) { return circular(a, isco(a, 1, q), q).E; }
export function efficiency(a, q = 0) { return 1 - iscoEnergy(a, q); }

/* ---------------- the Kerr-Schild Hamiltonian ---------------- */

/** BL radius r from Kerr-Schild Cartesian (x, y, z). */
export function ksR(a, x, y, z) {
  const w = x * x + y * y + z * z - a * a;
  return Math.sqrt(0.5 * (w + Math.sqrt(w * w + 4 * a * a * z * z)));
}

/** Covariant metric g_mn at a point, as a 4x4 array (index 0 = t). */
export function metric(a, x, y, z, q = 0) {
  const r = ksR(a, x, y, z), r2 = r * r, A = r2 + a * a;
  const f = r2 * (2 * r - q * q) / (r2 * r2 + a * a * z * z);
  const k = [1, (r * x + a * y) / A, (r * y - a * x) / A, z / r];
  const g = [[-1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g[i][j] += f * k[i] * k[j];
  return g;
}

/**
 * Right-hand side of Hamilton's equations. s = [x,y,z,px,py,pz], pt = p_t (conserved).
 * Writes d/dlambda into out[0..5]. Mirrors GLSL rhs() in shaders.js line for line.
 */
export function rhs(a, s, pt, out, q = 0) {
  const X = s[0], Y = s[1], Z = s[2], px = s[3], py = s[4], pz = s[5];
  const a2 = a * a, q2 = q * q;
  const w = X * X + Y * Y + Z * Z - a2;
  const r2 = 0.5 * (w + Math.sqrt(w * w + 4 * a2 * Z * Z));
  const r = Math.sqrt(r2);
  const A = r2 + a2;
  const den = r2 * r2 + a2 * Z * Z;
  const iden = 1 / den;
  const N = 2 * r2 * r - q2 * r2;
  const f = N * iden;
  const kx = (r * X + a * Y) / A, ky = (r * Y - a * X) / A, kz = Z / r;
  const L = kx * px + ky * py + kz * pz - pt;
  // dx/dl = dH/dp
  out[0] = px - f * L * kx;
  out[1] = py - f * L * ky;
  out[2] = pz - f * L * kz;
  // grad r
  const drx = X * r2 * r * iden, dry = Y * r2 * r * iden, drz = Z * r * A * iden;
  // grad f = (N' den - N 4 r^3) grad r / den^2 - N 2 a^2 z e_z / den^2
  const Np = 6 * r2 - 2 * q2 * r;
  const cf = (Np * den - N * 4 * r2 * r) * iden * iden;
  const dfx = cf * drx, dfy = cf * dry, dfz = cf * drz - N * 2 * a2 * Z * iden * iden;
  // grad (k . p) at fixed p
  const cS = (X * px + Y * py - 2 * r * (kx * px + ky * py)) / A - pz * Z / r2;
  const dSx = cS * drx + (r * px - a * py) / A;
  const dSy = cS * dry + (r * py + a * px) / A;
  const dSz = cS * drz + pz / r;
  // dp/dl = -dH/dx = 1/2 L^2 grad f + f L grad S
  const hl = 0.5 * L * L, fl = f * L;
  out[3] = hl * dfx + fl * dSx;
  out[4] = hl * dfy + fl * dSy;
  out[5] = hl * dfz + fl * dSz;
  return r;
}

/** H for a state (should stay ~0 along a null ray). */
export function hamiltonian(a, s, pt, q = 0) {
  const [X, Y, Z, px, py, pz] = s;
  const r = ksR(a, X, Y, Z), r2 = r * r, A = r2 + a * a;
  const f = r2 * (2 * r - q * q) / (r2 * r2 + a * a * Z * Z);
  const L = ((r * X + a * Y) / A) * px + ((r * Y - a * X) / A) * py + (Z / r) * pz - pt;
  return 0.5 * (-pt * pt + px * px + py * py + pz * pz - f * L * L);
}

/** The step rule shared with the shader: affine step ~ distance to the horizon. */
export function stepSize(r, rh, k) {
  return k * Math.max(r - 0.92 * rh, 0.04) * clamp(r / 3, 0.45, 1.0) + 0.002;
}

const _k1 = new Float64Array(6), _k2 = new Float64Array(6), _k3 = new Float64Array(6), _k4 = new Float64Array(6), _t = new Float64Array(6);

/** One RK4 step of size h; updates s in place, returns r at the start. */
export function rk4(a, s, pt, h, q = 0) {
  const r = rhs(a, s, pt, _k1, q);
  for (let i = 0; i < 6; i++) _t[i] = s[i] + 0.5 * h * _k1[i];
  rhs(a, _t, pt, _k2, q);
  for (let i = 0; i < 6; i++) _t[i] = s[i] + 0.5 * h * _k2[i];
  rhs(a, _t, pt, _k3, q);
  for (let i = 0; i < 6; i++) _t[i] = s[i] + h * _k3[i];
  rhs(a, _t, pt, _k4, q);
  for (let i = 0; i < 6; i++) s[i] += (h / 6) * (_k1[i] + 2 * _k2[i] + 2 * _k3[i] + _k4[i]);
  return r;
}

/* ---------------- the camera: an observer and its frame ---------------- */

const dot4 = (g, u, v) => {
  let s = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) s += g[i][j] * u[i] * v[j];
  return s;
};
const lower = (g, v) => [0, 1, 2, 3].map((i) => g[i][0] * v[0] + g[i][1] * v[1] + g[i][2] * v[2] + g[i][3] * v[3]);

/** KS Cartesian position from oblate-spheroidal (r, theta, phi~): x + iy = (r + ia) e^{i phi} sin(theta). */
export function ksPosition(a, r, theta, phi = 0) {
  const s = Math.sin(theta);
  return [(r * Math.cos(phi) - a * Math.sin(phi)) * s, (r * Math.sin(phi) + a * Math.cos(phi)) * s, r * Math.cos(theta)];
}

/**
 * The camera. Observer kinds:
 *   zamo     zero angular momentum (u . d_phi = 0): the static observer when a = 0,
 *            exists everywhere outside the horizon; "hovering"
 *   faller   free fall from rest at infinity with E = 1, L = 0, Carter Q = 0 (the "rain"
 *            geodesic, which keeps theta fixed): the ZAMO boosted inward with speed
 *            sqrt(1 - alpha^2), alpha the lapse, so E = gamma alpha = 1 exactly
 *   orbiter  moving with the Kepler angular velocity of the local radius (a geodesic in
 *            the equatorial plane; an accelerated observer above it); needs r > r_photon
 * The frame looks at the origin (tilted up by `tilt` radians), screen-up toward +z.
 * Returns lowered covectors so the traced (future-directed, mirrored) ray for a screen
 * direction (nr right, nu up, nf forward) is p_m = U_m + nr R_m + nu Up_m + nf F_m.
 * The mirror: R is MINUS the right-hand frame vector, and the observer's azimuthal
 * velocity is flipped (the isometry reverses phi-motion as well as t).
 */
export function observerFrame(a, pos, { q = 0, observer = 'zamo', tilt = 0 } = {}) {
  const [x, y, z] = pos;
  const g = metric(a, x, y, z, q);
  const r = ksR(a, x, y, z);
  const xt = [1, 0, 0, 0], xp = [0, -y, x, 0];
  const gtp = dot4(g, xt, xp), gpp = dot4(g, xp, xp);
  const omega = gpp > 1e-12 ? -gtp / gpp : 0;
  const norm = (v) => { const n = Math.sqrt(Math.abs(dot4(g, v, v))); return v.map((vi) => vi / n); };
  // The isometry (t, phi) -> (-t, -phi) keeps an observer's angular velocity dphi/dt and
  // reverses its radial velocity dr/dt. So the ZAMO and the orbiter are unchanged in the
  // traced world, and the faller is traced as an observer moving OUTWARD at the same speed.
  let u = norm([1, -y * omega, x * omega, 0]);
  const zamo = u.slice();
  let speed = 0;
  if (observer === 'faller') {
    // E of the ZAMO = -u . xi_t = alpha (the lapse); boosting it radially by v multiplies
    // E by gamma and keeps L = 0, so E = 1 needs gamma = 1 / alpha
    const Ez = -dot4(g, zamo, xt);
    const v = Math.sqrt(Math.max(0, 1 - Ez * Ez));
    // radial unit vector of the ZAMO frame: KS d_r (at fixed theta, phi~) projected off
    // u, e_phi and e_theta, which is the BL radial direction
    const th = Math.atan2(Math.hypot(x, y), z);
    const ph = Math.atan2(y, x) - Math.atan2(a, r);          // phi~ of the point
    const h = 1e-5 * Math.max(1, r);
    const p0 = ksPosition(a, r - h, th, ph), p1 = ksPosition(a, r + h, th, ph);
    const t0 = ksPosition(a, r, th - 1e-5, ph), t1 = ksPosition(a, r, th + 1e-5, ph);
    const dr3 = [0, 1, 2].map((i) => (p1[i] - p0[i]) / (2 * h));
    const dt3 = [0, 1, 2].map((i) => (t1[i] - t0[i]) / 2e-5);
    const eph = norm(xp);
    const eth = norm(projOff(g, [0, ...dt3], [zamo, eph]));
    const er = norm(projOff(g, [0, ...dr3], [zamo, eph, eth]));
    const gam = 1 / Math.sqrt(Math.max(1e-12, 1 - v * v));
    u = zamo.map((ui, i) => gam * (ui + v * er[i]));    // outward in the traced world = inward in the real one
    speed = v;
  } else if (observer === 'orbiter') {
    const c = circular(a, Math.max(r, photonOrbit(a, 1, q) * 1.02), q);
    const W = c.Omega;
    const v4 = [1, -y * W, x * W, 0];
    const nn = -dot4(g, v4, v4);
    if (nn > 0) {
      u = v4.map((vi) => vi / Math.sqrt(nn));
      const gz = -dot4(g, u, zamo);                     // Lorentz factor relative to the ZAMO
      speed = Math.sqrt(Math.max(0, 1 - 1 / (gz * gz)));
    }
  }
  const proj = (v) => { const c = dot4(g, u, v); return v.map((vi, i) => vi + c * u[i]); };
  const sub = (v, e) => { const c = dot4(g, v, e); return v.map((vi, i) => vi - c * e[i]); };
  // forward seed: toward the origin, tilted toward the projected spin axis
  const len = Math.hypot(x, y, z);
  const f0 = [-x / len, -y / len, -z / len];
  let up0 = [0, 0, 1];
  const dd = f0[0] * up0[0] + f0[1] * up0[1] + f0[2] * up0[2];
  if (Math.abs(dd) > 0.999) up0 = [-1, 0, 0];
  const d2 = f0[0] * up0[0] + f0[1] * up0[1] + f0[2] * up0[2];
  up0 = up0.map((v, i) => v - d2 * f0[i]);
  const ul = Math.hypot(...up0); up0 = up0.map((v) => v / ul);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const fwdC = [0, ...f0.map((v, i) => ct * v + st * up0[i])];
  const upC = [0, ...up0.map((v, i) => ct * v - st * f0[i])];
  const ef = norm(proj(fwdC));
  const eu = norm(sub(proj(upC), ef));
  const f3 = [ef[1], ef[2], ef[3]], u3 = [eu[1], eu[2], eu[3]];
  const rC = [0, f3[1] * u3[2] - f3[2] * u3[1], f3[2] * u3[0] - f3[0] * u3[2], f3[0] * u3[1] - f3[1] * u3[0]];
  const er = norm(sub(sub(proj(rC), ef), eu));
  return {
    pos: [x, y, z], r, observer,
    U: lower(g, u),
    R: lower(g, er).map((v) => -v), Up: lower(g, eu), F: lower(g, ef),
    u, omega, speed,
    lapse: -dot4(g, zamo, xt),                 // ZAMO energy per unit mass at infinity = lapse
  };
}

/** Project v off a list of (unit, mutually orthogonal) vectors with the metric g. */
function projOff(g, v, basis) {
  let out = v.slice();
  for (const e of basis) {
    const ee = dot4(g, e, e), c = dot4(g, out, e) / ee;
    out = out.map((vi, i) => vi - c * e[i]);
  }
  return out;
}

/** Backward-compatible name used by verify.mjs. */
export function zamoCamera(a, pos, upHint, q = 0) { void upHint; return observerFrame(a, pos, { q }); }

/** Traced initial momentum (covariant) for a screen direction (unnormalised ok). */
export function rayMomentum(cam, nr, nu, nf) {
  const n = Math.hypot(nr, nu, nf);
  nr /= n; nu /= n; nf /= n;
  return [0, 1, 2, 3].map((i) => cam.U[i] + nr * cam.R[i] + nu * cam.Up[i] + nf * cam.F[i]);
}

/** Camera position from (distance r_cam, inclination from the spin axis in rad, azimuth). */
export function cameraPosition(rcam, incl, azim = 0, a = 0) {
  return ksPosition(a, rcam, incl, azim);
}

/**
 * Trace one ray from the camera. Returns
 *   { fate: 'captured'|'escaped'|'disk', hits, minr, steps, pt, pphi, g, crossings, path, drift }
 * opts: { q, k, maxSteps, rIn, rOut, disk, path (record points) }.
 */
export function traceRay(a, cam, nr, nu, nf, opts = {}) {
  const { q = 0, k = 0.05, maxSteps = 2000, rIn = 0, rOut = 0, disk = false, path = false } = opts;
  const rEscape = opts.rEscape ?? Math.max(80, cam.r * 1.02);
  const p = rayMomentum(cam, nr, nu, nf);
  const s = new Float64Array([cam.pos[0], cam.pos[1], cam.pos[2], p[1], p[2], p[3]]);
  const pt = p[0];
  const pphi = s[0] * s[4] - s[1] * s[3];
  const rh = horizon(a, q);
  let minr = Infinity, crossings = 0;
  const hits = [], pts = path ? [[s[0], -s[1], s[2]]] : null;
  const done = (fate, extra, i) => ({
    fate, hits, minr, steps: i, pt, pphi, crossings, path: pts,
    drift: Math.abs(hamiltonian(a, s, pt, q)), ...extra,
  });
  for (let i = 0; i < maxSteps; i++) {
    const r = ksR(a, s[0], s[1], s[2]);
    minr = Math.min(minr, r);
    if (r < rh * 0.98) return done('captured', {}, i);
    const outward = s[0] * s[3] + s[1] * s[4] + s[2] * s[5] > 0;
    if (r > rEscape && outward) return done('escaped', { dir: [s[3], -s[4], s[5]] }, i);
    const z0 = s[2], x0 = s[0], y0 = s[1];
    rk4(a, s, pt, stepSize(r, rh, k), q);
    if (pts) pts.push([s[0], -s[1], s[2]]);
    if (z0 * s[2] < 0) {
      const t = z0 / (z0 - s[2]);
      const hx = x0 + t * (s[0] - x0), hy = y0 + t * (s[1] - y0);
      const rr = Math.sqrt(Math.max(0, hx * hx + hy * hy - a * a));
      if (disk && rr >= rIn && rr <= rOut) {
        hits.push({ r: rr, phi: -Math.atan2(hy, hx), n: crossings });
        return done('disk', { g: diskG(a, rr, pt, pphi, q) }, i);
      }
      crossings++;
    }
  }
  // a ray still winding after maxSteps sits on the critical curve: count it as captured
  return done('captured', { maxed: true }, maxSteps);
}

/* ---------------- the shadow: analytic (Bardeen 1973) ---------------- */

/**
 * Critical curve seen by a distant observer at inclination incl (rad from the spin axis),
 * in impact-parameter coordinates (alpha, beta) in units of M. Parametrised by the radius
 * of the spherical photon orbits (Bardeen 1973, in "Black Holes", Les Houches; Chandrasekhar
 * 1983). q = 0 only. Returns points around the full curve.
 */
export function shadowCurve(a, incl, n = 720) {
  const s = Math.max(Math.sin(incl), 1e-4), c = Math.cos(incl);
  if (a < 1e-4) {
    const R = Math.sqrt(27), pts = [];
    for (let i = 0; i < 2 * n; i++) { const t = Math.PI * i / n; pts.push([R * Math.cos(t), R * Math.sin(t)]); }
    return pts;
  }
  const xiOf = (r) => (r * r * (3 - r) - a * a * (r + 1)) / (a * (r - 1));
  const etaOf = (r) => r * r * r * (4 * a * a - r * (r - 3) * (r - 3)) / (a * a * (r - 1) * (r - 1));
  const b2Of = (r) => { const xi = xiOf(r); return etaOf(r) + a * a * c * c - xi * xi * (c * c) / (s * s); };
  const r1 = photonOrbit(a, 1), r2 = photonOrbit(a, -1);
  // the visible arc is where b2 >= 0: locate its maximum, then bisect out to each end
  let rm = r1, bm = -Infinity;
  for (let i = 0; i <= 400; i++) { const r = r1 + (r2 - r1) * i / 400; const b = b2Of(r); if (b > bm) { bm = b; rm = r; } }
  const bisect = (inside, outside) => {
    if (b2Of(outside) >= 0) return outside;
    for (let i = 0; i < 80; i++) { const m = 0.5 * (inside + outside); if (b2Of(m) >= 0) inside = m; else outside = m; }
    return inside;
  };
  const ra = bisect(rm, r1), rb = bisect(rm, r2);
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    // cosine spacing crowds samples at the ends where beta -> 0 fast
    const r = ra + (rb - ra) * 0.5 * (1 - Math.cos(Math.PI * i / n));
    const alpha = -xiOf(r) / s, beta = Math.sqrt(Math.max(0, b2Of(r)));
    top.push([alpha, beta]);
    bot.push([alpha, -beta]);
  }
  return top.concat(bot.reverse());
}

/** Critical impact parameter of a Reissner-Nordstrom hole (a = 0, charge q). */
export function rnCriticalB(q) {
  const rp = (3 + Math.sqrt(9 - 8 * q * q)) / 2;
  return rp / Math.sqrt(1 - 2 / rp + q * q / (rp * rp));
}

/** Horizontal chord at beta = 0 and the vertical chord through the chord's midpoint. */
export function shadowChords(curve) {
  let amin = Infinity, amax = -Infinity, bmax = 0;
  for (const [x, y] of curve) { amin = Math.min(amin, x); amax = Math.max(amax, x); bmax = Math.max(bmax, Math.abs(y)); }
  const ac = 0.5 * (amin + amax);
  let best = 0;
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1], [x1, y1] = curve[i];
    if (y0 <= 0 || y1 <= 0) continue;
    if ((x0 - ac) * (x1 - ac) <= 0 && x1 !== x0) best = Math.max(best, y0 + (y1 - y0) * (ac - x0) / (x1 - x0));
  }
  return { width: amax - amin, height: 2 * best, center: ac, amin, amax, bmax };
}

/** Area-equivalent mean diameter of the closed curve (shoelace). */
export function shadowMeanDiameter(curve) {
  let A = 0;
  for (let i = 0; i < curve.length; i++) {
    const [x0, y0] = curve[i], [x1, y1] = curve[(i + 1) % curve.length];
    A += x0 * y1 - x1 * y0;
  }
  return 2 * Math.sqrt(Math.abs(A) / 2 / Math.PI);
}

/**
 * Angle to impact parameter for an observer at finite radius ro. Exact for a = 0
 * (Synge 1966, MNRAS 131, 463: b = r sin(theta) / sqrt(1 - 2/r)); the spin correction
 * is of order a/ro, below 1e-3 for the telescope camera at ro = 1000.
 */
export const angleToImpact = (theta, ro) => ro * Math.sin(theta) / Math.sqrt(1 - 2 / ro);

/** Angular radius of the shadow for a static observer at r (a = 0), Synge 1966. */
export function syngeAngle(r) {
  const s = Math.sqrt(27) * Math.sqrt(Math.max(0, 1 - 2 / r)) / r;
  return r <= 3 ? Math.PI - Math.asin(Math.min(1, s)) : Math.asin(Math.min(1, s));
}

/** Bisect capture/escape along a family of screen rays dirOf(t) -> [nr, nu, nf]. */
export function bisectEdge(a, cam, dirOf, tIn, tOut, iters = 30, k = 0.05, q = 0) {
  let lo = tIn, hi = tOut;  // lo captured, hi escaped
  for (let i = 0; i < iters; i++) {
    const m = 0.5 * (lo + hi);
    const [nr, nu, nf] = dirOf(m);
    const fate = traceRay(a, cam, nr, nu, nf, { k, q }).fate;
    if (fate === 'captured') lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}

/**
 * Measure the shadow of a far camera (telescope) with the integrator: horizontal chord at
 * beta = 0 and the vertical chord through its centre, in M.
 */
export function measureShadow(a, inclRad, { q = 0, ro = 1000, k = 0.08, iters = 24 } = {}) {
  const cam = observerFrame(a, cameraPosition(ro, inclRad, 0, a), { q });
  const T = 16 / ro;
  const hor = (t) => [t, 0, 1];
  const left = bisectEdge(a, cam, hor, 0, -T, iters, k, q);
  const right = bisectEdge(a, cam, hor, 0, T, iters, k, q);
  const bL = -angleToImpact(Math.atan(-left), ro), bR = angleToImpact(Math.atan(right), ro);
  const ac = 0.5 * (bL + bR);
  const tc = Math.tan(Math.asin(ac * Math.sqrt(1 - 2 / ro) / ro));
  const ver = (t) => [tc, t, 1];
  const up = bisectEdge(a, cam, ver, 0, T, iters, k, q);
  const dn = bisectEdge(a, cam, ver, 0, -T, iters, k, q);
  const bU = angleToImpact(Math.atan(up), ro), bD = -angleToImpact(Math.atan(-dn), ro);
  return { amin: bL, amax: bR, width: bR - bL, height: bU - bD, center: ac };
}

/* ---------------- photon sub-rings (Johnson et al. 2020) ---------------- */
/**
 * Widths, in impact parameter, of the n = 0, 1, 2 images of the disk annulus [rIn, rOut]
 * along the horizontal line through the shadow centre (far observer at inclination incl),
 * on the side given by sign. Rays are classified by the crossing number at which they hit.
 */
export function subringWidths(a, inclRad, rIn, rOut, { q = 0, sign = 1, ro = 1000, k = 0.04, samples = 4000 } = {}) {
  const cam = observerFrame(a, cameraPosition(ro, inclRad, 0, a), { q });
  const edge = measureShadow(a, inclRad, { q, ro, k: 0.06, iters: 22 });
  const b0 = sign > 0 ? edge.amax : edge.amin;
  const toT = (b) => Math.tan(Math.asin(b * Math.sqrt(1 - 2 / ro) / ro));
  // scan outward from the critical curve in log-spaced steps of (b - b_c)
  const widths = { 0: 0, 1: 0, 2: 0, 3: 0 };
  let prevB = b0, prevN = -1;
  const lo = 1e-7, hi = 30;
  for (let i = 0; i <= samples; i++) {
    const db = lo * Math.pow(hi / lo, i / samples);
    const b = b0 + sign * db;
    const res = traceRay(a, cam, toT(b), 0, 1, { q, k, maxSteps: 6000, disk: true, rIn, rOut });
    const n = res.fate === 'disk' ? res.hits[0].n : -1;
    if (n >= 0 && n <= 3 && n === prevN) widths[n] += Math.abs(b - prevB);
    prevB = b; prevN = n;
  }
  return widths;
}

/** Radius of the spherical photon orbit seen face-on (zero angular momentum, xi = 0). */
export function polarPhotonOrbit(a) {
  if (a < 1e-6) return 3;
  let lo = 1 + 1e-9, hi = 3;   // r^2 (3 - r) - a^2 (r + 1) changes sign on (1, 3]
  const f = (r) => r * r * (3 - r) - a * a * (r + 1);
  for (let i = 0; i < 100; i++) { const m = 0.5 * (lo + hi); if (f(m) > 0) lo = m; else hi = m; }
  return 0.5 * (lo + hi);
}

/** Complete elliptic integral of the first kind K(m), parameter m (m < 1), by the AGM. */
function ellipK(m) {
  let x = 1, y = Math.sqrt(1 - m);
  for (let i = 0; i < 40; i++) { const nx = 0.5 * (x + y); y = Math.sqrt(x * y); x = nx; }
  return Math.PI / (2 * x);
}

/**
 * Lyapunov exponent gamma of the spherical photon orbit at radius r (Kerr, q = 0): each
 * extra half-orbit demagnifies a sub-ring by e^-gamma. Formula as in Johnson et al. 2020
 * (Science Advances 6, eaaz1310):
 *   gamma = 4 r sqrt(chi) K(u+/u-) / (a sqrt(-u-)),  chi = 1 - Delta / (r (r - 1)^2),
 *   u+- = D +- sqrt(D^2 + eta / a^2),  D = (1 - (eta + xi^2) / a^2) / 2.
 * It tends to pi at a = 0. verify.mjs checks it against the integrator's measured ratio.
 */
export function lyapunov(a, r) {
  if (a < 1e-6) return Math.PI;
  const xi = (r * r * (3 - r) - a * a * (r + 1)) / (a * (r - 1));
  const eta = r * r * r * (4 * a * a - r * (r - 3) * (r - 3)) / (a * a * (r - 1) * (r - 1));
  const Delta = r * r - 2 * r + a * a;
  const chi = 1 - Delta / (r * (r - 1) * (r - 1));
  const D = 0.5 * (1 - (eta + xi * xi) / (a * a));
  const s = Math.sqrt(D * D + eta / (a * a));
  const up = D + s, um = D - s;
  return 4 * r * Math.sqrt(chi) * ellipK(up / um) / (a * Math.sqrt(-um));
}

/* ---------------- the disk: Novikov & Thorne 1973, Page & Thorne 1974 ---------------- */

/**
 * Dimensionless flux profile F~(r) (G=c=M=1, per unit Mdot) of a thin disk with a
 * zero-torque inner edge at the ISCO, by direct quadrature of the Page-Thorne formula
 *   F = (Mdot / 4 pi r) * (-Omega_r) / (E - Omega L)^2 * Int_{r_isco}^{r} (E - Omega L) L_r dr
 * using the circular orbits of the current metric. Physical flux:
 *   F_SI = F~ * Mdot c^2 / (G M / c^2)^2.
 */
export function ntFluxTable(a, rOut, n = 512, q = 0) {
  const ri = isco(a, 1, q);
  const rs = [], F = [];
  const d = (fn, r) => { const h = 1e-5 * r; return (fn(r + h) - fn(r - h)) / (2 * h); };
  const Lr = (r) => circular(a, r, q).L, Om = (r) => circular(a, r, q).Omega;
  let integral = 0, prev = null;
  const N = n * 8;
  let j = 0;
  for (let i = 0; i <= N; i++) {
    // quadratic spacing: fine near the ISCO where the profile turns on
    const u = i / N, r = ri + (rOut - ri) * u * u;
    const c = circular(a, r, q);
    const integrand = (c.E - c.Omega * c.L) * d(Lr, r);
    if (prev) integral += 0.5 * (integrand + prev.integrand) * (r - prev.r);
    prev = { r, integrand };
    if (i % 8 === 0) {
      const Fr = i === 0 ? 0 : (1 / (4 * Math.PI * r)) * (-d(Om, r)) / ((c.E - c.Omega * c.L) ** 2) * integral;
      rs[j] = r; F[j] = Fr; j++;
    }
  }
  return { r: rs, F, rIn: ri, rOut };
}

/**
 * Closed form of the same profile at q = 0 (Page & Thorne 1974, eq. 15n), used to
 * cross-check the quadrature in verify.mjs. Returns F~(r) in the same units.
 */
export function ntFluxClosed(a, r) {
  const aa = Math.max(a, 1e-6);
  const x = Math.sqrt(r), x0 = Math.sqrt(isco(aa));
  const t = Math.acos(aa) / 3;
  const x1 = 2 * Math.cos(t - Math.PI / 3), x2 = 2 * Math.cos(t + Math.PI / 3), x3 = -2 * Math.cos(t);
  if (x <= x0) return 0;
  const term = (xi, xj, xk) => 3 * (xi - aa) ** 2 / (xi * (xi - xj) * (xi - xk)) * Math.log((x - xi) / (x0 - xi));
  const bracket = x - x0 - 1.5 * aa * Math.log(x / x0) - term(x1, x2, x3) - term(x2, x1, x3) - term(x3, x1, x2);
  return (3 / (8 * Math.PI)) * bracket / (x ** 4 * (x ** 3 - 3 * x + 2 * aa));
}

/** Peak of a flux table: { r, F }. */
export function tablePeak(tab) {
  let k = 0;
  for (let i = 1; i < tab.F.length; i++) if (tab.F[i] > tab.F[k]) k = i;
  return { r: tab.r[k], F: tab.F[k] };
}

/** Resample T(r)/T_peak = (F/F_peak)^(1/4) onto n points uniform in sqrt((r - rIn)/(rOut - rIn)). */
export function temperatureProfile(tab, n = 512) {
  const pk = tablePeak(tab).F;
  const out = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), r = tab.rIn + (tab.rOut - tab.rIn) * u * u;
    while (j < tab.r.length - 2 && tab.r[j + 1] < r) j++;
    const t = clamp((r - tab.r[j]) / Math.max(1e-12, tab.r[j + 1] - tab.r[j]), 0, 1);
    const F = tab.F[j] + t * (tab.F[j + 1] - tab.F[j]);
    out[i] = Math.pow(Math.max(0, F / pk), 0.25);
  }
  return out;
}

/**
 * Physical disk temperature scale. Mdot from an Eddington ratio lambda:
 *   Mdot c^2 = lambda L_Edd / eta,  L_Edd = 1.257e31 W (M/Msun).
 * Returns the peak effective temperature in kelvin (local, before redshift).
 */
export function diskPeakKelvin(massSun, a, eddRatio, peakF, q = 0) {
  if (!(eddRatio > 0)) return 0;
  const eta = efficiency(a, q);
  const mdotc2 = eddRatio * SI.LeddPerMsun * massSun / eta;          // W
  const rg = SI.rgSun * massSun;                                      // m
  const Fsi = peakF * mdotc2 / (rg * rg);                             // W m^-2
  return Math.pow(Fsi / SI.sigma, 0.25);
}

/** Redshift factor g = nu_obs / nu_emit for a disk element at r, from the traced ray's
 *  conserved p_t and p_phi = x p_y - y p_x (traced, mirrored world; camera energy = 1):
 *  g = 1 / (u^t (E - Omega L)) with E = -p_t, L = p_phi. */
export function diskG(a, r, pt, pphi, q = 0) {
  const c = circular(a, r, q);
  return 1 / (c.ut * (-pt - c.Omega * pphi));
}

/** Orbital speed of the disk measured by the local ZAMO, in units of c (equatorial plane). */
export function diskSpeed(a, r, q = 0) {
  const c = circular(a, r, q);
  const F = (2 * r - q * q) / (r * r);
  const gtp = -a * F, gpp = r * r + a * a + a * a * F;
  const omegaZ = -gtp / gpp;
  // v = sqrt(g_phiphi) (Omega - omega) / alpha, alpha = 1 / (u^t of the ZAMO)
  const gtt = -(1 - F);
  const alpha = Math.sqrt(Math.max(1e-12, omegaZ * omegaZ * gpp - gtt));
  return Math.sqrt(gpp) * (c.Omega - omegaZ) / alpha;
}

/* ---------------- the plunge: rain from rest at infinity ---------------- */

/**
 * The "rain" geodesic: E = 1, L_z = 0, Carter Q = 0. For Kerr-Newman it keeps theta fixed and
 *   rho^4 (dr/dtau)^2 = (r^2 + a^2)(2 r - q^2)
 *   dt/dtau   = [(r^2 + a^2)^2 / Delta - a^2 sin^2 theta] / rho^2       (BL time: the far clock)
 *   dphi/dtau = a (2 r - q^2) / (Delta rho^2)                          (frame dragging)
 * with Delta = r^2 - 2 r + a^2 + q^2, rho^2 = r^2 + a^2 cos^2 theta. At a = q = 0 this is the
 * Schwarzschild raindrop with dr/dtau = -sqrt(2/r).
 */
export function rain(a, theta, q = 0) {
  const c2 = Math.cos(theta) ** 2, s2 = 1 - c2;
  const rho2 = (r) => r * r + a * a * c2;
  const Delta = (r) => r * r - 2 * r + a * a + q * q;
  return {
    drdtau: (r) => -Math.sqrt(Math.max(0, (r * r + a * a) * (2 * r - q * q))) / rho2(r),
    dtdtau: (r) => ((r * r + a * a) ** 2 / Delta(r) - a * a * s2) / rho2(r),
    dphidtau: (r) => a * (2 * r - q * q) / (Delta(r) * rho2(r)),
  };
}

/**
 * Tabulate a fall from r0 to just outside the horizon: proper time tau, far time t (BL),
 * dragged azimuth phi, and the radial tidal coefficient (per unit length, M units).
 * Tidal: radial eigenvalue 2 r (r^2 - 3 a^2 cos^2 th) / (r^2 + a^2 cos^2 th)^3 of the
 * Weyl tensor (Psi_2 = -M / (r - i a cos th)^3; MTW 1973). Exact on the axis; off the
 * axis the rain observer is boosted in phi relative to the principal frame, an error of
 * order a^2 sin^2(th) / r^2. Charge is not included in the tide.
 */
export function fallTable(a, theta, r0, q = 0, n = 600) {
  const R = rain(a, theta, q);
  const rh = horizon(a, q);
  const rEnd = rh * 1.0005;
  const c2 = Math.cos(theta) ** 2;
  // integrate in u = ln(r - rh) so the far clock's log divergence is resolved
  const u0 = Math.log(r0 - rh), u1 = Math.log(rEnd - rh);
  const rows = [];
  let tau = 0, t = 0, phi = 0;
  for (let i = 0; i <= n; i++) {
    const u = u0 + (u1 - u0) * i / n, r = rh + Math.exp(u);
    if (i > 0) {
      const um = u - 0.5 * (u1 - u0) / n, rm = rh + Math.exp(um);
      const dr = Math.abs(Math.exp(u) - Math.exp(u - (u1 - u0) / n));
      const dtau = dr / Math.abs(R.drdtau(rm));
      tau += dtau; t += R.dtdtau(rm) * dtau; phi += R.dphidtau(rm) * dtau;
    }
    const tidal = 2 * r * (r * r - 3 * a * a * c2) / (r * r + a * a * c2) ** 3;
    rows.push({ r, tau, t, phi, tidal, speed: Math.abs(R.drdtau(r)) });
  }
  return rows;
}

/** Proper time from the horizon to the inner horizon along the axis rain (a = q = 0: to r = 0,
 *  which is 4/3 M). */
export function interiorTau(a, q = 0) {
  const rh = horizon(a, q), rm = innerHorizon(a, q);
  const N = 2000;
  let tau = 0;
  for (let i = 0; i < N; i++) {
    const r0 = rm + (rh - rm) * i / N, r1 = rm + (rh - rm) * (i + 1) / N, x = 0.5 * (r0 + r1);
    // on the axis rho^2 = r^2 + a^2: dtau/dr = (r^2 + a^2) / sqrt((r^2 + a^2)(2r - q^2))
    tau += Math.sqrt((x * x + a * a) / Math.max(1e-12, 2 * x - q * q)) * (r1 - r0);
  }
  return tau;
}

/** Clock rate of a hovering ZAMO relative to the far clock: its lapse alpha. For a = q = 0,
 *  sqrt(1 - 2/r). And of a circular orbiter: 1 / u^t. */
export function hoverClockRate(a, r, theta = Math.PI / 2, q = 0) {
  const c2 = Math.cos(theta) ** 2, s2 = 1 - c2;
  const rho2 = r * r + a * a * c2, D = r * r - 2 * r + a * a + q * q;
  const Sig = (r * r + a * a) ** 2 - a * a * D * s2;
  return Math.sqrt(Math.max(0, rho2 * D / Sig));
}
export function orbitClockRate(a, r, q = 0) { const c = circular(a, r, q); return 1 / c.ut; }

/* ---------------- unit conversions ---------------- */

/** Angular gravitational radius GM / (D c^2) in micro-arcseconds. */
export function thetaG(massSun, distPc) {
  return (SI.rgSun * massSun) / (distPc * SI.pc) * SI.uasPerRad;
}

/** Hawking temperature in kelvin of a Kerr-Newman hole: T = hbar kappa / (2 pi k_B) (Hawking 1975, Commun. Math.
 *  Phys. 43, 199, abstract), with kappa the surface gravity, here surfaceGravity(a, q) in units of c^3 / (G M).
 *  At a = q = 0 kappa is 1/4 and T is hbar c^3 / (8 pi G M k_B); a spinning or charged hole is colder, and an
 *  extremal one (a^2 + q^2 = 1) has T = 0. Ledger row 1. */
export function hawkingKelvin(massKg, a = 0, q = 0) {
  return SI.hbar * SI.c ** 3 * surfaceGravity(a, q) / (2 * Math.PI * SI.G * massKg * SI.kB);
}

/** Surface gravity kappa = (r+ - r-) / (2 (r+^2 + a^2)) in 1/M: the e-folding rate of the
 *  redshift of something seen falling in, as measured by a distant clock. */
export function surfaceGravity(a, q = 0) {
  const rp = horizon(a, q), rm = innerHorizon(a, q);
  return (rp - rm) / (2 * (rp * rp + a * a));
}

/** Radius (M units) where the radial tide on a body of length L metres reaches accel (m s^-2),
 *  in the equatorial plane, where the radial eigenvalue is exactly 2M/r^3 for any spin
 *  (Psi_2 = -M/r^3 at theta = 90 deg). */
export function tideRadius(a, massSun, L, accel) {
  const rg = SI.rgSun * massSun;
  const need = accel * rg * rg / (SI.c * SI.c * L);           // dimensionless tidal coefficient
  void a;
  return Math.cbrt(2 / need);
}

/** Everything the plate shows for one configuration. Mass in solar masses. */
export function summary({ a, q = 0, massSun, distPc, eddRatio, rOut }) {
  const rh = horizon(a, q), ri = isco(a, 1, q), rph = photonOrbit(a, 1, q), rphr = photonOrbit(a, -1, q);
  const rg = SI.rgSun * massSun, tg = SI.tgSun * massSun;
  const tab = ntFluxTable(a, rOut, 256, q);
  const peak = tablePeak(tab);
  const Tpeak = diskPeakKelvin(massSun, a, eddRatio, peak.F, q);
  const tidalCoefH = 2 / (rh * rh * rh);   // equatorial
  return {
    a, q, rh, ri, rph, rphr, eta: efficiency(a, q),
    rgMetres: rg, tgSeconds: tg,
    thetaG: distPc ? thetaG(massSun, distPc) : null,
    Tpeak, rPeak: peak.r, tab,
    iscoPeriodSeconds: 2 * Math.PI / circular(a, ri, q).Omega * tg,
    vIsco: diskSpeed(a, ri, q),
    tidalAtHorizon: tidalCoefH * SI.c * SI.c / (rg * rg) * 2,       // m s^-2 across 2 m
    interiorTauSeconds: interiorTau(a, q) * tg,
    kappa: surfaceGravity(a, q),
    efoldSeconds: tg / surfaceGravity(a, q),
    tide10g: tideRadius(a, massSun, 2, 10 * SI.g0),
  };
}
