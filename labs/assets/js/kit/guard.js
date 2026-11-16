/* ============================================================
   kit/guard.js — what comes from outside is made harmless where
   it enters.

   A lab takes data from places anyone can write: a share link, a
   file a visitor is handed and imports, this browser's storage
   (where an earlier crafted link may have left something), a
   model's reply. Several labs then write that data into the page
   as HTML. On 2026-11-14 an audit found links in two labs that
   ran script on the site's origin that way.

   The rule: clean at the door, once, so that no view has to
   remember. The functions here change text only as far as needed
   to make it inert, and a lab says which fields are measured text
   that must stay exactly as written (those it must escape itself
   when it draws them).
   ============================================================ */

const LOOK = { '<': '‹', '>': '›', '"': '”', "'": '’', '`': '‘' };

/* Text that cannot start a tag. Enough for element content; quotes are left as written, so it suits prose. */
export const noTags = (s) => String(s).replace(/[<>]/g, (c) => LOOK[c]);

/* Text that cannot start a tag or leave a quoted attribute: for labels, ids and other short metadata
   that a view may place anywhere in its markup. */
export const inert = (s) => String(s).replace(/[<>"'`]/g, (c) => LOOK[c]);

/* A finite number, from a number or from a string that is one; otherwise null. */
export function finite(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}
/* An integer inside lo..hi, or null. */
export const intIn = (v, lo, hi) => { const n = finite(v); return n != null && Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

/* An http or https address, normalised, or null: a link taken from a file can otherwise be a script. */
export function httpUrl(v) {
  if (typeof v !== 'string') return null;
  try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}

/* A six-digit hex colour, or null: a colour taken from outside can otherwise be a url() the page then fetches. */
export const hexColour = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);

const MAX_DEPTH = 40;
/**
 * A copy of a JSON value with every string and every key passed through clean (inert by default).
 * keep(path) says which strings are left exactly as written: path is the list of keys and indexes to it.
 * Anything nested deeper than any real record is dropped, never passed through uncleaned.
 */
export function cleanDeep(v, { clean = inert, keep = null } = {}, path = []) {
  if (typeof v === 'string') return keep && keep(path) ? v : clean(v);
  if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? null : v;
  if (path.length >= MAX_DEPTH) return null;
  if (Array.isArray(v)) return v.map((x, i) => cleanDeep(x, { clean, keep }, [...path, i]));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[clean(k)] = cleanDeep(x, { clean, keep }, [...path, k]);
  return out;
}
