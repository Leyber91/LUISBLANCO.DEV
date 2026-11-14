/* ============================================================
   heptapod/pod/day.js — one day in the pod, as a plain record.

   The record is everything the page keeps: where the six things
   are, what is in the hand, every act in order with the ring the
   being wrote about it, every crop the visitor cut, the pencil
   guesses, the marks raised on the slate, and the evening check.
   It is plain JSON, so it survives a reload from the browser's
   own storage and nothing leaves the browser.

   The notebook never reads a guess. An entry is the radical (or
   radicals) a crop kept; the scenes beside it are every act whose
   ring carried them; a bracket joins entries that no act on the
   record has yet told apart.
   ============================================================ */

import { mulberry32 } from '../raster.js';
import { SCENES, OBJ, sceneOf } from './world.js';
import { seedOf, shuffle } from './species.js';
import { checkItems } from './proxy.js';
import { MarkLearner } from './being.js';
import { FIELD, ROLES } from './ring.js';

export const DAY = {
  ACTS: 40,        // rings in a day: the exposure the proxy learner was run at
  MIN_ACTS: 12,    // the visitor may end the day from here
  SLOTS: 6,        // places for a thing on each plate
  SCRAPS: 6,       // crops that kept no whole radical, oldest dropped
  MARK_MAX: 24,    // characters of a mark on the slate
  GUESS_MAX: 60,
};
const EMPH_ORDER = ['patient', 'pred', 'agent', 'recipient'];

export function newDay(target, seed, daySeed = 1) {
  const order = shuffle(OBJ, mulberry32(seedOf('day', target, seed, daySeed)));
  const near = new Array(DAY.SLOTS).fill(null), far = new Array(DAY.SLOTS).fill(null);
  [0, 2, 4].forEach((s, i) => { near[s] = order[i]; });
  [1, 3, 5].forEach((s, i) => { far[s] = order[3 + i]; });
  return {
    v: 1, species: [target, seed], daySeed, phase: 'day',
    plates: { near, far }, held: null,
    acts: [], crops: [], entries: [], marks: [], check: null, readback: null, nextId: 1,
  };
}

export const whereIs = (state, obj) => {
  if (!OBJ.includes(obj)) return null;
  for (const place of ['near', 'far']) { const s = state.plates[place].indexOf(obj); if (s >= 0) return { place, slot: s }; }
  return null;
};
/* The free slot of a plate nearest to the one asked for, or -1. */
export function freeSlot(state, place, want = 2) {
  const row = state.plates[place];
  let best = -1;
  for (let s = 0; s < row.length; s++) if (row[s] === null && (best < 0 || Math.abs(s - want) < Math.abs(best - want))) best = s;
  return best;
}
export const dayOver = (state) => state.acts.length >= DAY.ACTS;
export const canEnd = (state) => state.phase === 'day' && state.acts.length >= DAY.MIN_ACTS;

/* What the ring of act i carries, by sector name of the ring spec. */
export const idsOfAct = (sp, act) => sp.rings[act.scene].ids;
const idList = (sp, scene) => Object.values(sp.rings[scene].ids).filter(Boolean);

/* The sector the being presses on: the concept it has written least often before this ring. */
function emphasisFor(state, sp, scene) {
  const seen = new Map();
  for (const a of state.acts) for (const id of new Set(idList(sp, a.scene))) seen.set(id, (seen.get(id) || 0) + 1);
  const ids = sp.rings[scene].ids;
  let best = null, n = Infinity;
  for (const role of EMPH_ORDER) {
    const id = ids[FIELD[role]];
    if (!id) continue;
    const c = seen.get(id) || 0;
    if (c < n) { n = c; best = role; }
  }
  return best;
}

/**
 * One act. kind: lift | hold | putdown | give. opts: obj (lift), place (hold, putdown), slot (putdown).
 * Returns the act's record { scene, emph }, or null when the act is not possible now.
 */
export function doAct(state, sp, kind, opts = {}) {
  if (state.phase !== 'day' || dayOver(state)) return null;
  let obj, place;
  if (kind === 'lift') {
    if (state.held) return null;
    const at = whereIs(state, opts.obj);
    if (!at) return null;
    obj = opts.obj; place = at.place;
    state.plates[place][at.slot] = null;
    state.held = { obj, over: place, slot: at.slot };
  } else {
    if (!state.held) return null;
    obj = state.held.obj;
    if (kind === 'hold') {
      place = opts.place === 'far' ? 'far' : 'near';
      state.held.over = place;
    } else if (kind === 'putdown') {
      place = opts.place === 'far' ? 'far' : 'near';
      const slot = freeSlot(state, place, opts.slot ?? state.held.slot ?? 2);
      if (slot < 0) return null;
      state.plates[place][slot] = obj;
      state.held = null;
    } else if (kind === 'give') {
      place = 'near';                       // a thing is given at the glass, and comes back to the plate beside it
      const slot = freeSlot(state, 'near', 2);
      const back = slot >= 0 ? ['near', slot] : ['far', freeSlot(state, 'far', 2)];
      if (back[1] < 0) return null;
      state.plates[back[0]][back[1]] = obj;
      state.held = null;
    } else return null;
  }
  const scene = sceneOf(kind, obj, place);
  const rec = { scene, emph: emphasisFor(state, sp, scene) };
  state.acts.push(rec);
  return rec;
}

/* ---------------- the notebook ---------------- */
const entryKey = (tokens) => tokens.slice().sort().join(' ');
export const GREETING = -1;      // the act index of the ring written before any act
/* The species ring behind an act index: a scene's ring, or the greeting. */
export const ringOfAct = (state, sp, i) => (i === GREETING ? sp.greeting : state.acts[i] ? sp.rings[state.acts[i].scene] : null);
/* What to hand ring.js ringSpec to redraw the ring of an act index. */
export const specArgsOfAct = (state, i) => (i === GREETING ? [GREETING, null] : [state.acts[i].scene, state.acts[i].emph]);

/**
 * A crop cut from the ring of act actIndex. roles are the sectors it kept (ring.js recognise);
 * with none it is a scrap. Returns { entry, fresh } so the page can show what landed.
 */
export function addCrop(state, sp, actIndex, rect, erode, roles, cells) {
  const ring = ringOfAct(state, sp, actIndex);
  if (!ring || cells < 1) return null;
  const kept = ROLES.filter((r) => roles.includes(r) && ring[FIELD[r]]);
  const tokens = [...new Set(kept.map((r) => ring[FIELD[r]]))];
  const crop = { id: state.nextId++, act: actIndex, rect, erode, roles: kept, cells };
  if (!tokens.length) {
    state.crops.push(crop);
    const entry = { key: 'scrap ' + crop.id, tokens: [], crop: crop.id, cells, guess: '' };
    state.entries.push(entry);
    const scraps = state.entries.filter((e) => !e.tokens.length);
    if (scraps.length > DAY.SCRAPS) dropEntry(state, scraps[0].key);
    return { entry, fresh: true };
  }
  const key = entryKey(tokens);
  const old = state.entries.find((e) => e.key === key);
  if (old) {                      // the notebook keeps the crop with the most ink, and only that one
    if (cells > old.cells) {
      state.crops = state.crops.filter((c) => c.id !== old.crop);
      state.crops.push(crop);
      old.crop = crop.id; old.cells = cells;
    }
    return { entry: old, fresh: false };
  }
  state.crops.push(crop);
  const entry = { key, tokens, crop: crop.id, cells, guess: '' };
  state.entries.push(entry);
  return { entry, fresh: true };
}

/** Keep the one radical of the evening's read-back: a crop of a ring that carries nothing else. */
export function addSolo(state, sp, id) {
  const token = sp.code.get(id);
  if (!token) return null;
  const old = state.entries.find((e) => e.key === token);
  if (old) return { entry: old, fresh: false };
  const crop = { id: state.nextId++, act: null, solo: id, rect: { x0: -1.6, y0: -1.6, x1: 1.6, y1: 1.6 }, erode: 0, roles: [], cells: 6 };
  state.crops.push(crop);
  const entry = { key: token, tokens: [token], crop: crop.id, cells: 6, guess: '' };
  state.entries.push(entry);
  return { entry, fresh: true };
}

export function dropEntry(state, key) {
  state.entries = state.entries.filter((e) => e.key !== key);
  const used = new Set(state.entries.map((e) => e.crop));
  state.crops = state.crops.filter((c) => used.has(c.id));
}
export function setGuess(state, key, text) {
  const e = state.entries.find((x) => x.key === key);
  if (e) e.guess = String(text).slice(0, DAY.GUESS_MAX);
}

/* The acts whose ring carried every radical of an entry. */
export function entryActs(state, sp, entry) {
  if (!entry.tokens.length) return [state.crops.find((c) => c.id === entry.crop)?.act].filter((x) => x != null && x >= 0);
  const out = [];
  state.acts.forEach((a, i) => { const t = sp.rings[a.scene].tokens; if (entry.tokens.every((x) => t.includes(x))) out.push(i); });
  return out;
}
/* The same, counted by scene type, most recent first: [{ scene, n, last }]. */
export function entryScenes(state, sp, entry) {
  const by = new Map();
  for (const i of entryActs(state, sp, entry)) {
    const s = state.acts[i].scene;
    const r = by.get(s) || { scene: s, n: 0, last: i };
    r.n++; r.last = i;
    by.set(s, r);
  }
  return [...by.values()].sort((a, b) => b.last - a.last);
}
/* Groups of single-radical entries that have appeared in exactly the same acts. */
export function brackets(state, sp) {
  const by = new Map();
  for (const e of state.entries) {
    if (e.tokens.length !== 1) continue;
    const sig = entryActs(state, sp, e).join(',');
    if (!sig) continue;
    if (!by.has(sig)) by.set(sig, []);
    by.get(sig).push(e.key);
  }
  return [...by.values()].filter((g) => g.length > 1);
}

/* ---------------- the slate ---------------- */
export const cleanMark = (text) => String(text).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, DAY.MARK_MAX);

/** Raise a mark to the glass. It is counted against the ring of the latest act, once per ring. */
export function raiseMark(state, text) {
  const mark = cleanMark(text);
  if (!mark || state.phase !== 'day' || !state.acts.length) return null;
  const act = state.acts.length - 1;
  if (state.marks.some((m) => m.mark === mark && m.act === act)) return null;
  const rec = { mark, act };
  state.marks.push(rec);
  return rec;
}
/* The being's learner, rebuilt from the record. */
export function learnerOf(state, sp) {
  const L = new MarkLearner();
  state.acts.forEach((a, i) => {
    const ids = idList(sp, a.scene);
    L.see(ids);
    for (const m of state.marks) if (m.act === i) L.raise(m.mark, ids);
  });
  return L;
}
export function markCounts(state) {
  const by = new Map();
  for (const m of state.marks) by.set(m.mark, (by.get(m.mark) || 0) + 1);
  return [...by.entries()].map(([mark, n]) => ({ mark, n }));
}

/* ---------------- the evening ---------------- */
export function seenCounts(state) {
  const seen = new Array(SCENES.length).fill(0), lastSeen = new Array(SCENES.length).fill(-1);
  state.acts.forEach((a, i) => { seen[a.scene]++; lastSeen[a.scene] = i; });
  return { seen, lastSeen };
}

/** End the day: the being's reading of the most repeated mark, and six rings about unseen scenes. */
export function endDay(state, sp) {
  if (!canEnd(state)) return false;
  if (state.held) {                         // a thing still in the hand goes back to a plate; no ring is written
    const place = freeSlot(state, state.held.over, state.held.slot ?? 2) >= 0 ? state.held.over : state.held.over === 'near' ? 'far' : 'near';
    state.plates[place][freeSlot(state, place, state.held.slot ?? 2)] = state.held.obj;
  }
  const L = learnerOf(state, sp);
  const mark = L.mostRepeated();
  const r = mark ? L.reading(mark) : null;
  state.readback = r ? { mark, id: r.id, c: r.c, n: r.n } : null;
  const { seen, lastSeen } = seenCounts(state);
  const [target, seed] = state.species;
  const { items, fallbacks } = checkItems(sp, seen, lastSeen, mulberry32(seedOf('visitor-check', target, seed, state.daySeed, state.acts.length)));
  state.check = { items, fallbacks, answers: [] };
  state.held = null;
  state.phase = 'evening';
  return true;
}
export function answer(state, i, scene) {
  if (state.phase !== 'evening' || !state.check || i !== state.check.answers.length) return false;
  if (!state.check.items[i].options.includes(scene)) return false;
  state.check.answers.push(scene);
  if (state.check.answers.length === state.check.items.length) state.phase = 'done';
  return true;
}
export const score = (state) => (state.check ? state.check.answers.filter((a, i) => a === state.check.items[i].target).length : 0);

/* The hand moves over the other plate without an act: no ring, but the record knows where it is. */
export function carry(state, place) { if (state.held) state.held.over = place === 'far' ? 'far' : 'near'; }

/* A record read back from storage is used only if every part of it has the shape this file writes;
   anything else starts a new day. sp, when given, also checks what only the species can: the read-back's
   concept exists. */
export function validDay(s, sp = null) {
  const isScene = (x) => Number.isInteger(x) && x >= 0 && x < SCENES.length;
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const str = (x, max) => typeof x === 'string' && x.length <= max;
  try {
    if (!isObj(s) || s.v !== 1 || !Array.isArray(s.species) || s.species.length !== 2 || !['day', 'evening', 'done'].includes(s.phase)) return false;
    if (!isObj(s.plates)) return false;
    const onPlates = [];
    for (const p of ['near', 'far']) {
      const row = s.plates[p];
      if (!Array.isArray(row) || row.length !== DAY.SLOTS || !row.every((o) => o === null || OBJ.includes(o))) return false;
      onPlates.push(...row.filter(Boolean));
    }
    if (s.held !== null && !(isObj(s.held) && OBJ.includes(s.held.obj) && ['near', 'far'].includes(s.held.over))) return false;
    const all = [...onPlates, ...(s.held ? [s.held.obj] : [])];
    if (all.length !== OBJ.length || new Set(all).size !== OBJ.length) return false;        // each of the six things, once
    if (!Array.isArray(s.acts) || s.acts.length > DAY.ACTS || !s.acts.every((a) => isObj(a) && isScene(a.scene) && (a.emph === null || ROLES.includes(a.emph)))) return false;
    if (!Number.isInteger(s.nextId) || !Array.isArray(s.crops) || s.crops.length > 400) return false;
    const rectOk = (r) => isObj(r) && [r.x0, r.y0, r.x1, r.y1].every(Number.isFinite) && r.x1 > r.x0 && r.y1 > r.y0;
    if (!s.crops.every((c) => isObj(c) && Number.isInteger(c.id) && rectOk(c.rect) && Number.isFinite(c.erode)
      && (c.solo ? str(c.solo, 80) : c.act === GREETING || (Number.isInteger(c.act) && c.act >= 0 && c.act < s.acts.length)))) return false;
    const cropIds = new Set(s.crops.map((c) => c.id));
    if (!Array.isArray(s.entries) || s.entries.length > 400) return false;
    if (!s.entries.every((e) => isObj(e) && str(e.key, 200) && Array.isArray(e.tokens) && e.tokens.every((t) => str(t, 6))
      && cropIds.has(e.crop) && Number.isFinite(e.cells) && str(e.guess ?? '', DAY.GUESS_MAX))) return false;
    if (!Array.isArray(s.marks) || s.marks.length > 4000) return false;
    if (!s.marks.every((m) => isObj(m) && str(m.mark, DAY.MARK_MAX) && m.mark.length > 0 && Number.isInteger(m.act) && m.act >= 0 && m.act < s.acts.length)) return false;
    if (s.readback != null && !(isObj(s.readback) && str(s.readback.mark, DAY.MARK_MAX) && str(s.readback.id, 80)
      && Number.isFinite(s.readback.c) && Number.isFinite(s.readback.n) && (!sp || sp.trits.has(s.readback.id)))) return false;
    if (s.phase === 'day') return s.check == null;
    const c = s.check;
    if (!isObj(c) || !Array.isArray(c.items) || c.items.length < 1 || c.items.length > 12 || !Array.isArray(c.answers)) return false;
    if (!c.items.every((it) => isObj(it) && isScene(it.target) && Array.isArray(it.options) && it.options.length === 3 && it.options.every(isScene) && it.options.includes(it.target))) return false;
    if (c.answers.length > c.items.length || !c.answers.every((a, i) => c.items[i].options.includes(a))) return false;
    return s.phase === 'done' ? c.answers.length === c.items.length : c.answers.length < c.items.length;
  } catch { return false; }
}
