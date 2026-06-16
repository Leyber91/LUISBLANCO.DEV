/* ============================================================
   data.js — the Kepler catalogue + the physics that turns a raw
   record into a renderable world.

   Every physical shader input is DERIVED here (deterministic);
   the only randomness is the per-name noise seed + feature
   placement. Rules follow the adversarially-verified science
   spec: null-degradation, a 5-class radius/density classifier,
   true atmospheric scale height, the cosmic-shoreline retention
   gate, a blackbody star colour, and insolation-driven exposure.

   Source JSON: ~40k rows (repeated measurements). We keep one
   best record per planet, require pl_rade, and degrade
   gracefully when mass / eqt / semi-major axis are missing.
   ============================================================ */

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

const completeness = (r) => ['sy_dist','pl_orbper','pl_orbsmax','pl_rade','pl_masse','pl_eqt','st_teff']
  .reduce((n, k) => n + (num(r[k]) !== null ? 1 : 0), 0);

export async function loadCatalogue() {
  const res = await fetch('exoplanet_data.json');
  const raw = await res.json();
  const best = new Map();
  for (const r of raw) {
    if (!r.pl_name || num(r.pl_rade) === null) continue;   // radius is the one mandatory field
    const cur = best.get(r.pl_name);
    if (!cur || completeness(r) > completeness(cur)) best.set(r.pl_name, r);
  }
  const list = [...best.values()].map(normalise);
  list.sort((a, b) => a.pl_name.localeCompare(b.pl_name, undefined, { numeric: true }));
  return list;
}

function normalise(r) {
  return {
    pl_name: r.pl_name,
    hostname: r.hostname || r.pl_name.replace(/ \w$/, ''),
    sy_dist: num(r.sy_dist),
    pl_orbper: num(r.pl_orbper),
    pl_orbsmax: num(r.pl_orbsmax),
    pl_rade: num(r.pl_rade),
    pl_masse: num(r.pl_masse),
    pl_eqt: num(r.pl_eqt),
    st_teff: num(r.st_teff),
  };
}

// ============================================================
//  PHYSICS — one canonical pass; returns everything downstream needs
// ============================================================
const A_CLASS = [0.30, 0.20, 0.30, 0.40, 0.20];   // provisional Bond albedo per class for Teq fallback

export function physics(p) {
  const R = p.pl_rade;
  const estMass = p.pl_masse === null;
  const M = p.pl_masse !== null ? p.pl_masse : (R < 1.5 ? Math.pow(R, 3.7) : Math.pow(R, 1.7) * Math.pow(1.5, 2.0));
  const Teff = p.st_teff ?? 5600;
  const Mstar = clamp(Math.pow(Teff / 5772, 1.7), 0.1, 1.6);
  const Rstar = clamp(Math.pow(Mstar, 0.8), 0.1, 4.0);            // solar radii (for star angular size)
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
  if (!estMass) {
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
  const atmR = 1.0 + clamp(50 * Hr * atmDensity, 0.022, 0.18);

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
    starActivity, starSpots,
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
  // shader uType (0 temperate, 1 giant/hazy, 2 ice, 3 lava)
  let type = 0;
  if (ph.isGiant) type = 1;
  else if (ph.state === 'lava' || ph.state === 'partial') type = 3;
  else if (ph.state === 'ice') type = 2;
  return { type, klass: ph.domClass, state: ph.state, label, habitable, atmDensity: ph.atmDensity, physics: ph };
}

// ---- catalogue grouping for the navigation panel ----
export function category(p) {
  const c = classify(p);
  if (c.habitable) return { key: 'hz', label: 'Habitable zone', order: 0, accent: 'var(--ok)' };
  if (c.klass <= 1) {
    if (c.state === 'lava' || c.state === 'partial') return { key: 'lava', label: 'Lava worlds', order: 5, accent: 'var(--danger)' };
    if (c.state === 'ice') return { key: 'frozen', label: 'Frozen worlds', order: 6, accent: 'var(--horizon-soft)' };
    if (c.klass === 1) return { key: 'ocean', label: 'Ocean & super-Earths', order: 2, accent: 'var(--horizon)' };
    return { key: 'rocky', label: 'Rocky worlds', order: 1, accent: 'var(--text-bright)' };
  }
  if (c.klass === 2) return { key: 'subn', label: 'Sub-Neptunes', order: 3, accent: 'var(--horizon-soft)' };
  if (c.klass === 3) return { key: 'icegiant', label: 'Ice giants', order: 4, accent: 'var(--horizon)' };
  return { key: 'gas', label: 'Gas giants', order: 7, accent: 'var(--accretion-soft)' };
}

// ---- blackbody star colour (Tanner-Helland), returned sRGB + linear ----
function blackbodySRGB(kelvin) {
  const t = clamp(kelvin, 1000, 40000) / 100;
  let r, g, b;
  r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
}
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
  const { domClass, state, Teq, isGiant } = ph;

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

  return {
    type: c.type, klass: domClass, isGasGiant: isGiant ? 1 : 0,
    seed: (seedInt % 997) + rand() * 3.0,
    spin: 0.03 + rand() * 0.06,
    // surface
    seaLevel: wet, tempBias, iceCap,
    cloud: isGiant ? 0.0 : clamp(0.5 - Math.abs(Teq - 290) / 500, 0.1, 0.45),
    life: hab ? 0.55 + rand() * 0.3 : 0.0,
    steam: (domClass === 1 && Teq > 420) ? 1 : 0,
    bump: isGiant ? 0.0 : 0.14,
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

// ---- grounded astrobiology assessment (echo script + facts for a live model) ----
export function lifeAssessment(p) {
  const ph = physics(p);
  const c = classify(p);
  const T = ph.Tsurf;
  const s = [];
  let possible = false, carbon = false;

  if (ph.isGiant) {
    if (ph.Teq >= 250 && ph.Teq <= 400 && ph.domClass >= 4) {
      possible = true; carbon = true;
      s.push('No surface exists, but a gas giant can carry a temperate cloud layer where the pressure and temperature allow liquid-water droplets.');
      s.push('In that narrow deck, buoyant carbon-based microbial life is conceivable — the Sagan-Salpeter "floaters" — though it would have to stay aloft forever or fall into the crushing, scorching interior.');
    } else {
      s.push('As a giant it has no surface, and its cloud layers are either far too hot and high-pressure or far too cold for stable liquid-water chemistry.');
      s.push('Life as we can model it is implausible here.');
    }
  } else if (ph.atmDensity < 0.1) {
    s.push(`With almost no atmosphere (escape velocity ${ph.vEscKms.toFixed(1)} km/s against its insolation, below the cosmic shoreline), surface water cannot persist and radiation reaches the ground unfiltered.`);
    s.push('Subsurface refugia aside, the surface is effectively sterile.');
  } else if (T > 373) {
    s.push(`A surface near ${Math.round(T)} K is hot enough to boil water and denature the large molecules any biochemistry depends on.`);
    s.push('Life as chemistry is implausible at these temperatures.');
  } else if (T < 245) {
    s.push(`At roughly ${Math.round(T)} K water is locked as ice, and reaction rates crawl.`);
    s.push('Liquid-water carbon life is unlikely; only exotic low-temperature solvent chemistry (liquid hydrocarbons, as on Titan) could be entertained, and that is speculative.');
  } else {
    possible = true; carbon = true;
    s.push(`Surface temperature near ${Math.round(T)} K with a real atmosphere sits inside the liquid-water window — the single strongest precondition for life we know.`);
    if (ph.starActivity > 0.8) {
      s.push('The catch: its red-dwarf sun is magnetically violent, and frequent flares would irradiate the day side — life would need an ozone-like shield, deep water, or the night side to survive.');
    } else {
      s.push('Its star is relatively calm, so radiation is not a showstopper.');
    }
    s.push('If life arose, it would almost certainly be carbon-based: carbon\'s four-bond versatility and water as a solvent are the cosmically abundant path of least resistance — we have no second example, but every ingredient points the same way.');
  }

  const facts = [
    `planet=${p.pl_name}`, `class=${c.label}`,
    `surface temp~${Math.round(T)}K`, `equilibrium temp=${Math.round(ph.Teq)}K`,
    `atmosphere=${ph.atmDensity > 0.6 ? 'substantial' : ph.atmDensity > 0.2 ? 'thin' : 'negligible'}`,
    ph.gRel ? `gravity=${ph.gRel.toFixed(2)}g` : null,
    `host star=${Math.round(ph.Teff)}K, magnetic activity=${ph.starActivity > 0.8 ? 'very high (flaring red dwarf)' : ph.starActivity > 0.4 ? 'moderate' : 'low/calm'}`,
    c.habitable ? 'inside the habitable zone' : 'outside the classical habitable zone',
  ].filter(Boolean).join('; ');

  return { possible, carbon, sentences: s, facts };
}

// ---- derived display values for telemetry ----
export function derived(p) {
  const ph = physics(p);
  const out = { class: ['Rocky','Water','Sub-Neptune','Ice giant','Gas giant'][ph.domClass], estMass: ph.estMass };
  if (p.sy_dist) out.lightyears = p.sy_dist * 3.26156;
  out.gravity = ph.gRel;
  out.escape = ph.vEscKms;
  out.insol = Math.pow(ph.Teq / 278.5, 4);
  out.teqUsed = ph.Teq;
  out.starAngleDeg = ph.starAngle * 2 * 180 / Math.PI;   // full angular diameter
  out.scaleHeightKm = (kB * ph.Teq / ((ph.isGiant ? 2.3 : 29) * mH * 9.80665 * ph.gRel)) / 1000;
  return out;
}
