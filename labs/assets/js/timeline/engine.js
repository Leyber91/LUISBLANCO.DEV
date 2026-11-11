/* ============================================================
   timeline/engine.js — the timeline's state of the world.
   Pure over the event data: no DOM, no canvas. Node-testable.

   One gate decides what any channel may show (canvas, list,
   comparison, search, model context, URL, export): an event
   passes when its tier is at or below the visitor's reading
   position and its dimension and narrative tag are not filtered
   out. Nothing above the spoiler ceiling is in the data at all.
   ============================================================ */

import { NOW, WORLDS, LAYERS, RUNGS, CEILING, READING, CALENDARS, DIMENSIONS, NARRATIVE } from './config.js';
import {
  grp, fmtCE, fmtAT, fmtCycle, nativeDate, intervalOf, threeDates, convertYears, checkCalendarRows, setUncertainty, nativeSpan,
} from './chronology.js';

export const ALL = [];            // every published event, sorted, births included
export const VIS = [];            // the events that pass the gate, sorted
export const byId = new Map();    // every published event
export const CHARS = [];
export const ERAS = [];
export const HELD = [];
export const PHYSICS = {};
export const SOURCES = {};
export const CALROWS = [];
export const DISCREPANCIES = [];
export const worldById = new Map(WORLDS.map((w) => [w.id, w]));
export const layerById = new Map(LAYERS.map((l) => [l.id, l]));

export const T_MIN = -5.0e9;
export const T_MAX = 2400;
export const SPAN_MIN = 0.012;    // about four and a half days
export const SPAN_MAX = 5.2e9;
export const KR = -8000, TE = -3537, EA = 2031;

const gate = { read: CEILING, hideDims: new Set(), hideTags: new Set(), version: 0 };

/* ---------------- loading ---------------- */

export function setData(d, { today = new Date().getFullYear() } = {}) {
  for (const a of [ALL, VIS, CHARS, ERAS, HELD, CALROWS, DISCREPANCIES]) a.length = 0;
  byId.clear();
  for (const k of Object.keys(PHYSICS)) delete PHYSICS[k];
  for (const k of Object.keys(SOURCES)) delete SOURCES[k];
  Object.assign(PHYSICS, d.physics);
  setUncertainty(d.uncertainty);
  Object.assign(SOURCES, d.sources);
  CHARS.push(...d.characters);
  ERAS.push(...d.eras);
  HELD.push(...d.held);
  CALROWS.push(...(d.calRows || []));
  DISCREPANCIES.push(...(d.discrepancies || []));
  const evs = d.events.map((e) => ({ ...e, ...(e.today ? { y: today } : {}) }));
  // births are computed from the codex age table, never typed
  for (const c of d.characters) {
    const native = c.nativeAge != null ? ` (${c.nativeAge} in Terran years by the codex table; ${convertYears(c.age, 'ce', 'at').toFixed(1)} by its rule, age × 365/400)` : '';
    evs.push({
      id: `born-${c.id}`, world: c.world, y: NOW - c.age, c: true, imp: 3, tier: c.tier, tag: 'CANON',
      title: `${c.name} is born`, who: [c.id], computed: true,
      text: `${c.name}, ${c.role}. Placed by computation from the codex age table, which gives ${c.age} at the story present${native}.`,
      src: c.src, sec: c.sec, view: [NOW - c.age - 8, NOW + 2],
    });
  }
  evs.sort((a, b) => a.y - b.y);
  ALL.push(...evs);
  for (const e of ALL) byId.set(e.id, e);
  applyGate();
}

/* ---------------- the gate ---------------- */

export function setGate({ read, hideDims, hideTags } = {}) {
  if (read != null) gate.read = Math.max(0, Math.min(CEILING, read));
  if (hideDims) gate.hideDims = new Set(hideDims);
  if (hideTags) gate.hideTags = new Set(hideTags);
  applyGate();
}
export const getGate = () => ({ read: gate.read, hideDims: [...gate.hideDims], hideTags: [...gate.hideTags], version: gate.version });

/** The spoiler half of the gate: may this reader see it at all? */
export const readable = (e) => e != null && (e.tier ?? 0) <= gate.read && (e.tier ?? 0) <= CEILING;
/** The whole gate: readable, and not filtered out. */
export function passes(e) {
  if (!readable(e)) return false;
  const dim = e.world === 'shared' ? 'earth' : e.world;
  return !gate.hideDims.has(dim) && !gate.hideTags.has(e.tag);
}
function applyGate() {
  VIS.length = 0;
  for (const e of ALL) if (passes(e)) VIS.push(e);
  gate.version++;
}
export const charsVisible = () => CHARS.filter((c) => c.tier <= gate.read);

/* ---------------- divergence (the drawn geometry, illustrative) ---------------- */

const smoother = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (u * (u * 6 - 15) + 10));

/** 0 = in step with the others, 1 = fully its own world. Kha-Ren and Terra grow from
    their discovery to the milestone where their response settled; Earth stays in step
    until the story present. */
export function divergence(worldId, y) {
  const w = worldById.get(worldId);
  if (!w || !w.settled) return 0;
  return smoother((y - w.found) / (w.settled - w.found));
}

/* ---------------- a world at a moment ---------------- */

export function eventsOf(worldId, list = VIS) { return list.filter((e) => e.world === worldId); }

export function eraAt(worldId, y) {
  return ERAS.find((r) => r.world === worldId && y >= r.y && (y < r.y2 || (r.y2 === NOW && y < NOW + 1))) || null;
}
export const heldAt = (worldId, y) => HELD.find((h) => h.world === worldId && y >= h.y && y < h.y2) || null;

export function stateAt(worldId, y) {
  const w = worldById.get(worldId);
  let last = null, next = null;
  for (const e of eventsOf(worldId)) { if (e.y <= y + 1e-6) last = e; else { next = e; break; } }
  const since = y >= w.found ? y - w.found : null;
  const until = y < w.found ? w.found - y : null;
  let status;
  if (y > NOW + 1) status = 'Beyond the story present: held for the books.';
  else if (y < -300000) status = 'No humanity yet.';
  else if (worldId === 'earth') {
    if (y < 1944) status = 'Unaltered. Its artifact has not been noticed.';
    else if (y < EA) status = 'Unaltered. Its artifact has been detected but not reached.';
    else if (y < NOW) status = 'Unaltered. Its artifact is reached, dormant and secret.';
    else status = 'Its divergence begins now.';
  } else if (since == null) status = 'Unaltered. Its artifact has not been found.';
  else status = `${grp(since)} years with its artifact.`;
  // the codex's response (DIVERGENCE_POINTS), from this world's own discovery on
  const response = since != null && y <= NOW + 1 ? `${w.response}: ${w.responseLine}` : null;
  return {
    world: w, y, native: nativeDate(w.calendar, y), since, until, era: eraAt(worldId, y), held: heldAt(worldId, y),
    last, next, status, response, divergence: divergence(worldId, y),
  };
}

/** The comparison. `align` re-indexes each world to its own discovery: t is then
    years since discovery, and each world is read at found + t. */
export function compare(t, { align = false } = {}) {
  const worlds = WORLDS.map((w) => stateAt(w.id, align ? w.found + t : t));
  return { t, align, date: align ? sinceLabel(t) : fmtCE(t), worlds, why: align ? whyAligned(t) : whyText(t), sync: !align && t >= NOW };
}
const sinceLabel = (t) => (Math.abs(t) < 0.5 ? 'the discovery' : `${grp(Math.abs(t))} ${Math.round(Math.abs(t)) === 1 ? 'year' : 'years'} ${t > 0 ? 'after' : 'before'} discovery`);

export function whyText(y) {
  const [kr, ea, te] = WORLDS;
  if (y < -4.0e9) return 'Before anything lives in the Vortex, by the codex’s dating. Only the substrate is here: the Core, Haven and an empty Vortex.';
  if (y < -300000) return 'No humanity exists yet. The Vortex is already inhabited, about four billion years deep, and the three artifacts wait in three dimensions that have no people in them.';
  if (y < KR) return `Three dimensions, one humanity, in step: the same species, the same DNA, the same minds at the same stage. None has found its artifact. Kha-Ren will in ${grp(KR - y)} years, Terra in ${grp(TE - y)}, Earth in ${grp(EA - y)}.`;
  if (y < KR + 1) return `Kha-Ren finds its artifact now, as ${kr.stage}. Its answer will be ${kr.response}: ${kr.responseLine}. Terra will not find its own for ${grp(TE - KR)} years, Earth not for ${grp(EA - KR)}.`;
  if (y < TE) return `Kha-Ren has lived with its artifact for ${grp(y - KR)} years. It found it as ${kr.stage}, too small and too exposed to absorb it, and its answer was ${kr.response}: ${kr.responseLine}. Terra and Earth are still in step, as Kha-Ren was before ${fmtCE(KR)}.`;
  if (y < EA) return `Kha-Ren: ${grp(y - KR)} years with its artifact. Terra: ${grp(y - TE)}. Earth: none. Terra found its artifact ${grp(TE - KR)} years after Kha-Ren, as ${te.stage}, and answered with ${te.response}: ${te.responseLine}. The same species met the same kind of object at a different stage of its development and built the opposite response.`;
  if (y < NOW) return `Earth has reached its artifact but keeps it dormant and secret, so its humanity is still unaltered. Kha-Ren has had its artifact for ${grp(y - KR)} years and Terra for ${grp(y - TE)}. Earth meets it as ${ea.stage}, and its answer will be ${ea.response}: ${ea.responseLine}.`;
  if (y <= NOW + 1) return `The story present. The three worlds share one now: 2068 CE is 5605 A.T. and Cycle 90, Year 68. Earth’s divergence begins here, ${grp(NOW - KR)} years after Kha-Ren’s and ${grp(NOW - TE)} after Terra’s.`;
  return 'After the story present. This page stops at the setup of Book 1.';
}

function whyAligned(t) {
  const [kr, ea, te] = WORLDS;
  if (t < 0) return `${grp(-t)} years before each world finds its artifact. Kha-Ren is ${kr.stage}; Terra is ${te.stage}; Earth is ${ea.stage}. The same distance from discovery, three very different starting points.`;
  const earthBeyond = EA + t > NOW + 1;
  return `${grp(t)} years after each discovery. Kha-Ren, which began as ${kr.stage}, chose ${kr.response}. Terra, which began as ${te.stage}, chose ${te.response}. ${earthBeyond ? `Earth cannot be read this far: its artifact was reached in 2031, ${grp(NOW - EA)} years before the story present.` : `Earth, ${ea.stage}, is still keeping its artifact dormant.`}`;
}

/* ---------------- two moments ---------------- */

export function between(a, b, { align = false } = {}) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const span = nativeSpan(lo, hi);
  const lanes = WORLDS.map((w) => {
    const off = align ? w.found : 0;
    const evs = eventsOf(w.id).filter((e) => e.y > lo + off && e.y <= hi + off);
    return { world: w, count: evs.length, events: evs };
  });
  return { a: lo, b: hi, earthYears: span.earth, terraYears: span.terra, cycles: span.cycles, cycleYears: span.years, lanes };
}

/* ---------------- links ---------------- */

export function causesOf(id) {
  const e = byId.get(id);
  return (e?.cause || []).map((c) => ({ ...c, e: byId.get(c.id) })).filter((c) => readable(c.e));
}
export function consequencesOf(id) {
  return ALL.filter((e) => readable(e) && (e.cause || []).some((c) => c.id === id)).map((e) => ({ id: e.id, t: e.cause.find((c) => c.id === id).t, e }));
}
/** The chain of causes back to the start, for "why did this happen here". */
export function causalChain(id, depth = 12) {
  const out = [];
  let cur = byId.get(id);
  const seen = new Set();
  while (cur && depth-- > 0 && !seen.has(cur.id)) {
    seen.add(cur.id);
    const c = causesOf(cur.id)[0];
    if (!c) break;
    out.push(c);
    cur = c.e;
  }
  return out;
}

export function parallelOf(ev) {
  if (!ev?.par) return null;
  const o = byId.get(ev.par);
  if (!readable(o)) return null;
  const gap = Math.abs(o.y - ev.y);
  const earlier = o.y < ev.y ? o : ev;
  return { other: o, gap, earlier, text: `${worldName(earlier.world)} got here ${grp(gap)} years earlier.` };
}

/* ---------------- physics ---------------- */

export function physicsOf(item) { return (item?.phys || []).map((id) => ({ id, ...PHYSICS[id] })).filter((p) => p.rung); }

export function rungsOf(ev) {
  const s = new Set();
  for (const p of physicsOf(ev)) { s.add(p.rung); if (p.ext) s.add(p.ext.rung); }
  return s;
}
export function rungCounts() {
  const out = Object.fromEntries(RUNGS.map((r) => [r.id, 0]));
  for (const e of VIS) for (const r of rungsOf(e)) out[r]++;
  return out;
}
export function references() {
  const seen = new Map();
  for (const p of Object.values(PHYSICS)) for (const r of p.refs || []) if (!seen.has(r.cite)) seen.set(r.cite, r);
  return [...seen.values()].sort((a, b) => a.cite.localeCompare(b.cite));
}

/* ---------------- names and sources ---------------- */

export function worldName(id) {
  return worldById.get(id)?.name || layerById.get(id)?.name || (id === 'shared' ? 'all three' : id);
}
export const sourceLabel = (key) => SOURCES[key]?.label || 'codex';
export const sourceFile = (key) => SOURCES[key]?.file || '';
export const narrativeLabel = (tag) => NARRATIVE.find((n) => n.id === tag)?.label || tag;
export const calendarDiscrepancies = () => checkCalendarRows(CALROWS);
export { threeDates, intervalOf, READING, DIMENSIONS };

/* ---------------- URL state ---------------- */

const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

export function encodeState(s) {
  const span = s.t1 - s.t0;
  const dp = span < 1 ? 4 : span < 60 ? 2 : span < 3000 ? 1 : 0;
  const f = (v) => (Math.abs(v) >= 1e6 ? v.toExponential(3) : v.toFixed(dp));
  const parts = [`t=${f(s.cursor)}`, `v=${f(s.t0)},${f(s.t1)}`];
  if (s.sel && (byId.has(s.sel) ? readable(byId.get(s.sel)) : layerById.has(s.sel))) parts.push(`e=${encodeURIComponent(s.sel)}`);
  if (s.read != null && s.read !== CEILING) parts.push(`r=${s.read}`);
  if (s.hideDims?.length) parts.push(`f=${s.hideDims.join(',')}`);
  if (s.hideTags?.length) parts.push(`n=${s.hideTags.join(',')}`);
  if (s.lens) parts.push(`l=${encodeURIComponent(s.lens)}`);
  if (s.pin != null) parts.push(`p=${f(s.pin)}`);
  if (s.align) parts.push('a=1');
  if (s.follow) parts.push(`c=${s.follow}`);
  const tr = (s.trail || []).filter((id) => readable(byId.get(id)));
  if (tr.length) parts.push(`tr=${tr.map(encodeURIComponent).join(',')}`);
  return '#' + parts.join('&');
}

export function decodeState(hash) {
  const out = {};
  const s = String(hash || '').replace(/^#/, '');
  if (!s) return out;
  for (const kv of s.split('&')) {
    const [k, v = ''] = kv.split('=');
    if (k === 't') { const n = num(Number(v), T_MIN, T_MAX); if (n != null) out.cursor = n; }
    else if (k === 'v') {
      const [a, b] = v.split(',').map(Number);
      const t0 = num(a, T_MIN, T_MAX), t1 = num(b, T_MIN, T_MAX);
      if (t0 != null && t1 != null && t1 - t0 >= SPAN_MIN && t1 - t0 <= SPAN_MAX) { out.t0 = t0; out.t1 = t1; }
    } else if (k === 'e') { const id = decodeURIComponent(v); if (byId.has(id) || layerById.has(id)) out.sel = id; }
    else if (k === 'r') { const r = Number(v); if (READING.some((x) => x.id === r)) out.read = r; }
    else if (k === 'f') out.hideDims = v.split(',').filter((d) => DIMENSIONS.includes(d));
    else if (k === 'n') out.hideTags = v.split(',').filter((d) => NARRATIVE.some((n) => n.id === d));
    else if (k === 'l') { const l = decodeURIComponent(v); if (RUNGS.some((r) => r.id === l)) out.lens = l; }
    else if (k === 'p') { const n = num(Number(v), T_MIN, T_MAX); if (n != null) out.pin = n; }
    else if (k === 'a') out.align = v === '1';
    else if (k === 'c') { if (CHARS.some((c) => c.id === v)) out.follow = v; }
    else if (k === 'tr') out.trail = v.split(',').map(decodeURIComponent).filter((id) => byId.has(id)).slice(0, 60);
  }
  return out;
}

/* ---------------- export ---------------- */

export function momentMarkdown(t, { sel, align = false, pin = null } = {}) {
  const c = compare(t, { align });
  const L = [`# TRIVERSE timeline: ${c.date}`, '', c.why, ''];
  for (const s of c.worlds) {
    L.push(`## ${s.world.name} (${s.world.role})`, `- date: ${s.native}`, `- ${s.status}`);
    if (s.era) L.push(`- era: ${s.era.name}. ${s.era.text} [${sourceFile(s.era.src) || 'conventional period'}]`);
    if (s.last) L.push(`- latest event: ${s.last.title} (${fmtCE(s.last.y, s.last.c)}) [${sourceFile(s.last.src) || 'published'} § ${s.last.sec}]`);
    L.push('');
  }
  if (pin != null) {
    const b = between(t, pin, { align });
    L.push(`## Between ${fmtCE(b.a)} and ${fmtCE(b.b)}`, `- ${grp(b.earthYears)} years on Earth’s calendar, ${grp(b.terraYears)} on Terra’s, ${b.cycles} Cycles and ${b.cycleYears} years on Kha-Ren’s (spans are differences of the native dates, as the codex converts them)`);
    for (const l of b.lanes) L.push(`- ${l.world.name}: ${l.count} events${l.count ? ': ' + l.events.map((e) => e.title).join('; ') : ''}`);
    L.push('');
  }
  const ev = sel && byId.get(sel);
  if (ev && readable(ev)) {
    L.push(`## Selected: ${ev.title}`, ev.text, `Source: ${sourceFile(ev.src) || 'published'} § ${ev.sec}`, '');
    for (const p of physicsOf(ev)) L.push(`- [${p.rung}] ${p.title}: ${p.claim}${(p.refs || []).map((r) => ` (${r.cite}${r.doi ? `, doi:${r.doi}` : ''})`).join('')}`);
    L.push('');
  }
  L.push('Source: the TRIVERSE codex (Luis Blanco, unpublished, all rights reserved), premise-level canon and the setup of Book 1 only.');
  return L.join('\n');
}
