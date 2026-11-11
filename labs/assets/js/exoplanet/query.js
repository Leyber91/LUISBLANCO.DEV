/* ============================================================
   exoplanet/query.js — a question about the catalogue becomes a
   structured filter the engine runs over every world.

   The deterministic parser reads the common phrasings at once and
   works with no model. "Ask" sends ONE model call (llm.js picks
   the route) that returns the same JSON shape; the reply is
   validated field by field against the schema before it is used.
   The filter is shown as editable ranges, never hidden.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { AI, METHOD_GROUPS } from './config.js';

/* the fields a query may constrain, with the units the page shows */
export const RANGE_FIELDS = [
  { key: 'R', label: 'Radius', unit: 'R⊕' },
  { key: 'Teq', label: 'Teq (published)', unit: 'K' },
  { key: 'S', label: 'Insolation', unit: 'S⊕' },
  { key: 'dist', label: 'Distance', unit: 'ly' },
  { key: 'Teff', label: 'Star Teff', unit: 'K' },
  { key: 'P', label: 'Period', unit: 'd' },
  { key: 'year', label: 'Discovered', unit: '' },
];
const SORTS = ['earthlike', 'Teq', 'dist', 'R', 'P', 'year', 'S'];

const n = (s) => parseFloat(String(s).replace(/,/g, ''));

/* phrase -> filter, for the questions people actually type */
export function parseQuestion(text) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[-_]/g, ' ') + ' ';
  const ranges = {}, notes = [];
  let zone = null, method = null, sort = null;
  const set = (k, lo, hi, why) => { ranges[k] = [lo, hi]; notes.push(why); };
  if (/\bearth (size|sized|like size)\b|\bearth sized\b/.test(t)) set('R', 0.8, 1.25, 'Earth-size: 0.8-1.25 R⊕');
  else if (/\bsuper earths?\b/.test(t)) set('R', 1.25, 2, 'super-Earth: 1.25-2 R⊕');
  else if (/\b(sub|mini) neptunes?\b/.test(t)) set('R', 2, 4, 'sub-Neptune: 2-4 R⊕');
  else if (/\bneptunes?\b|\bice giants?\b/.test(t)) set('R', 4, 8, 'Neptune-size: 4-8 R⊕');
  else if (/\bjupiters?\b|\bgas giants?\b|\bgiants?\b/.test(t)) set('R', 8, null, 'giant: above 8 R⊕');
  else if (/\b(small|rocky|terrestrial)\b/.test(t)) set('R', null, 1.6, 'rocky: below 1.6 R⊕');
  if (/\b(temperate|habitable|goldilocks|liquid water)\b/.test(t)) { zone = ['cons', 'opt']; notes.push('inside the habitable zone'); }
  if (/\blava\b|\bmolten\b/.test(t)) set('Teq', 1500, null, 'molten: Teq above 1500 K');
  else if (/\bhot jupiters?\b/.test(t)) { set('R', 8, null, 'giant'); set('P', null, 10, 'P under 10 d'); }
  else if (/\bhot(test)?\b/.test(t)) set('Teq', 1000, null, 'hot: Teq above 1000 K');
  else if (/\b(cold|frozen|icy)\b/.test(t)) set('Teq', null, 200, 'cold: Teq below 200 K');
  let m;
  if ((m = t.match(/within (\d[\d,.]*) ?(light ?years?|ly|parsecs?|pc)\b/))) {
    const v = n(m[1]) * (/p/.test(m[2]) ? 3.26156 : 1); set('dist', null, v, `within ${Math.round(v)} ly`);
  } else if (/\b(nearby|near|close|closest|nearest)\b/.test(t)) set('dist', null, 50, 'within 50 ly');
  if (/\b(red|m) dwarfs?\b|\bm type\b/.test(t)) set('Teff', null, 3900, 'M dwarf host: Teff below 3900 K');
  else if (/\bk (dwarfs?|type)\b|\borange dwarfs?\b/.test(t)) set('Teff', 3900, 5300, 'K host: 3900-5300 K');
  else if (/\b(sun like|sunlike|solar type|g type)\b/.test(t)) set('Teff', 5300, 6000, 'Sun-like host: 5300-6000 K');
  else if (/\b(a|f) type\b|\bhot stars?\b/.test(t)) set('Teff', 6000, null, 'hot host: above 6000 K');
  if (/\bultra short\b/.test(t)) set('P', null, 1, 'P under 1 d');
  else if (/\bshort period\b/.test(t)) set('P', null, 10, 'P under 10 d');
  else if (/\blong period\b/.test(t)) set('P', 365, null, 'P over a year');
  if ((m = t.match(/\b(since|after) (19|20)(\d\d)\b/))) set('year', n(m[2] + m[3]), null, `found from ${m[2]}${m[3]}`);
  else if ((m = t.match(/\bbefore (19|20)(\d\d)\b/))) set('year', null, n(m[1] + m[2]) - 1, `found before ${m[1]}${m[2]}`);
  else if ((m = t.match(/\bin (19|20)(\d\d)\b/))) set('year', n(m[1] + m[2]), n(m[1] + m[2]), `found in ${m[1]}${m[2]}`);
  for (const g of METHOD_GROUPS) if (g.key !== 'other' && t.includes(' ' + g.label.toLowerCase())) { method = g.key; notes.push(`by ${g.label.toLowerCase()}`); }
  if (/\b(radial velocity|rv)\b/.test(t)) { method = 'Radial Velocity'; }
  if (/\bmost earth like\b|\bearth like\b|\bearth twins?\b/.test(t)) sort = { key: 'earthlike', dir: -1 };
  else if (/\bhottest\b/.test(t)) sort = { key: 'Teq', dir: -1 };
  else if (/\bcoldest\b/.test(t)) sort = { key: 'Teq', dir: 1 };
  else if (/\b(nearest|closest)\b/.test(t)) sort = { key: 'dist', dir: 1 };
  else if (/\b(largest|biggest)\b/.test(t)) sort = { key: 'R', dir: -1 };
  else if (/\bsmallest\b/.test(t)) sort = { key: 'R', dir: 1 };
  else if (/\b(newest|latest|recent)\b/.test(t)) sort = { key: 'year', dir: -1 };
  return { ranges, zone, method, sort, notes, recognised: notes.length + (sort ? 1 : 0) };
}

/* a model reply -> the same shape, or null; every field checked */
export function validateQuery(j) {
  if (!j || typeof j !== 'object') return null;
  const out = { ranges: {}, zone: null, method: null, sort: null, notes: [] };
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(+v) ? +v : NaN);
  for (const f of RANGE_FIELDS) {
    const r = j.ranges && j.ranges[f.key];
    if (!r) continue;
    const lo = num(Array.isArray(r) ? r[0] : r.min), hi = num(Array.isArray(r) ? r[1] : r.max);
    if (Number.isNaN(lo) || Number.isNaN(hi) || (lo === null && hi === null)) continue;
    if (lo !== null && hi !== null && lo > hi) continue;
    out.ranges[f.key] = [lo, hi];
    out.notes.push(`${f.label} ${lo ?? ''}-${hi ?? ''} ${f.unit}`.trim());
  }
  if (j.habitable_zone === true) { out.zone = ['cons', 'opt']; out.notes.push('inside the habitable zone'); }
  if (typeof j.method === 'string' && METHOD_GROUPS.some((g) => g.key === j.method)) { out.method = j.method; out.notes.push(`by ${j.method.toLowerCase()}`); }
  if (j.sort && SORTS.includes(j.sort.key)) out.sort = { key: j.sort.key, dir: j.sort.dir === 'asc' || j.sort.dir === 1 ? 1 : -1 };
  out.recognised = out.notes.length + (out.sort ? 1 : 0);
  return out.recognised ? out : null;
}

const SYSTEM = 'You turn a question about the NASA exoplanet catalogue into a filter. Reply as JSON: ' +
  '{"ranges": {"R": [min, max], "Teq": [min, max], "S": [min, max], "dist": [min, max], "Teff": [min, max], "P": [min, max], "year": [min, max]}, ' +
  '"habitable_zone": true or false, "method": one of "Transit", "Radial Velocity", "Microlensing", "Imaging" or null, ' +
  '"sort": {"key": one of "earthlike", "Teq", "dist", "R", "P", "year", "S", "dir": "asc" or "desc"} or null}. ' +
  'Units: R in Earth radii, Teq in kelvin (published equilibrium temperature), S insolation relative to Earth, dist in light-years, Teff of the host star in kelvin, P orbital period in days. ' +
  'Use null for an open end. Include only the fields the question needs.';

export async function askModel(question, signal) {
  const res = await LLM.complete({
    system: SYSTEM, prompt: 'QUESTION: ' + String(question).slice(0, 300), json: true, temperature: 0,
    maxWaitMs: AI.maxWaitMs, timeoutMs: AI.timeoutMs, signal, fallback: () => null,
  });
  const q = res.source === 'offline' ? null : validateQuery(res.json);
  return { q, res };
}
