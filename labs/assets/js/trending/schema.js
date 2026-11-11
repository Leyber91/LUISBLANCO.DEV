/* ============================================================
   trending/schema.js — every observation passes here before any
   view renders it. A failing item is reported in the trace with its
   reason and never drawn.
   ============================================================ */

import { SOURCES } from './constants.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function checkObs(o) {
  if (!o || typeof o !== 'object') return 'not an object';
  if (typeof o.id !== 'string' || !o.id) return 'missing id';
  if (!SOURCES[o.src]) return `unknown source "${o.src}"`;
  if (typeof o.title !== 'string' || !o.title.trim()) return 'missing title';
  if (o.title.length > 400) return 'title over 400 characters';
  let u;
  try { u = new URL(o.url); } catch { return 'url is not absolute'; }
  if (u.protocol !== 'https:') return 'url is not https';
  if (!Number.isFinite(o.t)) return 'missing observation time';
  if (!Number.isFinite(o.count) || o.count < 0) return 'count is not a finite non-negative number';
  const kind = SOURCES[o.src].kind;
  if (kind === 'readership') {
    if (!DAY.test(o.day || '')) return 'missing day';
    if (o.series && !Array.isArray(o.series)) return 'series is not a list';
  } else {
    if (!Number.isFinite(o.created) || o.created <= 0) return 'missing created time';
    if (o.created > o.t + 3600e3) return 'created after the observation';
  }
  return null;
}

export function checkScore(sc) {
  if (!sc) return 'no score';
  if (sc.isNew) return null;
  for (const k of ['rate', 'lo', 'hi', 'total']) {
    if (!Number.isFinite(sc[k]) || sc[k] < 0) return `${k} is not a finite non-negative number`;
  }
  if (sc.lo > sc.rate + 1e-9 || sc.rate > sc.hi + 1e-9) return 'interval does not contain the rate';
  return null;
}

/* Split a list into valid items and rejections with reasons. */
export function partition(items) {
  const ok = [], bad = [];
  for (const o of items) {
    const why = checkObs(o);
    if (why) bad.push({ id: o?.id || '?', src: o?.src || '?', reason: why });
    else ok.push(o);
  }
  return { ok, bad };
}
