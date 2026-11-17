/* ============================================================
   blackhole/record.js — what the Black Hole lab keeps about a
   visitor, in the lab's one record in Labs OS (lab "black-hole"),
   so the privacy page's export and erase reach all of it.

   Three lists, each the visitor's own act:
   - kept: holes the visitor chose to keep (the Keep button), each
     its link (the state's query, as Store.toQuery writes it);
   - rays: rays the visitor traced by pressing a pixel, each its
     link, the pixel as fractions of the screen (the ?p= of a
     shared ray) and what the ray did (horizon, disk n, photon
     ring, sky);
   - falls: falls the visitor ran to their stop, each its link and
     the proper time the fall took from 40 M.

   The rules, from Exomania's record (exoplanet/record.js), whose
   five were each learned from a review on 2026-11-15:

   1. The store is the truth. A page never writes back its own
      copy. A write is one change applied by `update` to what the
      store holds at that moment, so a keep in another tab, or an
      erase on the privacy page, is not undone by a page that read
      the record earlier. `changed` says whether the store was
      written; an event is tracked only for a change.
   2. One door. What comes out of the store passes the same checks
      as what comes in: `normalise` for shape and bounds, and a
      link is kept only if `isLink` accepts it.
   3. A write is checked on arrival: a bad link, time, pixel or
      fate is refused with its reason, and the record comes back
      as it was.
   4. A page writes only a record whose version it knows; a later
      version's record is read for display and never written.
   5. Counts and sentences are computed here, on the record shown.

   Nothing typed is kept: a link holds the state's numbers only.
   Every function but `read`, `load` and `update` is pure.
   ============================================================ */

import { Store } from './state.js';
import { OBJECTS, VIEWS } from './config.js';
import { spinText } from './physics.js';

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
const isFrac = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
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
  const rays = list(d.rays).map(obj).filter((e) => isLink(e.q) && isTime(e.t) && Array.isArray(e.p) && e.p.length === 2 && e.p.every(isFrac) && FATES.includes(e.fate) && Number.isInteger(e.n) && e.n >= 0 && e.n <= 9)
    .map((e) => ({ q: e.q, t: e.t, p: [e.p[0], e.p[1]], fate: e.fate, n: e.n }));
  const falls = list(d.falls).map(obj).filter((e) => isLink(e.q) && isTime(e.t) && isTime(e.tau)).map((e) => ({ q: e.q, t: e.t, tau: e.tau }));
  const unique = (xs, key) => { const seen = new Set(); return xs.filter((e) => { const k = key(e); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const dropped = Number.isInteger(d.dropped) && d.dropped >= 0 ? Math.min(d.dropped, LIMITS.dropped) : 0;
  return {
    kept: thumbsBounded(unique(kept, (e) => e.q).slice(0, LIMITS.kept)),
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
  const rest = record.kept.filter((e) => e.q !== q);
  if (rest.length === record.kept.length && record.kept.length >= LIMITS.kept) return refuse(record, FULL);
  return { ok: true, why: '', record: { ...record, kept: thumbsBounded([img ? { q, t, img } : { q, t }, ...rest]) } };
}
export function unkeep(record, q) {
  const kept = record.kept.filter((e) => e.q !== q);
  return kept.length === record.kept.length ? refuse(record, 'that hole is not kept') : { ok: true, why: '', record: { ...record, kept } };
}
/** A traced ray (most recent first); past the bound the oldest goes, counted in `dropped`. */
export function ray(record, { q, t, p, fate, n = 0 }) {
  if (!isLink(q)) return refuse(record, BAD_LINK);
  if (!isTime(t)) return refuse(record, BAD_TIME);
  if (!(Array.isArray(p) && p.length === 2 && p.every(isFrac))) return refuse(record, 'the pixel is not inside the screen');
  if (!FATES.includes(fate)) return refuse(record, 'the ray did something this page does not name');
  if (!(Number.isInteger(n) && n >= 0 && n <= 9)) return refuse(record, 'the image order is not 0 to 9');
  const rays = [{ q, t, p: [p[0], p[1]], fate, n }, ...record.rays];
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
export const isKept = (record, q) => record.kept.some((e) => e.q === q);
export const counts = (record) => ({ kept: record.kept.length, rays: record.rays.length, falls: record.falls.length });

/* ---------------- the words ---------------- */
/** What a link opens, in words: the object (or a hole of your own), its spin, a charge if it has one, the view.
 *  Read through the state's own door (Store.open), so a link names what the page would show. */
export function linkLabel(q) {
  const s = new Store();
  s.open(q);
  const st = s.all(), o = OBJECTS.find((x) => x.id === st.obj);
  return `${o ? o.name : 'a hole of your own'}, a = ${spinText(st.a)}${st.q > 0 ? `, Q = ${(+st.q).toFixed(2)}` : ''}, ${VIEWS[st.view].label.toLowerCase()}`;
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
export async function update(os, change, { resume = null } = {}) {
  const { record: cur, newer } = await read(os);
  if (newer) return { ok: false, why: NEWER, record: cur, changed: false };
  const w = change(cur);
  const changed = JSON.stringify(w.record) !== JSON.stringify(cur);
  if (changed) await os.progress.set(w.record, { v: V });
  if (w.ok && resume) {
    try { await os.progress.setResume(resume.url, resume.label); } catch { /* the hub's way back is not the record */ }
  }
  return { ...w, changed };
}
