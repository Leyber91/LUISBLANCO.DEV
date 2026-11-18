/* ============================================================
   blackhole/record.js — what the Black Hole lab keeps about a
   visitor, in the lab's one record in Labs OS (lab "black-hole"),
   so Labs OS's export and erase (on the labs' hub) reach all of it.

   Three lists, each the visitor's own act:
   - kept: holes the visitor chose to keep (the Keep button), each
     its link (the state's query, as Store.toQuery writes it);
   - rays: rays the visitor traced by pressing a pixel, each its
     link, the ray's place on the image plane (the probe's sx and
     sy, tangent units of the camera, the same at any window size:
     the ?ps= of a ray's link) and what the ray did (horizon, disk
     n, photon ring, sky);
   - falls: falls the visitor ran to their stop, each its link and
     the proper time the fall took from 40 M.

   The rules, from Exomania's record (exoplanet/record.js), whose
   five were each learned from a review on 2026-11-15:

   1. The store is the truth. A page never writes back its own
      copy. A write is one change applied by `update` to what the
      store holds at that moment, so a keep in another tab, or an
      erase on the labs' hub, is not undone by a page that read
      the record earlier. `changed` says whether the store was
      written; an event is tracked only for a change.
   2. One door. What comes out of the store passes the same checks
      as what comes in: `normalise` for shape and bounds, and a
      link is kept only if `isLink` accepts it.
   3. A write is checked on arrival: a bad link, time, place or
      fate is refused with its reason, and the record comes back
      as it was.
   4. A page writes only a record whose version it knows; a later
      version's record is read for display and never written.
   5. Counts and sentences are computed here, on the record shown.

   Nothing typed is kept: a link holds the state's numbers only.
   Every function but `read`, `load` and `update` is pure.
   ============================================================ */

import { Store } from './state.js';
import { OBJECTS, VIEWS, SCHEMA } from './config.js';
import { sci, deg } from './physics.js';

export const V = 1;
export const LIMITS = Object.freeze({ kept: 50, rays: 100, falls: 50, link: 400, dropped: 1000000, thumbs: 12, thumb: 12000 });
/** A kept frame's picture: a small JPEG as a data address, at most LIMITS.thumb characters. Only the LIMITS.thumbs
 *  newest kept holes carry one, so the record stays under Labs OS's cap of 256 KB (progress.js MAX_PROGRESS_BYTES):
 *  12 x 12,000 characters, beside at most about 40 KB of links. */
export const isThumb = (v) => typeof v === 'string' && v.length <= LIMITS.thumb && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(v);
/* What a traced ray did, as the probe names it, and the words for each. */
export const FATE_WORDS = Object.freeze({ captured: 'ends in the hole', disk: 'lands on the disk', ring: 'skims the photon orbits', sky: 'escapes to the sky' });
export const FATES = Object.freeze(Object.keys(FATE_WORDS));

const isTime = (v) => Number.isFinite(v) && v > 0;   // Number.isFinite refuses anything not a number
/** A coordinate of the image plane, in tangent units (probe.js screenToTangent): inside +-100, wider than any
 *  field of view this page draws (140 degrees on a phone held upright is about 6). */
export const PLANE = 100;
const isPlane = (v) => typeof v === 'number' && Math.abs(v) <= PLANE;   // NaN fails the bound
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
/** A link is the query Store.toQuery writes: key=value pairs of letters, digits and the few signs a number or a
 *  name needs, at most LIMITS.link long. Anything else (a script, a typed word with spaces) is refused. */
export const isLink = (v) => typeof v === 'string' && v.length <= LIMITS.link && /^([a-z]{1,4}=[A-Za-z0-9._%+-]{1,24})?(&[a-z]{1,4}=[A-Za-z0-9._%+-]{1,24})*$/.test(v);

export const empty = () => ({ kept: [], rays: [], falls: [], dropped: 0 });

/** The record in its shape and bounds, whatever came in. */
export function normalise(data) {
  const d = obj(data);
  const kept = list(d.kept).map(obj).filter((e) => isLink(e.q) && isTime(e.t)).map((e) => (isThumb(e.img) ? { q: e.q, t: e.t, img: e.img } : { q: e.q, t: e.t }));
  const rays = list(d.rays).map(obj).filter((e) => isLink(e.q) && isTime(e.t) && Array.isArray(e.s) && e.s.length === 2 && e.s.every(isPlane) && FATES.includes(e.fate) && Number.isInteger(e.n) && e.n >= 0 && e.n <= 9)
    .map((e) => ({ q: e.q, t: e.t, s: [e.s[0], e.s[1]], fate: e.fate, n: e.n }));
  const falls = list(d.falls).map(obj).filter((e) => isLink(e.q) && isTime(e.t) && isTime(e.tau)).map((e) => ({ q: e.q, t: e.t, tau: e.tau }));
  const unique = (xs, key) => { const seen = new Set(); return xs.filter((e) => { const k = key(e); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const dropped = Number.isInteger(d.dropped) && d.dropped >= 0 ? Math.min(d.dropped, LIMITS.dropped) : 0;
  return {
    kept: thumbsBounded(unique(kept, (e) => holeKey(e.q)).slice(0, LIMITS.kept)),
    rays: rays.slice(0, LIMITS.rays),
    falls: falls.slice(0, LIMITS.falls),
    dropped,
  };
}

const refuse = (record, why) => ({ ok: false, why, record });
export const BAD_LINK = 'that state cannot be written as a link';
export const BAD_TIME = 'the time is not a positive number';
export const FULL = `${LIMITS.kept} holes are kept, which is all it takes; take one out first`;

/** Keep a hole (most recent first). Keeping one already kept moves it to the top with the new time. */
/** Only the LIMITS.thumbs newest entries keep their picture. */
function thumbsBounded(kept) { return kept.map((e, i) => (i < LIMITS.thumbs || !('img' in e) ? e : { q: e.q, t: e.t })); }

export function keep(record, { q, t, img = null }) {
  if (img !== null && !isThumb(img)) return refuse(record, 'the frame\'s picture is not a small JPEG');
  if (!isLink(q)) return refuse(record, BAD_LINK);
  if (!isTime(t)) return refuse(record, BAD_TIME);
  const rest = record.kept.filter((e) => holeKey(e.q) !== holeKey(q));
  if (rest.length === record.kept.length && record.kept.length >= LIMITS.kept) return refuse(record, FULL);
  return { ok: true, why: '', record: { ...record, kept: thumbsBounded([img ? { q, t, img } : { q, t }, ...rest]) } };
}
export function unkeep(record, q) {
  const kept = record.kept.filter((e) => holeKey(e.q) !== holeKey(q));
  return kept.length === record.kept.length ? refuse(record, 'that hole is not kept') : { ok: true, why: '', record: { ...record, kept } };
}
/** A traced ray (most recent first); past the bound the oldest goes, counted in `dropped`. */
export function ray(record, { q, t, s, fate, n = 0 }) {
  if (!isLink(q)) return refuse(record, BAD_LINK);
  if (!isTime(t)) return refuse(record, BAD_TIME);
  if (!(Array.isArray(s) && s.length === 2 && s.every(isPlane))) return refuse(record, 'the ray\'s place is not on the image plane');
  if (!FATES.includes(fate)) return refuse(record, 'the ray did something this page does not name');
  if (!(Number.isInteger(n) && n >= 0 && n <= 9)) return refuse(record, 'the image order is not 0 to 9');
  const rays = [{ q, t, s: [s[0], s[1]], fate, n }, ...record.rays];
  const over = Math.max(0, rays.length - LIMITS.rays);
  return { ok: true, why: '', record: { ...record, rays: rays.slice(0, LIMITS.rays), dropped: Math.min(LIMITS.dropped, record.dropped + over) } };
}
/** A fall run to its stop, with the proper time it took (s). */
export function fall(record, { q, t, tau }) {
  if (!isLink(q)) return refuse(record, BAD_LINK);
  if (!isTime(t)) return refuse(record, BAD_TIME);
  if (!isTime(tau)) return refuse(record, 'the proper time is not a positive number');
  const falls = [{ q, t, tau }, ...record.falls];
  const over = Math.max(0, falls.length - LIMITS.falls);
  return { ok: true, why: '', record: { ...record, falls: falls.slice(0, LIMITS.falls), dropped: Math.min(LIMITS.dropped, record.dropped + over) } };
}
export const isKept = (record, q) => record.kept.some((e) => holeKey(e.q) === holeKey(q));

/** How a key's value is printed in a hole's name; the identity compares these, so two links share a name if and
 *  only if they share an identity (review_s3b B). */
function printed(d, v) {
  if (d.key === 'incl') return `${deg(v)}°`;
  if (d.key === 'mass') return `${sci(10 ** v)} M☉`;
  if (d.key === 'dist') return `${sci(10 ** v)} pc`;
  if (d.key === 'view') return VIEWS[v].label.toLowerCase();
  if (d.type === 'num') return `${(+v).toFixed(d.digits)}${d.unit === 'deg' ? '°' : d.unit ? ` ${d.unit}` : ''}`;
  return String(v);
}
const ID_KEYS = SCHEMA.filter((d) => d.id !== false);
/** A key's name in a hole's name where SCHEMA's label does not fit: its enums have none, and the mass and distance
 *  are printed as values, not as the log10 SCHEMA's label names. */
const NAME_LABEL = { observer: 'observer', emit: 'emission', color: 'colour', mass: 'mass', dist: 'distance' };
/** What names a hole and how it is seen: every key of SCHEMA but those marked id: false (the drift's azimuth,
 *  the animation and notes switches, the render tier, the display's tone), each as its name prints it, read
 *  through the state's door (Store.open). Also the preset's printed values, which the name leaves out. */
export function identity(q) {
  const s = new Store();
  s.open(q);
  const st = s.all(), base = s.preset(st.obj, st.view);
  return ID_KEYS.map((d) => ({ d, v: printed(d, st[d.key]), base: printed(d, base[d.key]) }));
}
const keys = new Map();   // holeKey is asked on every draw of the card, for every kept hole
export const KEY_CACHE = 500;
/** How many identities are cached (bounded by KEY_CACHE). */
export const cachedKeys = () => keys.size;
/** A hole's identity as one string: links that differ only in keys marked id: false, or below the digits the
 *  name prints, are one hole (review_s3 finding 5, review_s3b B). */
export function holeKey(q) {
  const k = String(q);
  if (!keys.has(k)) {
    if (keys.size >= KEY_CACHE) keys.delete(keys.keys().next().value);
    keys.set(k, identity(k).map((x) => `${x.d.key}=${x.v}`).join('&'));
  }
  return keys.get(k);
}
export const counts = (record) => ({ kept: record.kept.length, rays: record.rays.length, falls: record.falls.length });

/* ---------------- the words ---------------- */
/** What a link opens, in words, from its identity: the object (or a hole of your own and its mass), its spin, a
 *  charge if it prints one, the inclination, the view, then every other key whose printed value is not the
 *  preset's. Two links share a name if and only if they share a holeKey (record.test.mjs checks it). */
export function linkLabel(q) {
  const id = Object.fromEntries(identity(q).map((x) => [x.d.key, x]));
  const o = OBJECTS.find((x) => x.id === id.obj.v);   // a hole of your own is no object of the catalogue
  const head = [o ? o.name : `a hole of your own, ${id.mass.v}`, `a = ${id.a.v}`];
  if (id.q.v !== '0.00') head.push(`Q = ${id.q.v}`);
  head.push(`i = ${id.incl.v}`, id.view.v);
  const inHead = new Set(['obj', 'view', 'a', 'q', 'incl', ...(o ? [] : ['mass'])]);
  const rest = Object.values(id).filter((x) => !inHead.has(x.d.key) && x.v !== x.base).map((x) => `${NAME_LABEL[x.d.key] || x.d.label || x.d.key} ${x.v}`);   // equivalent: the last || serves a key SCHEMA adds later without a label; every key today has one
  return [...head, ...rest].join(', ');
}
/** The hub's way back to a kept hole: the object and the view, under Labs OS's 80 characters (cleanLabel). */
export function resumeLabel(q) {
  const id = Object.fromEntries(identity(q).map((x) => [x.d.key, x]));
  const o = OBJECTS.find((x) => x.id === id.obj.v);
  return `Black Hole: ${o ? o.name : 'a hole of your own'}, ${id.view.v}`;
}
/** The link the record writes: always naming the object, so it opens that state and the tour does not start (a
 *  link with no key of the state is the page's first visit; review_s3 finding 2). extra: more of the address. */
export function openLink(q, extra = '') {
  // only the empty link (the page as it opens) carries no key; it gets its object's, which opens the same preset.
  // Any other link is left as it is: prefixing an object could change the preset it opens from.
  if (q) return `?${q}${extra}`;
  const s = new Store();
  s.open('');
  return `?o=${s.all().obj}${extra}`;
}
export const rayWords = (e) => (e.fate === 'disk' ? (e.n > 0 ? `lands on the disk after going round, n = ${e.n}` : FATE_WORDS.disk) : FATE_WORDS[e.fate]);
export const lineWords = (c) => `${c.kept} kept · ${c.rays} ${c.rays === 1 ? 'ray' : 'rays'} · ${c.falls} ${c.falls === 1 ? 'fall' : 'falls'}`;

/* ---------------- the store ---------------- */
export const NEWER = 'this record was written by a newer version of this page';
export async function read(os) {
  const rec = await os.progress.get({ v: V, migrate: (d) => normalise(d) });
  return { record: normalise(rec ? rec.data : null), newer: !!rec && rec.v > V };
}
export async function load(os) { return (await read(os)).record; }
/** One change applied to what the store holds now (rule 1). */
/** A failure of update, with the stage it failed at ('read' or 'write') and, after a read, the record read. */
const failed = (stage, cause, record = null) => Object.assign(new Error(`the ${stage} failed`), { stage, cause, record });
export async function update(os, change, { resume = null } = {}) {
  let got;
  try { got = await read(os); } catch (err) { throw failed('read', err); }
  const { record: cur, newer } = got;
  if (newer) return { ok: false, why: NEWER, record: cur, changed: false };
  const w = change(cur);
  const changed = JSON.stringify(w.record) !== JSON.stringify(cur);
  if (changed) { try { await os.progress.set(w.record, { v: V }); } catch (err) { throw failed('write', err, cur); } }
  if (w.ok && resume) {
    try { await os.progress.setResume(resume.url, resume.label); } catch { /* the hub's way back is not the record */ }
  }
  return { ...w, changed };
}
