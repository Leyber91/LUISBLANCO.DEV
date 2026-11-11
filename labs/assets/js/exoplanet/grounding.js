/* ============================================================
   exoplanet/grounding.js — checks every figure in a model's text
   against the fact sheet, with its unit.

   A figure is a number together with the unit written after it:
   "900 K", "900K", "3.7 g", "40 km", "7x", "-40 °C", "3.5-day".
   The checker converts the figure into the unit of every fact of
   the same dimension and asks whether it matches within 2% or
   within the rounding the text used. A figure fails when
     - it is glued to letters that are not a unit it can read
       ("40xyz", "1990s"),
     - its dimension has no fact at all (a gravity "3.7g", a speed,
       a length in km when no fact is a length that small),
     - or no fact of its dimension matches it.
   A bare number (no unit) may match any fact's value as written.
   Digits inside names (Kepler-62, TRAPPIST-1, K2-18, CO2) are not
   figures. Pure functions, no DOM; tests/science.test.mjs runs it.
   ============================================================ */

/* Units: value in the dimension's base unit = v * k + off. */
const U = {
  K: { dim: 'temp', k: 1 }, C: { dim: 'temp', k: 1, off: 273.15 }, F: { dim: 'temp', k: 5 / 9, off: 273.15 - 32 * 5 / 9 },
  km: { dim: 'length', k: 1 }, m: { dim: 'length', k: 1e-3 }, AU: { dim: 'length', k: 149597870.7 },
  Rearth: { dim: 'length', k: 6371.0, rel: true }, Rjup: { dim: 'length', k: 69911 }, Rsun: { dim: 'length', k: 695700, rel: true },
  ly: { dim: 'length', k: 9.4607304725808e12 }, pc: { dim: 'length', k: 3.0856775814914e13 }, kpc: { dim: 'length', k: 3.0856775814914e16 },
  Mearth: { dim: 'mass', k: 1, rel: true }, Mjup: { dim: 'mass', k: 317.83 }, Msun: { dim: 'mass', k: 332946, rel: true }, kg: { dim: 'mass', k: 1 / 5.9722e24 },
  s: { dim: 'time', k: 1 / 3600 }, min: { dim: 'time', k: 1 / 60 }, h: { dim: 'time', k: 1 }, d: { dim: 'time', k: 24 },
  wk: { dim: 'time', k: 168 }, yr: { dim: 'time', k: 8766 }, Myr: { dim: 'time', k: 8.766e9 }, Gyr: { dim: 'time', k: 8.766e12 },
  Searth: { dim: 'flux', k: 1, rel: true }, Wm2: { dim: 'flux', k: 1 / 1361 },
  deg: { dim: 'angle', k: 1 }, arcmin: { dim: 'angle', k: 1 / 60 }, arcsec: { dim: 'angle', k: 1 / 3600 },
  x: { dim: 'ratio', k: 1 }, pct: { dim: 'ratio', k: 0.01 }, ppt: { dim: 'ratio', k: 1e-3 }, ppm: { dim: 'ratio', k: 1e-6 },
  g: { dim: 'accel', k: 1 }, ms2: { dim: 'accel', k: 1 / 9.80665 },
  gcc: { dim: 'density', k: 1 }, kgm3: { dim: 'density', k: 1e-3 },
  kms: { dim: 'speed', k: 1 }, ms: { dim: 'speed', k: 1e-3 },
  Lsun: { dim: 'lum', k: 1, rel: true },
  ord: { dim: 'ordinal', k: 1 },
};

/* How each unit is written: [pattern, flags, unit]. The longest match wins. */
const WRITTEN = [
  ['°\\s?C|º\\s?C', '', 'C'], ['°\\s?F|º\\s?F', '', 'F'], ['K|C|F', '', null],
  ['kelvins?', 'i', 'K'], ['degrees? (?:celsius|centigrade)|celsius|centigrade', 'i', 'C'], ['degrees? fahrenheit|fahrenheit', 'i', 'F'],
  ['light[- ]?years?', 'i', 'ly'], ['ly', '', 'ly'], ['pc|parsecs?', 'i', 'pc'], ['kpc|kiloparsecs?', 'i', 'kpc'],
  ['AU|au|astronomical units?', '', 'AU'], ['astronomical units?', 'i', 'AU'],
  ['km|kilomet(?:er|re)s?', 'i', 'km'], ['m|met(?:er|re)s?', '', 'm'], ['met(?:er|re)s?', 'i', 'm'],
  ['R\\s?⊕|R_?(?:E|e|earth|Earth|⊕)', '', 'Rearth'], ["earth[- ]?radi(?:i|us|uses)|earth'?s radi(?:i|us)", 'i', 'Rearth'],
  ['R_?J(?:up)?', '', 'Rjup'], ['jupiter[- ]?radi(?:i|us)', 'i', 'Rjup'],
  ['R\\s?☉|R_?(?:sun|Sun)', '', 'Rsun'], ['solar radi(?:i|us)', 'i', 'Rsun'],
  ['M\\s?⊕|M_?(?:E|earth|Earth|⊕)', '', 'Mearth'], ["earth[- ]?mass(?:es)?|earth'?s mass(?:es)?", 'i', 'Mearth'],
  ['M_?J(?:up)?', '', 'Mjup'], ['jupiter[- ]?mass(?:es)?', 'i', 'Mjup'],
  ['M\\s?☉|M_?(?:sun|Sun)', '', 'Msun'], ['solar mass(?:es)?', 'i', 'Msun'], ['kg|kilograms?', 'i', 'kg'],
  ['S\\s?⊕|S_?(?:E|earth|Earth|⊕)', '', 'Searth'], ['W/m²|W/m2|W m-2|W m⁻²', '', 'Wm2'],
  ['seconds?|secs?', 'i', 's'], ['minutes?|mins?', 'i', 'min'], ['h|hours?|hrs?', 'i', 'h'], ['d|days?', 'i', 'd'],
  ['weeks?|wk', 'i', 'wk'], ['years?|yrs?|yr', 'i', 'yr'], ['Myr|million years', '', 'Myr'], ['Gyr|billion years', '', 'Gyr'],
  ['°|º|degrees?|deg', 'i', 'deg'], ['arcmin(?:utes?)?|′', 'i', 'arcmin'], ['arcsec(?:onds?)?|″', 'i', 'arcsec'],
  ['×|x', '', 'x'], ['times|fold', 'i', 'x'], ['%|percent|per cent', 'i', 'pct'], ['ppt', '', 'ppt'], ['ppm|parts per million', 'i', 'ppm'],
  ['g|gees?', '', 'g'], ['earth gravit(?:y|ies)', 'i', 'g'], ['m/s²|m/s2|m s-2|m s⁻²', '', 'ms2'],
  ['g/cm³|g/cm3|g cm-3|g cm⁻³|g/cc', '', 'gcc'], ['kg/m³|kg/m3', '', 'kgm3'],
  ['km/s', 'i', 'kms'], ['m/s', '', 'ms'],
  ['L\\s?☉|L_?(?:sun|Sun)', '', 'Lsun'], ['solar luminosit(?:y|ies)', 'i', 'Lsun'],
  ['st|nd|rd|th', '', 'ord'],
].map(([src, fl, unit]) => ({ re: new RegExp('^(?:' + src + ')(?![A-Za-z0-9_])', fl), unit }));
// 'K|C|F' above: single capitals, case-sensitive
WRITTEN[2].pick = (m) => ({ K: 'K', C: 'C', F: 'F' }[m]);

const MULT = { thousand: 3, million: 6, billion: 9 };
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const NUM = /[+\-−]?(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d+)?(?:[eE][+\-−]?\d+)?|[+\-−]?\.\d+/g;
const WORDCH = /[A-Za-z0-9_]/;
const GLUED = /^[A-Za-zÀ-ɏ⊕☉°º′″]/;

/* the unit written at the start of `rest`, or null: { unit, len } */
function unitAt(rest) {
  let best = null;
  for (const seps of ['', ' ', ' ', '-']) {
    if (seps && !rest.startsWith(seps)) continue;
    const r = rest.slice(seps.length);
    for (const w of WRITTEN) {
      const m = r.match(w.re);
      if (!m) continue;
      const unit = w.pick ? w.pick(m[0]) : w.unit;
      if (!unit) continue;
      // a hyphen joins only a word unit ("3.5-day"), never a symbol
      if (seps === '-' && !/^[A-Za-z]{2,}/.test(m[0])) continue;
      const len = seps.length + m[0].length;
      if (!best || len > best.len) best = { unit, len };
    }
  }
  return best;
}

/* Every figure in `text`: { v, unit, dp, raw, at, len, bad }. `blank` lists names whose
   digits are not figures. */
export function figures(text, blank = []) {
  let scan = String(text || '');
  for (const n of blank.filter(Boolean)) scan = scan.split(n).join(' '.repeat(n.length));
  const out = [];
  let prevEnd = -1, prevIdent = false;
  NUM.lastIndex = 0;
  let m;
  while ((m = NUM.exec(scan))) {
    let at = m.index, s = m[0];
    const before = at > 0 ? scan[at - 1] : '';
    const signed = /^[+\-−]/.test(s);
    let range = false;
    if (WORDCH.test(before) || (before === '.' && at > 1 && /\d/.test(scan[at - 2]))) {
      // digits inside a word or name (CO2, TOI-700, K2-18): not a figure
      if (!(signed && /\d/.test(before) && prevEnd === at && !prevIdent)) { prevEnd = at + s.length; prevIdent = true; continue; }
      range = true;                                   // "900-1000 K": the dash is a range, not a sign
      s = s.slice(1); at += 1;
    }
    let end = at + s.length;
    const sign = !range && /^[\-−]/.test(s) ? -1 : 1;
    const body = s.replace(/^[+\-−]/, '');
    const [mant, ex] = body.split(/[eE]/);
    let v = sign * parseFloat(mant.replace(/,/g, '')) * (ex ? Math.pow(10, parseFloat(ex.replace('−', '-'))) : 1);
    let dp = (mant.split('.')[1] || '').length - (ex ? parseFloat(ex.replace('−', '-')) : 0);
    let rest = scan.slice(end);
    // "1.2 x 10^5", "1.2×10⁵"
    const pow = rest.match(/^\s?[x×]\s?10(?:\^([+\-−]?\d+)|([⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+))/);
    if (pow) {
      const n = parseFloat((pow[1] || pow[2].split('').map((c) => SUP[c]).join('')).replace('−', '-'));
      v *= Math.pow(10, n); dp -= n; end += pow[0].length; rest = scan.slice(end);
    }
    const mult = rest.match(/^\s(thousand|million|billion)(?![A-Za-z])/i);
    if (mult && !/^\s(million|billion) years/i.test(rest)) { v *= Math.pow(10, MULT[mult[1].toLowerCase()]); dp -= MULT[mult[1].toLowerCase()]; end += mult[0].length; rest = scan.slice(end); }
    const u = unitAt(rest);
    let unit = null, bad = false;
    if (u) { unit = u.unit; end += u.len; } else if (GLUED.test(rest)) bad = true;
    const fig = { v, unit, dp, raw: String(text).slice(at, end), at, len: end - at, bad };
    // "900-1000 K", "900 to 1000 K", "between 0.2 and 0.5 AU": the unit belongs to both ends
    const last = out[out.length - 1];
    if (unit && last && !last.unit && !last.bad && /^\s*(?:-|–|—|to|and)\s*$/.test(scan.slice(last.at + last.len, at))) last.unit = unit;
    out.push(fig);
    prevEnd = end; prevIdent = false;
    NUM.lastIndex = end;
  }
  return out;
}

/* The unit of each fact-sheet key. Keys not listed carry their unit as a suffix. */
const FACT_UNIT = {
  eccentricity: 'x', albedo_assumed: 'x', star_size_vs_sun_from_earth: 'x', mass_forecast_68: 'Mearth', discovered: null,
};
const SUFFIX = [[/_K$/, 'K'], [/_Rearth$/, 'Rearth'], [/_Mearth$/, 'Mearth'], [/_days$/, 'd'], [/_AU$/, 'AU'], [/_ly$/, 'ly'],
  [/_Searth$/, 'Searth'], [/_deg$/, 'deg'], [/_ppm$/, 'ppm'], [/_h$/, 'h'], [/_Rsun$/, 'Rsun']];
export function factUnit(key) {
  if (key in FACT_UNIT) return FACT_UNIT[key];
  for (const [re, u] of SUFFIX) if (re.test(key)) return u;
  return null;
}
const NAME_KEYS = new Set(['name', 'host', 'facility', 'method', 'star_type']);

/* Counts, the 68% band and the years the method cites, which any note may use. */
const CONSTANTS = [1, 2, 3, 68, 100, 1931, 2017].map((v) => ({ v, unit: null })).concat([{ v: 68, unit: 'pct' }]);

/* the values a figure may trace to: { v, unit } */
export function factPool(f) {
  const pool = [];
  for (const [key, val] of Object.entries(f)) {
    const unit = factUnit(key);
    const add = (v) => { if (typeof v === 'number' && isFinite(v)) pool.push({ v, unit, key }); };
    if (Array.isArray(val)) val.forEach(add);
    else if (typeof val === 'number') add(val);
    else if (typeof val === 'string' && !NAME_KEYS.has(key)) {
      // numbers written inside a fact's text ("12x the flux at the zone's inner edge")
      for (const g of figures(val)) if (!g.bad) pool.push({ v: g.v, unit: g.unit === 'ord' ? null : g.unit, key });
    }
  }
  return pool.concat(CONSTANTS.map((c) => ({ ...c, key: 'constant' })));
}

const close = (a, b, tol) => Math.abs(a - b) <= tol + 1e-12 * Math.max(1, Math.abs(b));
const DIM_NAME = { temp: 'temperature', length: 'length', mass: 'mass', time: 'duration', flux: 'insolation', angle: 'angle',
  ratio: 'ratio', accel: 'gravity', density: 'density', speed: 'speed', lum: 'luminosity' };

/* Does one figure trace to the pool? Returns the reason when it does not. */
export function traceFigure(g, pool) {
  if (g.bad) return { ok: false, why: 'number glued to a unit this check cannot read' };
  const half = 0.5 * Math.pow(10, -Math.max(-12, Math.min(12, g.dp)));
  const unit = g.unit === 'ord' ? null : g.unit;
  if (!unit) {
    const ok = pool.some((e) => close(g.v, e.v, Math.max(0.02 * Math.abs(e.v), half)));
    return ok ? { ok } : { ok, why: 'not in the fact sheet' };
  }
  const tu = U[unit];
  const same = pool.filter((e) => e.unit && U[e.unit].dim === tu.dim);
  for (const e of same) {
    const eu = U[e.unit];
    const base = e.v * eu.k + (eu.off || 0);
    const inT = (base - (tu.off || 0)) / tu.k;
    if (close(g.v, inT, Math.max(0.02 * Math.abs(base) / tu.k, half))) return { ok: true };
  }
  // "1.6 times" or "1.6x" may be a fact in Earth or solar units
  if (unit === 'x') {
    if (pool.some((e) => e.unit && U[e.unit].rel && close(g.v, e.v, Math.max(0.02 * Math.abs(e.v), half)))) return { ok: true };
  }
  const dn = DIM_NAME[tu.dim] || tu.dim;
  return { ok: false, why: same.length ? `no ${dn} in the fact sheet matches` : `the fact sheet has no ${dn}` };
}

/* Every figure in the text must trace to the fact sheet, unit included. */
export function groundingCheck(text, f) {
  const pool = factPool(f);
  const nums = figures(text, [f.name, f.host, f.facility]).map((g) => ({ ...g, ...traceFigure(g, pool) }));
  return { nums, traced: nums.filter((n) => n.ok).length, total: nums.length };
}
