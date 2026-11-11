/* ============================================================
   data.js — the Kepler catalogue + the physics that turns a raw
   record into a renderable world.

   Every physical shader input is DERIVED here (deterministic);
   the only randomness is the per-name noise seed + feature
   placement. Rules follow the adversarially-verified science
   spec: null-degradation, a 5-class radius/density classifier,
   true atmospheric scale height, the cosmic-shoreline retention
   gate, a blackbody star colour, and insolation-driven exposure.

   Records come from catalog.js. When a mass is missing or only
   an upper limit, the Chen & Kipping 2017 forecaster (science.js)
   supplies the median; stellar radius and mass come from the
   archive when it has them.
   ============================================================ */

import { forecastFor, starColour, sizeClassOf, limitOf, limitKind } from './science.js';
import { CHEN_KIPPING } from './config.js';

const EARTH_R = 6.371e6, EARTH_M = 5.972e24, G = 6.6743e-11;
const kB = 1.380649e-23, mH = 1.6726e-27;
const RSUN_AU = 0.00465047;     // 1 solar radius in AU

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const num = (v) => (v !== null && v !== undefined && !isNaN(v)) ? +v : null;

// ---- deterministic per-planet randomness (a world looks identical every visit) ----
function hashName(name) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ============================================================
//  PHYSICS — one canonical pass; returns everything downstream needs
// ============================================================
const A_CLASS = [0.30, 0.20, 0.30, 0.40, 0.20];   // provisional Bond albedo per class for Teq fallback

/* [ILLUSTRATIVE] A world with no measured radius still has to be drawn at some size. The
   drawing uses a stand-in radius, never shown as a number and never fed to a derived value:
   the class a bound implies (a radius limit that fixes the class, or a mass lower limit in
   Chen & Kipping's Jovian regime, above 132 M_earth), else a featureless haze at 3 R_earth,
   the least specific surface the renderer has. */
const STAND_IN_R = { rocky: 1.0, super: 1.75, subnep: 3.0, nep: 6.0, giant: 11.2 };
export function radiusStandIn(p) {
  const c = sizeClassOf(p);
  if (c) return { R: STAND_IN_R[c.key], why: `${c.key === 'giant' ? 'a giant' : 'an Earth-size world'} by its radius ${limitKind(limitOf(p, 'R'))}` };
  const L = limitOf(p, 'M');
  if (L && L.dir < 0 && L.v >= CHEN_KIPPING.segments[1].upTo) return { R: STAND_IN_R.giant, why: 'a giant by its mass lower limit' };
  return { R: STAND_IN_R.subnep, why: 'a featureless haze' };
}

export function physics(p) {
  const radiusKnown = typeof p.pl_rade === 'number' && isFinite(p.pl_rade) && p.pl_rade > 0;
  const standIn = radiusKnown ? null : radiusStandIn(p);
  const R = radiusKnown ? p.pl_rade : standIn.R;
  const estMass = p.pl_masse == null;
  const fc = p.pl_masse == null ? forecastFor(p) : null;
  const M = p.pl_masse != null ? p.pl_masse : (fc ? fc.median : Math.pow(R, 2.06));
  const Teff = p.st_teff ?? 5600;
  const Mstar = p.st_mass ?? clamp(Math.pow(Teff / 5772, 1.7), 0.1, 1.6);
  const Rstar = p.st_rad ?? clamp(Math.pow(Mstar, 0.8), 0.1, 4.0);  // solar radii (for star angular size)
  const a = p.pl_orbsmax ?? (p.pl_orbper ? Math.cbrt(Math.pow(p.pl_orbper / 365.25, 2) * Mstar) : 1);

  // radius soft-membership (single tiling scheme)
  let w = [
    1 - smooth(1.4, 1.8, R),                                       // rocky
    smooth(1.4, 1.8, R) * (1 - smooth(1.9, 2.3, R)),              // water/super-Earth
    smooth(1.9, 2.3, R) * (1 - smooth(3.6, 4.2, R)),             // sub-Neptune
    smooth(3.6, 4.2, R) * (1 - smooth(5.6, 6.4, R)),            // ice giant
    smooth(5.6, 6.4, R),                                          // gas giant
  ];
  // density refinement (only with a real mass)
  let rhoRel = null;
  if (!estMass && radiusKnown) {
    rhoRel = clamp(M / Math.pow(R, 3), 0, 1.6);                  // Earth=1, clamp to iron line
    if (R < 2.0 && rhoRel < 0.55) w[1] += 0.4;
    if (R > 2.0 && R < 4.0 && rhoRel > 0.8) { w[1] += 0.3; w[2] -= 0.2; }
  }
  let s = w.reduce((x, y) => x + Math.max(y, 0), 0) + 1e-4;
  w = w.map((x) => Math.max(x, 0) / s);
  const domClass = w.indexOf(Math.max(...w));

  // equilibrium temperature: trust pl_eqt; else derive (Teff^1, verified)
  const A = A_CLASS[domClass];
  const Teq = p.pl_eqt ?? clamp(278.3 * (Teff / 5772) * Math.pow(a, -0.5) * Math.pow(1 - A, 0.25), 30, 4000);

  // gravity / escape
  const gRel = M / (R * R);
  const vEscKms = Math.sqrt(M / R) * 11.186;
  const isGiant = domClass >= 2;

  // atmosphere retention (cosmic shoreline; k=7.0 anchor)
  let atmDensity;
  if (isGiant) atmDensity = 1.0;
  else {
    const Iinsol = Math.pow(Teq / 278.5, 4);
    const margin = Math.log10(vEscKms) - (Math.log10(7.0) + 0.25 * Math.log10(Math.max(Iinsol, 1e-6)));
    atmDensity = smooth(-0.3, 0.3, margin);
  }

  // greenhouse-corrected surface temp — Teq omits the greenhouse, so Earth's own
  // Teq (~255K) sits below freezing. Add an Earth-calibrated offset scaled by how
  // much atmosphere the world actually keeps, then decide the surface state.
  const Tsurf = Teq + (isGiant ? 0 : 33 * atmDensity);
  const Ttest = (a < 0.1) ? Tsurf * 1.18921 : Tsurf;     // substellar dayside for close-in melt
  let state = 'temperate';
  if (Ttest >= 1700) state = 'lava';
  else if (Ttest >= 1200) state = 'partial';
  else if (Tsurf < 245) state = 'ice';                   // genuine snowball (greenhouse already applied)

  // mean molecular weight by regime -> true scale height -> visible shell
  let mu;
  if (isGiant) mu = 2.3;
  else if (state === 'ice') mu = 26;
  else if (state === 'lava' || state === 'partial') mu = 40;
  else if (Teq > 400 && Teq < 1000) mu = 44;                     // CO2 (Venus-like)
  else mu = 29;
  const gSI = 9.80665 * gRel;
  const Hm = kB * Teq / (mu * mH * gSI);                         // metres
  const Hr = Hm / (R * EARTH_R);                                 // in planet radii (tiny, e.g. Earth ~0.0013)
  // a giant IS its atmosphere — the banded disc is the cloud-top. Cap the shell THIN
  // (a limb rim, not a thick wash on top) so it isn't a second atmosphere. Terrestrials
  // keep a fuller visible shell. (Science spec: giants single-layer; atmR tracks H.)
  const atmR = 1.0 + clamp(50 * Hr * atmDensity, 0.018, isGiant ? 0.045 : 0.16);

  // insolation -> exposure multiplier (compressive)
  const Lrel = Rstar * Rstar * Math.pow(Teff / 5772, 4);
  const S = Lrel / (a * a);
  const lightMul = Math.pow(clamp(S, 0.05, 50), 0.25);

  // star angular radius as seen from the planet (rad); huge for close-in worlds
  const starAngle = clamp((Rstar * RSUN_AU) / a, 0.004, 0.5);

  // stellar magnetic activity by spectral type — drives flares/spots/prominences.
  // Cool dwarfs (deep convection) are violently active; hot radiative stars are calm.
  const starActivity = Teff < 3900 ? 0.95 : Teff < 5300 ? 0.6 : Teff < 6000 ? 0.4 : Teff < 7500 ? 0.22 : 0.07;
  const starSpots    = Teff < 3900 ? 0.5  : Teff < 5300 ? 0.35 : Teff < 6000 ? 0.25 : Teff < 7500 ? 0.12 : 0.03;

  return {
    R, M, estMass, Teff, Mstar, Rstar, a, Teq, Tsurf, Ttest, gRel, vEscKms,
    rhoRel, domClass, isGiant, state, atmDensity, Hr, atmR, lightMul, starAngle,
    starActivity, starSpots, radiusKnown, standIn,
  };
}

// ---- classification label for UI / narrative ----
export function classify(p) {
  const ph = physics(p);
  const CLASS_NAME = ['Rocky world', 'Ocean / super-Earth', 'Sub-Neptune', 'Ice giant', 'Gas giant'];
  let label = CLASS_NAME[ph.domClass];
  let habitable = false;
  if (ph.domClass <= 1) {
    if (ph.state === 'lava') label = ph.domClass === 1 ? 'Steam / magma world' : 'Lava world';
    else if (ph.state === 'partial') label = 'Molten-surface world';
    else if (ph.state === 'ice') label = ph.domClass === 1 ? 'Ice / ocean world' : 'Frozen world';
    else {
      habitable = ph.Teq >= 230 && ph.Teq <= 330;
      if (habitable) label += ' · habitable zone';
    }
  } else if (ph.domClass >= 4) {
    label = ph.Teq > 1200 ? 'Hot Jupiter' : ph.Teq > 800 ? 'Warm gas giant' : ph.Teq < 150 ? 'Cold gas giant' : 'Gas giant';
  }
  // no measured radius: say so, and say what the drawing stands in with
  if (!ph.radiusKnown) { label = `Radius not measured, drawn as ${ph.standIn.why}`; habitable = false; }
  // shader uType (0 temperate, 1 giant/hazy, 2 ice, 3 lava)
  let type = 0;
  if (ph.isGiant) type = 1;
  else if (ph.state === 'lava' || ph.state === 'partial') type = 3;
  else if (ph.state === 'ice') type = 2;
  return { type, klass: ph.domClass, state: ph.state, label, habitable, atmDensity: ph.atmDensity, physics: ph };
}

// ---- star colour: Planck spectrum through the CIE 1931 observer to sRGB (science.js) ----
function blackbodySRGB(kelvin) { return starColour(kelvin).srgb.slice(); }
const toLinear = (c) => c.map((x) => Math.pow(x, 2.2));
export function starColor(teff) { return toLinear(blackbodySRGB(teff ?? 5600)); }
// a saturation-boosted version for the star disk itself, so type reads at a glance
function vividStar(teff) {
  const c = toLinear(blackbodySRGB(teff ?? 5600));
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return c.map((x) => clamp(l + (x - l) * 1.5, 0, 1.6));
}

// ---- per-class colour (Sudarsky for giants, ternary for rocky) ----
function classColors(ph, rand) {
  const { domClass, state, Teq, rhoRel } = ph;
  if (domClass === 4) {                                          // gas giant — Sudarsky thermal sequence
    if (Teq < 150) return [[0.90,0.85,0.74],[0.78,0.72,0.58],[0.95,0.92,0.82]];
    if (Teq < 250) return [[0.86,0.88,0.90],[0.72,0.78,0.86],[0.95,0.96,1.0]];
    if (Teq < 800) return [[0.10,0.16,0.34],[0.18,0.28,0.5],[0.55,0.68,0.92]];
    if (Teq < 1200) return [[0.18,0.12,0.12],[0.30,0.18,0.14],[0.55,0.36,0.26]];
    return [[0.20,0.06,0.04],[0.38,0.11,0.05],[0.62,0.24,0.09]]; // silicate ember hot Jupiter (dark)
  }
  if (domClass === 3) {                                          // ice giant — methane cyan, Uranus/Neptune
    const teal = 0.45 + rand() * 0.2;
    return [[0.20,0.45,0.58],[0.30,0.55,0.62],[0.5,0.72,teal+0.2]];
  }
  if (domClass === 2) {                                          // sub-Neptune haze
    const tan = clamp((Teq - 250) / 550, 0, 1);
    const lerp = (a, b) => a.map((x, i) => x + (b[i] - x) * tan);
    const base = lerp([0.45,0.52,0.62], [0.62,0.55,0.45]);
    return [base, base.map((x) => x * 0.85), base.map((x) => Math.min(1, x * 1.2))];
  }
  if (domClass === 1) {                                          // water / ocean
    if (Teq < 273) return [[0.85,0.90,0.95],[0.70,0.80,0.92],[0.95,0.97,1.0]];
    if (Teq > 420) return [[0.72,0.74,0.72],[0.6,0.62,0.62],[0.85,0.86,0.86]];  // steam
    return [[0.04,0.26,0.62],[0.02,0.13,0.42],[0.16,0.46,0.78]];   // ocean (richer blue)
  }
  // rocky — iron/rock ternary
  if (state === 'lava' || state === 'partial') return [[0.07,0.045,0.04],[0.13,0.08,0.06],[1.0,0.55,0.18]];
  if (state === 'ice') return [[0.85,0.90,0.95],[0.7,0.8,0.9],[0.95,0.97,1.0]];
  const fIron = rhoRel !== null ? clamp((rhoRel * 5.513 - 4) / 3, 0, 1) : 0.35;
  const rock = [0.32,0.27,0.22], iron = [0.25,0.13,0.11];
  const base = rock.map((x, i) => x + (iron[i] - x) * fIron);
  return [base, base.map((x) => x * 1.25), base.map((x) => x * 0.7)];
}

// ---- the full shader uniform bundle ----
export function toParams(p) {
  const ph = physics(p);
  const c = classify(p);
  const seedInt = hashName(p.pl_name);
  const rand = rng(seedInt);
  const { domClass, state, Teq, isGiant, atmDensity, Tsurf, gRel } = ph;

  const [colA, colB, colC] = classColors(ph, rand);
  const sky = blackbodySRGB(ph.Teff);
  const lum = 0.2126 * sky[0] + 0.7152 * sky[1] + 0.7152 * sky[2];
  const skyTint = sky.map((x) => clamp((x + (lum - x) * 0.4) * 1.15, 0, 1.3));

  // Rayleigh ratio (lambda^-4) — physics; only tint, never the ratio
  let betaR = [0.175, 0.408, 1.0];
  if (domClass === 3) betaR = [0.10, 0.36, 0.62];               // ice giant: red absorbed
  if (domClass === 4 && Teq >= 250 && Teq < 800) betaR = [0.10, 0.20, 1.0]; // deep-blue cloudless
  if (domClass <= 1 && Teq > 400 && Teq < 1000) betaR = [0.4, 0.42, 0.5];   // CO2 grey-ish

  // haze: sub-Neptune photochemical peak 250-800K; Venus/Titan high
  let haze = 0.0;
  if (domClass === 2) haze = smooth(150, 300, Teq) * (1 - smooth(900, 1100, Teq)) * 0.8 + 0.1;
  else if (domClass <= 1 && Teq > 400 && Teq < 1000) haze = 0.6;
  const mieG = haze > 0.4 ? 0.82 : 0.76;

  // thermal emission
  let emiss = 0, emissColor = [1.0, 0.4, 0.1];
  if (state === 'lava' || state === 'partial') { emiss = smooth(1200, 1700, ph.Ttest); emissColor = [1.0, 0.45, 0.12]; }
  else if (domClass === 4 && Teq > 1800) { emiss = clamp((Teq - 1800) / 1500, 0, 1); emissColor = [1.0, 0.35, 0.1]; }

  // surface albedo (brightness)
  let surfAlbedo = A_CLASS[domClass];
  if (domClass <= 1) {
    if (state === 'lava' || state === 'partial') surfAlbedo = 0.08;
    else if (state === 'ice') surfAlbedo = clamp(0.30 + 0.35 * smooth(273, 150, Teq), 0.3, 0.65);
    else if (domClass === 1 && Teq < 420) surfAlbedo = 0.12;
  } else if (domClass >= 3) {                                    // Sudarsky reflectivity
    surfAlbedo = Teq < 250 ? 0.42 : Teq < 800 ? 0.28 : Teq < 1200 ? 0.08 : 0.05;
  }

  // temperate biome knobs (kept from the prior good model), driven by surface temp
  const Ts = ph.Tsurf;
  const wet = domClass === 1 ? 0.72 : 0.40 + rand() * 0.16;
  const tempBias = clamp((Ts - 240) / 130, 0.05, 1.0);
  const iceCap = clamp(0.40 + (Ts - 240) / 120 * 0.5, 0.40, 0.95);
  const hab = !isGiant && state === 'temperate' && Teq >= 230 && Teq <= 330;

  // deterministic unit spin axis for the star's corona morphology
  const _z = rand() * 2 - 1, _a = rand() * 6.2831, _s = Math.sqrt(Math.max(0, 1 - _z * _z));
  const starSpin = [_s * Math.cos(_a), _z, _s * Math.sin(_a)];

  // ---- procedural explorable surface (radially-displaced unit sphere) ----
  const steam = (domClass === 1 && Teq > 420) ? 1 : 0;
  // relief amplitude (planet radii): composition base, gravity-flattened in shader.
  // Art-directed exaggeration (~4x physical Everest) so the surface reads as a
  // dramatic landscape from the just-above-the-peak-line eye, not a flat haze.
  const amp = (state === 'lava' || state === 'partial') ? 0.010
            : state === 'ice' ? 0.006
            : domClass === 1 ? 0.007 : 0.011;
  // morphology (frame-constant int -> uniform branch, no per-pixel divergence)
  const terrStyle = (state === 'lava' || state === 'partial') ? 3
                  : state === 'ice' ? 2
                  : atmDensity < 0.1 ? 4                          // cratered regolith (airless)
                  : (Teq > 500 && atmDensity < 0.5) ? 1           // hot + dry dunes
                  : 0;                                            // rocky / mountain
  // liquid water can only STAND when temperate, not steaming, with enough air, in range
  const hasSea = state === 'temperate' && steam === 0 && atmDensity > 0.15 && Teq >= 245 && Teq <= 370;
  const seaY = hasSea ? clamp(0.30 + (wet - 0.5) * 0.6, 0.05, 0.85) : -1.0;  // SPECULATIVE waterline
  // altitude snow-line driver: colder worlds carry more high snow
  const tfreeze = clamp((273 - Tsurf) / 60 + 0.2, 0, 1);

  return {
    type: c.type, klass: domClass, isGasGiant: isGiant ? 1 : 0,
    seed: (seedInt % 997) + rand() * 3.0,
    spin: 0.03 + rand() * 0.06,
    // surface
    seaLevel: wet, tempBias, iceCap,
    cloud: isGiant ? 0.0 : clamp(0.5 - Math.abs(Teq - 290) / 500, 0.1, 0.45),
    life: hab ? 0.55 + rand() * 0.3 : 0.0,
    steam,
    bump: isGiant ? 0.0 : 0.14,
    // procedural explorable surface
    amp, terrStyle, seaY, tfreeze, gRel,
    contFreq: 1.6 + rand() * 0.9, mtnFreq: 5.0 + rand() * 4.0,
    bandFreq: 10 + Math.floor(rand() * 16),
    colA, colB, colC,
    surfAlbedo, emiss, emissColor,
    // star + light
    starColor: starColor(ph.Teff), starSurf: vividStar(ph.Teff), skyTint, lightMul: ph.lightMul,
    starAngle: ph.starAngle, starActivity: ph.starActivity, starSpots: ph.starSpots,
    starTeff: ph.Teff, starSpin,
    // atmosphere
    atmR: ph.atmR, hr: ph.Hr, hasAtmo: ph.atmDensity, betaR, betaM: haze * 0.6 + 0.02, mieG, haze,
    scatter: 46.0,
  };
}
