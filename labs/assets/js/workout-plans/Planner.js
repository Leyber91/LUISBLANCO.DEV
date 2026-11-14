/* ============================================================
   workout-plans/Planner.js — the deterministic planner. Pure
   logic, no DOM, no model call. Same inputs, same plan.

   buildPlan(inputs) runs eight stages and writes one decision
   log entry per decision, with its numbers and its source:
     1 frequency      sessions per week from days and level
     2 spacing        which of the visitor's days, most rest between
     3 split          session templates for that frequency
     4 periodization  scheme from goal and level, week shapes
     5 substitution   breadth-first walk of the exercise graph
                      under equipment and injury constraints
     6 time budget    which slots fit the minutes
     7 allocation     greedy water-fill of sets toward the weekly
                      per-muscle target, inside the time budget
     8 load           session RPE x minutes, then the load model
   replan(plan, log) applies the week the visitor actually had and
   re-plans the rest of the block (see the R rules below).
   ============================================================ */

import {
  GOALS, EQUIPMENT, KIT_LABEL, INJURIES, FREQ, SCHEME_RULE, SCHEME_LABEL, SCHEME_SRC,
  WEEK_SHAPE, REPS, BASE_RPE, VOLUME, TARGETED, TARGETED_BY_FAMILY, SECONDARY_WEIGHT, MUSCLE_WEIGHT, TIME, TEMPLATES, SPLITS,
  CARDIO, STR_IN_COMBO_FRAC, SESSION_RPE_OFFSET, LOAD_MODEL, REPLAN, DAY_NAMES, WHO_AEROBIC_MIN,
} from './constants.js';
import { EX, MUSCLES, MUSCLE_LABEL, PATTERNS } from './library.js';
import { sessionLoad, runModel } from './LoadModel.js';

/* ---------- small helpers ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;
const half = (v) => Math.round(v * 2) / 2;
const list = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const dayList = (idx) => idx.map((i) => DAY_NAMES[i]).join(', ');
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const an = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;

class DecisionLog {
  constructor(prefix) { this.prefix = prefix; this.items = []; }
  add(e) {
    const id = this.prefix + (this.items.length + 1);
    const entry = { id, tag: 'REAL', src: null, view: 'plan', nums: [], ...e };
    this.items.push(entry);
    return entry;
  }
}

/* ---------- stage 2: day spacing ---------- */
function* combos(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i < arr.length; i++) { acc.push(arr[i]); yield* combos(arr, k, i + 1, acc); acc.pop(); }
}
function gaps(days) {
  return days.map((d, i) => (i < days.length - 1 ? days[i + 1] - d : days[0] + 7 - d));
}
export function chooseDays(avail, n) {
  if (n >= avail.length) return avail.slice();
  let best = null, bestKey = null;
  for (const c of combos(avail, n)) {
    const g = gaps(c);
    const minGap = Math.min(...g);
    const b2b = g.filter((x) => x === 1).length;
    const spread = g.reduce((a, b) => a + (b - 7 / n) ** 2, 0);
    const key = [-minGap, b2b, spread];
    const better = !best || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2] - 1e-9)));
    if (better) { best = c; bestKey = key; }
  }
  return best;
}

/* ---------- stage 4: week shapes ---------- */
export function weekShapes(scheme, W, goal) {
  const taper = goal === 'strength' || goal === 'endurance';
  const out = [];
  if (scheme === 'block') {
    const rest = W - 2;
    const A = Math.round(rest * 0.55), T = rest - A;
    for (let i = 0; i < A; i++) {
      const deload = W >= 12 && i === A - 1;
      out.push(deload ? { phase: 'deload', vol: WEEK_SHAPE.deloadVol, rpeAdd: WEEK_SHAPE.deloadRpe, block: 'accumulation' }
        : { phase: 'accumulation', vol: WEEK_SHAPE.block.accumulation.vol, rpeAdd: WEEK_SHAPE.block.accumulation.rpe, block: 'accumulation' });
    }
    for (let i = 0; i < T; i++) {
      const deload = W >= 12 && i === T - 1;
      out.push(deload ? { phase: 'deload', vol: WEEK_SHAPE.deloadVol, rpeAdd: WEEK_SHAPE.deloadRpe, block: 'transmutation' }
        : { phase: 'transmutation', vol: WEEK_SHAPE.block.transmutation.vol, rpeAdd: WEEK_SHAPE.block.transmutation.rpe, block: 'transmutation' });
    }
    for (let i = 0; i < 2; i++) out.push({ phase: 'taper', vol: WEEK_SHAPE.taperVol[i], rpeAdd: WEEK_SHAPE.block.realization.rpe, block: 'realization' });
  } else {
    let k = 0, meso = 0;
    for (let w = 0; w < W; w++) {
      if (taper && w >= W - 2) { out.push({ phase: 'taper', vol: WEEK_SHAPE.taperVol[w - (W - 2)], rpeAdd: WEEK_SHAPE.buildRpe[2], meso }); continue; }
      const deloadSlot = w % 4 === 3 && (!taper || w < W - 3);
      if (deloadSlot) { out.push({ phase: 'deload', vol: WEEK_SHAPE.deloadVol, rpeAdd: WEEK_SHAPE.deloadRpe, meso }); k = 0; meso++; continue; }
      const kk = Math.min(k, 2);
      out.push({ phase: 'build', vol: WEEK_SHAPE.buildVol[kk], rpeAdd: WEEK_SHAPE.buildRpe[kk], meso, k: kk });
      k++;
    }
  }
  return out.map((d, w) => ({ ...d, w, label: d.phase === 'build' ? `build ${d.k + 1}` : d.phase }));
}

/* ---------- stage 5: the substitution graph walk ---------- */
export function violations(x, kit, flags) {
  const out = [];
  const missing = x.equip.filter((k) => !kit.has(k));
  if (missing.length) out.push({ type: 'equipment', text: 'needs ' + list(missing.map((k) => KIT_LABEL[k] || k)) });
  for (const f of flags) if (INJURIES[f].test(x)) out.push({ type: f, text: INJURIES[f].why(x) });
  return out;
}
export function walkGraph(startId, kit, flags, used = new Set()) {
  const parent = new Map([[startId, null]]);
  const queue = [startId];
  const visited = [];
  const rejected = new Map();
  let chosen = null, fallback = null;
  const pattern = EX[startId]?.pattern;
  while (queue.length) {
    const id = queue.shift();
    const x = EX[id];
    if (!x) continue;
    visited.push(id);
    const v = violations(x, kit, flags);
    if (!v.length && !used.has(id)) {
      if (x.pattern === pattern) { chosen = id; break; }
      if (!fallback) fallback = id;   // passes, but changes the movement pattern: keep looking
    } else rejected.set(id, v.length ? v : [{ type: 'duplicate', text: 'already in this session' }]);
    for (const s of x.subs) if (!parent.has(s)) { parent.set(s, id); queue.push(s); }
  }
  if (!chosen && fallback) chosen = fallback;
  const path = [];
  for (let at = chosen; at; at = parent.get(at)) path.unshift(at);
  const edges = [];
  for (const id of visited) for (const s of EX[id].subs) if (visited.includes(s)) edges.push([id, s]);
  // the frontier the search never reached: shown faint, with what it would have met
  const frontier = queue.filter((id) => EX[id] && !visited.includes(id)).slice(0, 4);
  const far = {};
  for (const id of frontier) far[id] = violations(EX[id], kit, flags);
  const farEdges = frontier.map((id) => [parent.get(id), id]).filter(([a]) => a);
  return { start: startId, chosen, path, visited, rejected: Object.fromEntries(rejected), edges, frontier, far, farEdges, pattern: EX[startId]?.pattern };
}

/* ---------- prescriptions ---------- */
function repsFor(goal, scheme, week, tplDay, role) {
  const R = REPS[goal];
  if (role === 'acc') return R.acc;
  if (scheme === 'block' && R.block) return R.block[week.block] || R.block.accumulation;
  if (scheme === 'undulating' && R.undulating) return R.undulating[tplDay] || R.undulating.M;
  const lin = R.linear || REPS.general.linear;
  return lin[Math.min(week.meso ?? 0, lin.length - 1)];
}
const restFor = (goal, role) => TIME.rest[goal][role === 'acc' ? 1 : 0];
const setCost = (goal, role) => TIME.work + restFor(goal, role);
const slotCost = (goal, role, sets) => (sets > 0 ? (role === 'main' ? TIME.setupMain : TIME.setupAcc) + sets * setCost(goal, role) : 0);

/* parse a split code: 'UPPER_A', 'C:INT', 'C:EASY+STR_E' */
function parseCode(code) {
  if (!code.startsWith('C:')) return { tpl: code, cardio: null };
  const [c, t] = code.slice(2).split('+');
  return { tpl: t || null, cardio: c };
}

/* ======================================================================
   buildPlan
   ====================================================================== */
export function buildPlan(inp) {
  const L = new DecisionLog('D');
  const goal = inp.goal, level = inp.level;
  const fam = GOALS[goal].family;
  const notes = inp.notes || { flags: [], noDays: [], kitAdd: [], kitRemove: [], fired: [], ignored: [] };
  const kit = new Set(EQUIPMENT[inp.equipment].kit.concat(notes.kitAdd).filter((k) => !notes.kitRemove.includes(k)));
  const flags = [...new Set((inp.injuries || []).concat(notes.flags))].filter((f) => INJURIES[f]);
  const M = inp.minutes, W = inp.weeks;
  const goalKey = fam === 'endure' ? 'endurance' : goal;
  if (notes.fired.length || notes.ignored.length) {
    const fired = notes.fired.filter((f) => f.kind !== 'red').map((f) => `"${f.phrase}" -> ${f.wrote}`);
    const ign = notes.ignored.map((g) => `"${g.phrase}" (${g.why})`);
    L.add({ kind: 'notes', text: `Notes read by rule: ${fired.length ? fired.join('; ') : 'nothing that changes the plan'}` + (ign.length ? `. Ignored: ${ign.join('; ')}.` : '.'),
      say: fired.length ? `From your notes the planner took ${fired.length === 1 ? 'one constraint' : fired.length + ' constraints'}: ${notes.fired.filter((f) => f.kind !== 'red').map((f) => f.wrote).join(', ')}.` : 'Your notes changed nothing in the plan.',
      nums: [fired.length], tag: 'ILLUSTRATIVE', view: 'plan' });
  }
  if (notes.kitAdd.length || notes.kitRemove.length) {
    L.add({ kind: 'kit', text: `Kit for this plan: ${[...kit].map((k) => KIT_LABEL[k] || k).join(', ') || 'bodyweight only'}.`,
      say: `The planner works with ${[...kit].map((k) => KIT_LABEL[k] || k).join(', ') || 'bodyweight only'}.`, nums: [], tag: 'ILLUSTRATIVE', view: 'graph' });
  }

  /* 1 frequency */
  let avail = inp.days.map((v, i) => (v && !notes.noDays.includes(i) ? i : -1)).filter((i) => i >= 0);
  if (!avail.length) avail = inp.days.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const [fLo, fHi] = FREQ[fam][level];
  const n = clamp(Math.min(avail.length, fHi), 1, 6);
  {
    const f = FREQ[fam];
    let text, say;
    if (avail.length > fHi) {
      text = `${avail.length} days marked; ${level} ${GOALS[goal].label} work runs ${fLo}-${fHi} sessions a week, so the plan uses ${n}.`;
      say = `You marked ${avail.length} days, and the planner uses ${n} of them because ${an(level)} block of this kind runs ${fLo} to ${fHi} sessions a week.`;
    } else if (avail.length < fLo) {
      text = `${avail.length} days marked, below the ${fLo}-${fHi} sessions a week for ${level} ${GOALS[goal].label} work; the plan uses all ${n}.`;
      say = `You marked ${avail.length} days, fewer than the ${fLo} to ${fHi} ${an(level)} block usually has, so every one of them carries a session.`;
    } else {
      text = `${avail.length} days marked, inside the ${fLo}-${fHi} sessions a week for ${level} ${GOALS[goal].label} work; the plan uses all ${n}.`;
      say = `You marked ${avail.length} days, which sits inside the ${fLo} to ${fHi} sessions a week ${an(level)} block runs, so all ${n} carry a session.`;
    }
    L.add({ kind: 'frequency', text, say, nums: [avail.length, fLo, fHi, n], src: f.src, tag: f.tag, view: 'calendar' });
  }

  /* 2 spacing */
  const chosen = chooseDays(avail, n);
  {
    const g = gaps(chosen);
    const minGap = Math.min(...g) - 1;
    const b2b = g.filter((x) => x === 1).length;
    const why = minGap >= 1 ? `at least ${minGap} rest day${minGap === 1 ? '' : 's'} between sessions` : `only ${b2b} back-to-back pair${b2b === 1 ? '' : 's'} of days`;
    const text = n < avail.length
      ? `Sessions on ${dayList(chosen)}: of your days, the spread with ${why}.`
      : `Sessions on ${dayList(chosen)}, every day you marked.`;
    const say = n < avail.length
      ? `It picks ${dayList(chosen)} because that spread leaves ${why}.`
      : `Sessions fall on ${dayList(chosen)}.`;
    L.add({ kind: 'spacing', text, say, nums: [minGap, b2b], tag: 'ILLUSTRATIVE', view: 'calendar' });
  }

  /* 3 split */
  const splitCodes = (SPLITS[fam][n] || SPLITS[fam][2]).slice(0, Math.max(1, n));
  const sessions = splitCodes.map((code, j) => {
    const { tpl, cardio } = parseCode(code);
    const T = tpl ? TEMPLATES[tpl] : null;
    const kind = T && cardio ? 'combo' : T ? 'res' : 'cardio';
    return { j, code, tpl, cardio, kind, T, name: [cardio ? CARDIO[cardio].name : null, T ? T.name : null].filter(Boolean).join(' + '), slots: [] };
  });
  {
    // try every order of the split; keep the one with the fewest muscles trained on back-to-back days
    const prim = (s) => new Set(s.T ? s.T.slots.flatMap(([, st]) => EX[st].p) : s.cardio ? ['aerobic'] : []);
    const consecutive = [];
    for (let i = 0; i < chosen.length; i++) {
      const a = chosen[i], b = chosen[(i + 1) % chosen.length];
      if ((b - a + 7) % 7 === 1 && chosen.length > 1) consecutive.push([i, (i + 1) % chosen.length]);
    }
    const cost = (order) => consecutive.reduce((acc, [i, j]) => {
      const A = prim(order[i]), B = prim(order[j]);
      return acc + [...A].filter((m) => m !== 'aerobic' && B.has(m)).length;
    }, 0);
    let best = sessions.slice(), bestCost = cost(best);
    if (bestCost > 0 && sessions.length <= 6) {
      const perm = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perm(arr.slice(0, i).concat(arr.slice(i + 1))).map((p) => [x, ...p])));
      for (const p of perm(sessions)) { const c = cost(p); if (c < bestCost) { best = p; bestCost = c; if (!c) break; } }
    }
    const reordered = best.some((s, i) => s !== sessions[i]);
    sessions.splice(0, sessions.length, ...best.map((s, j) => ({ ...s, j })));
    const forced = consecutive.map(([i, j]) => {
      const A = prim(sessions[i]), B = prim(sessions[j]);
      const shared = [...A].filter((m) => m !== 'aerobic' && B.has(m));
      return shared.length ? { a: chosen[i], b: chosen[j], shared } : null;
    }).filter(Boolean);
    if (forced.length) {
      const f = forced[0];
      L.add({ kind: 'conflict', text: `Forced conflict: ${DAY_NAMES[f.a]} and ${DAY_NAMES[f.b]} both train ${list(f.shared.map((m) => MUSCLE_LABEL[m]))}, because your days leave no order that separates them${forced.length > 1 ? ` (${forced.length} such pairs)` : ''}.`,
        say: `Your days force ${DAY_NAMES[f.a]} and ${DAY_NAMES[f.b]} to train ${list(f.shared.slice(0, 2).map((m) => MUSCLE_LABEL[m]))} on consecutive days, and the planner names the conflict.`,
        nums: [forced.length], tag: 'ILLUSTRATIVE', view: 'calendar' });
    } else if (consecutive.length) {
      L.add({ kind: 'conflict', text: `${consecutive.length} back-to-back pair${consecutive.length === 1 ? '' : 's'} of days; ${reordered ? 'the planner reordered the sessions so' : 'the session order already keeps it so'} no muscle group is trained on consecutive days.`,
        say: `On back-to-back days the sessions train different muscle groups${reordered ? ', after the planner reordered them' : ''}.`,
        nums: [consecutive.length], tag: 'ILLUSTRATIVE', view: 'calendar' });
    }
  }
  {
    const names = sessions.map((s) => s.name);
    const freqNote = fam === 'resist' && n >= 4 ? ' so each muscle group is trained twice a week' : fam === 'resist' && n <= 3 ? ' so every session trains the whole body' : '';
    L.add({ kind: 'split', text: `${n} sessions a week: ${names.join(' / ')}${freqNote}.`,
      say: `With ${n} sessions the week becomes ${list(names)}${freqNote}.`,
      nums: [n], tag: 'ILLUSTRATIVE', view: 'calendar' });
  }

  /* 4 periodization */
  const autoScheme = SCHEME_RULE[goal][level];
  const scheme = inp.scheme && inp.scheme !== 'auto' && SCHEME_LABEL[inp.scheme] ? inp.scheme : autoScheme;
  const weeks = weekShapes(scheme, W, goal);
  {
    const dayTypes = [...new Set(sessions.filter((s) => s.T).map((s) => s.T.day))].sort((a, b) => 'HML'.indexOf(a) - 'HML'.indexOf(b));
    const zones = goal === 'endurance' ? null
      : scheme === 'undulating' ? dayTypes.map((t) => REPS[goalKey].undulating?.[t]).filter(Boolean).join(' / ')
      : scheme === 'block' ? Object.values(REPS[goalKey].block || {}).join(' then ')
      : [...new Set(weeks.filter((x) => x.phase === 'build').map((x) => (REPS[goalKey].linear || [])[Math.min(x.meso ?? 0, 2)]))].filter(Boolean).join(' then ');
    const evidence = goal === 'hypertrophy' ? 'grgic2017' : goal === 'strength' ? 'harries2015' : SCHEME_SRC[scheme];
    const oneZone = zones && !zones.includes(' then ') && !zones.includes(' / ');
    const how = scheme === 'undulating' ? `rep zones rotate ${zones} across the week`
      : oneZone && scheme === 'linear' ? `reps stay at ${zones} while load and RPE rise through each 3-week build`
      : scheme === 'block' ? (zones ? `blocks move from volume to intensity, ${zones} reps` : 'blocks move from aerobic volume to intensity, then taper')
      : (zones ? `rep zones step ${zones} from one 3-week build to the next` : 'volume builds for 3 weeks, then eases for 1');
    const caveat = goal === 'hypertrophy' || goal === 'strength'
      ? ` Meta-analyses find linear and undulating models give similar ${goal === 'strength' ? 'strength' : 'muscle'} gains, so the choice is a convention.`
      : '';
    const chosenBy = scheme !== autoScheme ? ` You chose it; the rule for this goal and level gives ${SCHEME_LABEL[autoScheme]}.` : '';
    L.add({ kind: 'scheme', text: `${SCHEME_LABEL[scheme]} periodization for ${GOALS[goal].label} at ${level} level: ${how}.${caveat}${chosenBy}`,
      say: `The block uses ${SCHEME_LABEL[scheme]} periodization: ${how}.${caveat}`,
      nums: [3], src: evidence, tag: 'REAL', view: 'curves' });

    const deloads = weeks.filter((x) => x.phase === 'deload').map((x) => x.w + 1);
    const tapers = weeks.filter((x) => x.phase === 'taper').map((x) => x.w + 1);
    const parts = [];
    if (deloads.length) parts.push(`a deload in week${deloads.length > 1 ? 's' : ''} ${list(deloads.map(String))} with ${Math.round((1 - WEEK_SHAPE.deloadVol) * 100)}% less volume`);
    if (tapers.length) parts.push(`a 2-week taper in weeks ${list(tapers.map(String))} cutting volume ${Math.round((1 - WEEK_SHAPE.taperVol[0]) * 100)}% then ${Math.round((1 - WEEK_SHAPE.taperVol[1]) * 100)}% with intensity held`);
    L.add({ kind: 'shape', text: `${W} weeks: ${parts.length ? list(parts) : 'progressive builds without a deload'}.`,
      say: `Across the ${W} weeks there ${parts.length ? 'is ' + list(parts) : 'is no deload because the block is short'}.`,
      nums: [W, ...deloads, ...tapers, Math.round((1 - WEEK_SHAPE.deloadVol) * 100), Math.round((1 - WEEK_SHAPE.taperVol[0]) * 100), Math.round((1 - WEEK_SHAPE.taperVol[1]) * 100), 2],
      src: tapers.length ? 'bosquet2007' : null, tag: tapers.length ? 'REAL' : 'ILLUSTRATIVE', view: 'curves' });
  }

  /* 5 substitution: resolve every template slot through the graph */
  const walks = [];
  const dropped = [];
  const pins = inp.pins || {};
  const pinNotes = [];
  for (const s of sessions) {
    if (!s.T) continue;
    const used = new Set();
    s.T.slots.forEach(([pattern, start, role], k) => {
      const pin = pins[`${s.tpl}.${k}`];
      if (pin && EX[pin]) {
        const v = violations(EX[pin], kit, flags);
        if (EX[pin].pattern !== pattern) v.push({ type: 'pattern', text: `a ${PATTERNS[EX[pin].pattern]} lift in a ${PATTERNS[pattern]} slot` });
        if (!v.length && !used.has(pin)) {
          const wk = { start, chosen: pin, path: [start, pin], visited: [start, pin], rejected: {}, edges: [], frontier: [], far: {}, farEdges: [], pattern, pinned: true };
          used.add(pin);
          walks.push({ ...wk, session: s.j, role });
          s.slots.push({ pattern, role, ex: pin, start, walk: wk, sets: 0, k, pinned: true });
          pinNotes.push({ s, from: start, to: pin, ok: true });
          return;
        }
        pinNotes.push({ s, from: start, to: pin, ok: false, why: v.length ? v.map((r) => r.text).join(' and ') : 'already in this session' });
      }
      const wk = walkGraph(start, kit, flags, used);
      if (wk.chosen) used.add(wk.chosen);
      walks.push({ ...wk, session: s.j, role });
      if (!wk.chosen) { dropped.push({ s, pattern, start }); return; }
      s.slots.push({ pattern, role, ex: wk.chosen, start, walk: wk, sets: 0, k });
    });
  }
  if (pinNotes.length) {
    const ok = pinNotes.filter((p) => p.ok), bad = pinNotes.filter((p) => !p.ok);
    const t = [];
    if (ok.length) t.push(`your swap${ok.length === 1 ? '' : 's'} kept: ${list(ok.map((p) => `${lc(EX[p.from].name)} to ${lc(EX[p.to].name)} in ${p.s.T.name}`))}`);
    if (bad.length) t.push(`reverted: ${list(bad.map((p) => `${lc(EX[p.to].name)} (${p.why})`))}`);
    L.add({ kind: 'pin', text: `Edits: ${t.join('; ')}. The solver re-allocated every set after them.`,
      say: ok.length ? `You swapped ${lc(EX[ok[0].from].name)} for ${lc(EX[ok[0].to].name)}, and the solver re-placed every set around that choice.` : `A swap you made no longer passes your flags, so the planner reverted it.`,
      nums: [ok.length, bad.length], tag: 'ILLUSTRATIVE', view: 'session' });
  }
  /* cardio modality: run unless a flag forbids impact */
  const cardioWalk = sessions.some((s) => s.cardio) ? walkGraph(goal === 'general' ? 'walk' : 'run', new Set(), flags) : null;
  {
    // one entry per distinct start -> chosen swap with an injury reason, then one for equipment-only swaps
    const seen = new Set();
    const injurySwaps = [], equipSwaps = [];
    for (const wk of walks) {
      if (!wk.chosen || wk.chosen === wk.start) continue;
      const key = wk.start + '>' + wk.chosen;
      if (seen.has(key)) continue;
      seen.add(key);
      const inj = (wk.rejected[wk.start] || []).find((r) => INJURIES[r.type]);
      (inj ? injurySwaps : equipSwaps).push({ wk, inj });
    }
    // one entry per injury flag, listing every lift it moved
    const byFlag = {};
    for (const sw of injurySwaps) (byFlag[sw.inj.type] ||= []).push(sw);
    for (const [flag, sws] of Object.entries(byFlag)) {
      const I = INJURIES[flag];
      const pairs = sws.map(({ wk }) => `${lc(EX[wk.start].name)} to ${lc(EX[wk.chosen].name)}`);
      const why = sws[0].wk.rejected[sws[0].wk.start]?.find((r) => r.type === flag)?.text || sws[0].inj.text;
      const knee = flag === 'knee' && sws.some(({ wk }) => EX[wk.chosen].knee === 'partial');
      const n = sws.length;
      L.add({ kind: 'swap', text: `${I.label} flag: ${n} lift${n === 1 ? '' : 's'} with ${why} ${n === 1 ? 'moves' : 'move'} along the substitution graph: ${list(pairs)}.` +
          (knee ? ' Knee joint forces in the squat rise with knee flexion and peak near full flexion, so loaded flexion stays above parallel.' : ''),
        say: `Because of the ${I.label} flag, ${n === 1 ? 'one lift' : n + ' lifts'} with ${why} change, ${pairs[0]}${n > 1 ? ' among them' : ''}.` +
          (knee ? ' Knee forces in a squat rise as the knee bends and peak near full depth, so loaded knee flexion stays above parallel.' : ''),
        nums: [n], src: I.src, tag: knee ? 'REAL' : 'ILLUSTRATIVE', view: 'graph', walk: sws[0].wk });
    }
    if (cardioWalk && cardioWalk.chosen !== cardioWalk.start) {
      const why = cardioWalk.rejected[cardioWalk.start]?.map((r) => r.text).join(' and ');
      L.add({ kind: 'swap', text: `Aerobic sessions use ${lc(EX[cardioWalk.chosen].name)} in place of ${lc(EX[cardioWalk.start].name)} (${why}).`,
        say: `Aerobic work moves from ${lc(EX[cardioWalk.start].name)} to ${lc(EX[cardioWalk.chosen].name)} to avoid ${why}.`,
        nums: [], tag: 'ILLUSTRATIVE', view: 'graph', walk: cardioWalk });
    }
    if (equipSwaps.length) {
      const pairs = equipSwaps.slice(0, 3).map(({ wk }) => `${lc(EX[wk.start].name)} to ${lc(EX[wk.chosen].name)}`);
      L.add({ kind: 'swap', text: `With ${EQUIPMENT[inp.equipment].label}, ${equipSwaps.length} lift${equipSwaps.length === 1 ? '' : 's'} change: ${list(pairs)}${equipSwaps.length > 3 ? ' and more' : ''}.`,
        say: `Your ${EQUIPMENT[inp.equipment].label} setting changes ${equipSwaps.length} lift${equipSwaps.length === 1 ? '' : 's'}, for example ${pairs[0]}.`,
        nums: [equipSwaps.length], tag: 'ILLUSTRATIVE', view: 'graph', walk: equipSwaps[0].wk });
    }
    if (dropped.length) {
      const pats = [...new Set(dropped.map((d) => PATTERNS[d.pattern] || d.pattern))];
      // the smallest set of your constraints that leaves no exercise of the pattern
      const cons = ['equipment', ...flags];
      const fails = (x, set) => set.some((c) => (c === 'equipment' ? x.equip.some((k) => !kit.has(k)) : INJURIES[c].test(x)));
      const smallest = (pattern) => {
        const pool = Object.values(EX).filter((x) => x.pattern === pattern && !x.open);
        for (let size = 1; size <= cons.length; size++) {
          const pick = (start, acc) => {
            if (acc.length === size) return pool.every((x) => fails(x, acc)) ? acc.slice() : null;
            for (let i = start; i < cons.length; i++) { acc.push(cons[i]); const r = pick(i + 1, acc); acc.pop(); if (r) return r; }
            return null;
          };
          const r = pick(0, []);
          if (r) return r;
        }
        return null;
      };
      const name = (c) => (c === 'equipment' ? `${EQUIPMENT[inp.equipment].label} kit` : `${INJURIES[c].label} flag`);
      const sets = [...new Set(dropped.map((d) => d.pattern))].map((p) => { const s = smallest(p); return s ? `${PATTERNS[p]}: ${s.map(name).join(' + ')}` : null; }).filter(Boolean);
      L.add({ kind: 'drop', text: `No node in the graph passes your constraints for ${list(pats)}; ${dropped.length} slot${dropped.length === 1 ? '' : 's'} left empty.` + (sets.length ? ` Smallest conflicting set: ${sets.join('; ')}.` : ''),
        say: `For ${list(pats)} nothing in the graph passes your flags, so ${dropped.length === 1 ? 'that slot is' : 'those slots are'} left empty.`,
        nums: [dropped.length], tag: 'ILLUSTRATIVE', view: 'graph' });
    }
  }

  /* 6 time budget + 7 allocation, on the reference week */
  const range = VOLUME[goalKey][level];
  const targetList = TARGETED_BY_FAMILY[fam] || TARGETED;
  const targets = Object.fromEntries(targetList.map((m) => [m, range]));
  const vol = Object.fromEntries(MUSCLES.map((m) => [m.id, 0]));
  const addVol = (ex, k) => { for (const m of ex.p) vol[m] += k; for (const m of ex.s) vol[m] += k * SECONDARY_WEIGHT; };
  const cutSlots = [];
  // phase 1: main and second slots at their base sets, in priority order, while the minutes last
  for (const s of sessions) {
    s.budget = s.kind === 'combo' ? Math.round(M * STR_IN_COMBO_FRAC) : s.kind === 'res' ? M : 0;
    s.used = s.kind === 'res' ? TIME.warmup : 0;
    for (const sl of s.slots) sl.on = false;
  }
  // every session's main lifts first, then the second lifts, so a band cap never squeezes out a main lift
  for (const role of ['main', 'second']) for (const s of sessions) {
    if (!s.T) continue;
    for (const sl of s.slots) {
      if (sl.role !== role) continue;
      // base sets, reduced while they would push a targeted primary muscle over the top of its band
      let base = TIME.sets[sl.role][0];
      const over = (k) => EX[sl.ex].p.some((m) => targets[m] && vol[m] + k > targets[m][1] + 1e-9)
        || EX[sl.ex].s.some((m) => targets[m] && vol[m] + k * SECONDARY_WEIGHT > targets[m][1] + 1e-9);
      while (base > 1 && over(base)) base--;
      if (over(base) && sl.role !== 'main') continue;
      const c = slotCost(goalKey, sl.role, base);
      if (s.used + c <= s.budget + 1e-9) { sl.sets = base; sl.on = true; s.used += c; addVol(EX[sl.ex], base); }
    }
  }
  // phase 2: greedy fill by deficit gained per minute. A move either adds one set to an
  // open slot or opens an accessory slot at its base sets. The gain counts each targeted
  // primary muscle's remaining distance to the middle of its range (half for secondaries),
  // weighted by MUSCLE_WEIGHT; nothing may push a targeted primary past the top of its range.
  const mid = (range[0] + range[1]) / 2;
  const gainOf = (ex, k) => {
    let g = 0;
    for (const m of ex.s) if (targets[m] && vol[m] + k * SECONDARY_WEIGHT > targets[m][1] + 1e-9) return -1;
    for (const m of ex.p) if (targets[m]) {
      if (vol[m] + k > targets[m][1] + 1e-9) return -1;
      g += (MUSCLE_WEIGHT[m] ?? 1) * Math.min(k, Math.max(0, mid - vol[m])) / mid;
    }
    for (const m of ex.s) if (targets[m]) g += 0.5 * (MUSCLE_WEIGHT[m] ?? 1) * Math.min(k * SECONDARY_WEIGHT, Math.max(0, mid - vol[m])) / mid;
    return g;
  };
  for (let iter = 0; iter < 600; iter++) {
    let best = null, bestRate = 0;
    for (const s of sessions) for (const sl of s.slots) {
      const ex = EX[sl.ex];
      let k, c;
      if (sl.on) { if (sl.sets >= TIME.sets[sl.role][1]) continue; k = 1; c = setCost(goalKey, sl.role); }
      else { k = TIME.sets[sl.role][0]; c = slotCost(goalKey, sl.role, k); }
      if (s.used + c > s.budget + 1e-9) continue;
      const g = gainOf(ex, k);
      if (g <= 0) continue;
      const rate = g / c + (sl.role === 'main' ? 0.002 : 0);
      if (rate > bestRate) { bestRate = rate; best = { s, sl, k, c }; }
    }
    if (!best) break;
    if (!best.sl.on) best.sl.on = true;
    best.sl.sets += best.k;
    best.s.used += best.c;
    addVol(EX[best.sl.ex], best.k);
  }
  for (const s of sessions) {
    for (const sl of s.slots) if (!sl.on) cutSlots.push({ s, sl });
    s.slots = s.slots.filter((sl) => sl.on);
  }
  const totalSets = sessions.reduce((a, s) => a + s.slots.reduce((b, sl) => b + sl.sets, 0), 0);
  {
    const rest = TIME.rest[goalKey];
    const perSet = setCost(goalKey, 'main');
    const capSets = Math.floor((M - TIME.warmup) / perSet);
    const mins = (x) => `${x} minute${x === 1 ? '' : 's'}`;
    L.add({ kind: 'time', text: `${M} minutes, less a ${TIME.warmup}-minute warm-up, holds about ${capSets} main-lift sets at ${mins(rest[0])} rest each, more when accessories rest ${mins(rest[1])}.`,
      say: `Each ${M}-minute session holds about ${capSets} heavy sets after a ${TIME.warmup}-minute warm-up, because main lifts rest ${rest[0]} minutes between sets.`,
      nums: [M, TIME.warmup, capSets, rest[0], rest[1]], src: 'acsm2009', tag: 'REAL', view: 'session' });
    if (cutSlots.length) {
      const noTime = [], inRange = [];
      for (const c of cutSlots) {
        const open = slotCost(goalKey, c.sl.role, TIME.sets[c.sl.role][0]);
        (c.s.used + open > c.s.budget + 1e-9 ? noTime : inRange).push(lc(EX[c.sl.ex].name));
      }
      const u = (a) => [...new Set(a)];
      const parts = [];
      if (noTime.length) parts.push(`${list(u(noTime).slice(0, 3))} (no minutes left)`);
      if (inRange.length) parts.push(`${list(u(inRange).slice(0, 3))} (their muscles already in range)`);
      L.add({ kind: 'cut', text: `The solver leaves ${cutSlots.length} template slot${cutSlots.length === 1 ? '' : 's'} closed: ${parts.join('; ')}.`,
        say: noTime.length ? `The minutes run out before ${list(u(noTime).slice(0, 2))}, so ${noTime.length === 1 ? 'it stays' : 'they stay'} out of the plan.`
          : `It leaves ${list(u(inRange).slice(0, 2))} out because those muscles already have enough sets.`,
        nums: [cutSlots.length], tag: 'ILLUSTRATIVE', view: 'session' });
    }
    if (totalSets > 0) {
      const under = targetList.filter((m) => vol[m] + 1e-9 < range[0]);
      const inRange = targetList.filter((m) => vol[m] + 1e-9 >= range[0] && vol[m] <= range[1] + 1e-9);
      const fmt = (m) => `${MUSCLE_LABEL[m]} ${r1(vol[m])}`;
      // why each short muscle is short
      const allSlots = sessions.flatMap((s) => (s.T ? s.T.slots.map(([, st]) => EX[st]) : []));
      const why = { split: [], cap: [], time: [] };
      for (const m of under) {
        const open = sessions.flatMap((s) => s.slots.filter((sl) => EX[sl.ex].p.includes(m)));
        if (!open.length && !allSlots.some((x) => x.p.includes(m))) why.split.push(m);
        else if (open.length && open.every((sl) => sl.sets >= TIME.sets[sl.role][1])) why.cap.push(m);
        else why.time.push(m);
      }
      const reasons = [];
      if (why.time.length) reasons.push(`${list(why.time.map(fmt))}, because the minutes run out first`);
      if (why.cap.length) reasons.push(`${list(why.cap.map(fmt))}, at the set cap per exercise`);
      if (why.split.length) reasons.push(`${list(why.split.map(fmt))}, which nothing in the split trains directly`);
      const sayShort = why.time.length ? `${list(why.time.slice(0, 3).map((m) => MUSCLE_LABEL[m]))} fall short because the minutes run out first`
        : why.cap.length ? `${list(why.cap.slice(0, 3).map((m) => MUSCLE_LABEL[m]))} stop at the set cap per exercise`
        : `${list(why.split.slice(0, 3).map((m) => MUSCLE_LABEL[m]))} get no direct work in this split`;
      L.add({ kind: 'volume', text: `Target ${range[0]}-${range[1]} sets per muscle per week. The solver places ${totalSets} working sets: ${inRange.length} of ${targetList.length} targeted muscles land in range` +
          (under.length ? `; under target: ${reasons.join('; ')}.` : '.'),
        say: `The weekly target is ${range[0]} to ${range[1]} sets per muscle, and ${inRange.length} of ${targetList.length} muscle groups land inside it` +
          (under.length ? `, while ${sayShort}.` : '.'),
        nums: [range[0], range[1], totalSets, inRange.length, targetList.length, ...under.map((m) => r1(vol[m]))],
        src: VOLUME[goalKey].src, tag: 'REAL', view: 'body' });
      // soft constraints: push-to-pull balance and the solver's objective
      const PUSH = ['hpush', 'vpush'], PULL = ['hpull', 'vpull'];
      const setsOf = (pats) => sessions.reduce((a, s) => a + s.slots.filter((sl) => pats.includes(sl.pattern)).reduce((b, sl) => b + sl.sets, 0), 0);
      const push = setsOf(PUSH), pull = setsOf(PULL);
      const objective = targetList.reduce((a, m) => a + (MUSCLE_WEIGHT[m] ?? 1) * Math.max(0, range[0] - vol[m]) / range[0], 0);
      if (push + pull > 0) {
        const ratio = pull ? push / pull : Infinity;
        const inBand = ratio >= 0.8 && ratio <= 1.2;
        L.add({ kind: 'balance', text: `Soft constraints: push to pull sets ${push}:${pull} (ratio ${Number.isFinite(ratio) ? ratio.toFixed(2) : 'no pulling'}, ${inBand ? 'inside' : 'outside'} 0.8-1.2); weighted shortfall below the set band ${objective.toFixed(2)}${under.length ? `, relaxed for ${list(under.map((m) => MUSCLE_LABEL[m]))}` : ', nothing relaxed'}.`,
          say: `Pushing and pulling get ${push} and ${pull} sets a week, ${inBand ? 'a balanced ratio' : 'outside the 0.8 to 1.2 balance the planner aims for'}.`,
          nums: [push, pull, 0.8, 1.2, Number(objective.toFixed(2)), ...(Number.isFinite(ratio) ? [Number(ratio.toFixed(2))] : [])], tag: 'ILLUSTRATIVE', view: 'body' });
      }
    }
  }

  /* expand the reference week into the block */
  const ctx = { inp, goal, goalKey, fam, scheme, M, sessions, chosen, cardioEx: cardioWalk?.chosen || 'run' };
  const days = [];
  for (let w = 0; w < W; w++) days.push(...expandWeek(ctx, weeks[w], w));

  /* endurance distribution / WHO minutes */
  if (fam === 'endure') {
    const ref = days.slice(7, 14).filter((d) => d.s);
    const high = ref.filter((d) => d.s.cardio && CARDIO[d.s.cardio.type].high).length;
    const pct = Math.round(100 * (ref.length - high) / Math.max(1, ref.length));
    L.add({ kind: 'distribution', text: `${ref.length - high} of ${ref.length} weekly sessions are low intensity (${pct}%); well-trained endurance athletes converge on about 80%.`,
      say: `${ref.length - high} of the ${ref.length} weekly sessions stay easy, ${pct}% of them, close to the distribution well-trained endurance athletes settle on.`,
      nums: [ref.length - high, ref.length, pct, 80], src: 'seiler2010', tag: 'REAL', view: 'calendar' });
  }
  if (fam === 'general') {
    const ref = days.slice(0, 7).filter((d) => d.s);
    const mod = ref.reduce((a, d) => a + (d.s.cardio ? d.s.cardio.minutes * (CARDIO[d.s.cardio.type].high ? 2 : 1) : 0), 0);
    const [lo, hi] = WHO_AEROBIC_MIN;
    L.add({ kind: 'who', text: `The week holds ${mod} minutes of moderate aerobic work against the ${lo}-${hi} minutes WHO 2020 recommends` + (mod < lo ? `; the ${lo - mod}-minute gap can come from walking on other days.` : '.'),
      say: mod < lo ? `The plan holds ${mod} minutes of aerobic work a week, ${lo - mod} short of the ${lo} the WHO recommends, and walking on other days counts toward the gap.`
        : `The plan holds ${mod} minutes of aerobic work a week, inside the ${lo} to ${hi} the WHO recommends.`,
      nums: [mod, lo, hi, Math.max(0, lo - mod)], src: 'who2020', tag: 'REAL', view: 'calendar' });
  }

  /* 8 load model */
  const loads = days.map((d) => (d.s ? d.s.load : 0));
  const model = runModel(loads, loads, { mode: inp.mode, level, weeks: W, band: true });
  {
    const p = LOAD_MODEL;
    L.add({ kind: 'load', text: `Session load = session RPE x minutes (AU). Curves: fitness-fatigue model with population defaults k1 = ${p.k1}, k2 = ${p.k2}, tau1 = ${p.tau1} d, tau2 = ${p.tau2} d; fits in elite swimmers gave ${p.hellard.tauA[0]} d (95% CI ${p.hellard.tauA[1]}-${p.hellard.tauA[2]}) and ${p.hellard.tauF[0]} d (${p.hellard.tauF[1]}-${p.hellard.tauF[2]}).`,
      say: `Every session's load is its session RPE times its minutes, and the curves run the fitness-fatigue model on population defaults (${p.tau1}-day fitness and ${p.tau2}-day fatigue time constants) that are not fitted to you.`,
      nums: [p.k1, p.k2, p.tau1, p.tau2, ...p.hellard.tauA, ...p.hellard.tauF, 95], src: 'foster2001', tag: 'REAL', view: 'curves' });
    if (inp.mode === 'pmc') {
      L.add({ kind: 'busso', text: `Chart mode: the exponentially weighted chart (CTL ${p.pmc.ctl} d, ATL ${p.pmc.atl} d, form = CTL - ATL), the Banister model with k1 = 1/${p.pmc.ctl} and k2 = 1/${p.pmc.atl}. It is a practice convention with fixed constants and no fit to anyone.`,
        say: `The curves now use the ${p.pmc.ctl}-day and ${p.pmc.atl}-day exponentially weighted chart, which is the same impulse-response idea with fixed time constants.`,
        nums: [p.pmc.ctl, p.pmc.atl, 1], tag: 'ILLUSTRATIVE', view: 'curves' });
    }
    if (inp.mode === 'busso') {
      L.add({ kind: 'busso', text: `Variable dose on: the fatigue gain k2 rises with the last few days of load (tau3 = ${p.tau3} d), so a session stacked on hard days costs more fatigue.`,
        say: `With variable dose on, a session stacked on hard days costs more fatigue than the same session after rest.`,
        nums: [p.tau3], src: 'busso2003', tag: 'REAL', view: 'curves' });
    }
    const form = model.plan.form;
    let peak = 0;
    for (let i = 1; i < form.length; i++) if (form[i] > form[peak]) peak = i;
    const lowWk = model.plan.form.indexOf(Math.min(...form));
    L.add({ kind: 'peak', text: `Model form is lowest in week ${Math.floor(lowWk / 7) + 1} and peaks on ${DAY_NAMES[peak % 7]} of week ${Math.floor(peak / 7) + 1}.`,
      say: `On these defaults your form is lowest in week ${Math.floor(lowWk / 7) + 1} and highest in week ${Math.floor(peak / 7) + 1}, which is where the ${weeks.some((x) => x.phase === 'taper') ? 'taper' : 'deload'} pays off.`,
      nums: [Math.floor(lowWk / 7) + 1, Math.floor(peak / 7) + 1], tag: 'REAL', view: 'curves', day: peak });
  }

  const weekVol = weeklyVolume(days, W);
  return {
    inp, fam, goalKey, scheme, n, avail, chosen, weeks, sessions, walks, cardioWalk, targets, range,
    days, loads, model, weekVol, refVol: vol, log: L.items, ctx, kit: [...kit], flags,
    summary: summarize(inp, n, scheme),
  };
}

function summarize(inp, n, scheme) {
  const flags = (inp.injuries || []).map((f) => INJURIES[f]?.label).filter(Boolean);
  return `${GOALS[inp.goal].label}, ${inp.level}, ${n} sessions a week of up to ${inp.minutes} min, ${EQUIPMENT[inp.equipment].label}` +
    (flags.length ? `, ${flags.join(' and ')} flag${flags.length > 1 ? 's' : ''}` : '') + `, ${inp.weeks} weeks, ${SCHEME_LABEL[scheme]} periodization`;
}

/* ---------- one week of sessions from the reference week ---------- */
export function expandWeek(ctx, week, w) {
  const { goal, goalKey, scheme, M, sessions, chosen, cardioEx } = ctx;
  const out = [];
  for (let dow = 0; dow < 7; dow++) {
    const d = w * 7 + dow;
    const j = chosen.indexOf(dow);
    if (j < 0) { out.push({ d, w, dow, s: null }); continue; }
    const S = sessions[j];
    const inst = { j, name: S.name, kind: S.kind, items: [], cardio: null, phase: week.phase, label: week.label };
    let resMin = 0, resRpe = 0;
    if (S.T) {
      const rpe = clamp(half(BASE_RPE[goalKey] + week.rpeAdd), 4, 9.5);
      resMin = S.kind === 'res' ? TIME.warmup : 0;
      for (const sl of S.slots) {
        const sets = Math.max(1, Math.round(sl.sets * week.vol));
        resMin += slotCost(goalKey, sl.role, sets);
        const ex = EX[sl.ex];
        inst.items.push({
          ex: sl.ex, name: ex.name, pattern: sl.pattern, role: sl.role, sets, k: sl.k, pinned: !!sl.pinned, tpl: S.tpl,
          reps: repsFor(goalKey, scheme, week, S.T.day, sl.role),
          rpe: sl.role === 'acc' ? Math.min(9.5, rpe + 0.5) : rpe,
          rest: restFor(goalKey, sl.role),
          swap: sl.ex !== sl.start ? { from: sl.start, walk: sl.walk } : null,
        });
      }
      // a build week's extra sets may not push past the visitor's minutes: trim accessories, then seconds, then mains
      const cap = S.kind === 'combo' ? Math.round(M * STR_IN_COMBO_FRAC) : M;
      for (const role of ['acc', 'second', 'main']) {
        for (let i = inst.items.length - 1; i >= 0 && resMin > cap + 1e-9; i--) {
          const it = inst.items[i];
          while (it.role === role && it.sets > 1 && resMin > cap + 1e-9) { it.sets--; resMin -= setCost(goalKey, role); }
        }
      }
      resRpe = clamp(rpe + SESSION_RPE_OFFSET, 2, 10);
    }
    let cMin = 0, cRpe = 0;
    if (S.cardio) {
      let type = S.cardio;
      // aerobic intensity by phase: early volume blocks swap intervals for tempo
      if (type === 'INT' && ((scheme === 'block' && week.block === 'accumulation') || (scheme === 'linear' && (week.meso ?? 0) === 0))) type = 'TEMPO';
      const C = CARDIO[type];
      const budget = S.kind === 'combo' ? M - Math.round(M * STR_IN_COMBO_FRAC) : M;
      const volMul = week.phase === 'deload' || week.phase === 'taper' ? week.vol : Math.min(1, week.vol);
      cMin = Math.max(15, Math.round(budget * (S.kind === 'combo' ? 1 : C.frac) * volMul));
      if (S.kind === 'cardio' && type === 'LONG') cMin = Math.max(cMin, Math.round(M * volMul));
      cMin = Math.min(cMin, budget);
      cRpe = week.phase === 'deload' ? Math.max(2, C.rpe - 1) : C.rpe;
      const reps = type === 'INT' ? clamp(Math.floor((cMin - 20) / 7), 2, 6) : 0;
      inst.cardio = { type, name: C.name, minutes: cMin, rpe: cRpe, modality: EX[cardioEx].name, note: type === 'INT' ? `${reps} x (${C.note})` : C.note, reps };
      inst.name = [C.name, S.T ? S.T.name : null].filter(Boolean).join(' + ');
    }
    const minutes = Math.round(resMin + cMin);
    const srpe = minutes > 0 ? half((resRpe * resMin + cRpe * cMin) / minutes) : 0;
    inst.minutes = minutes;
    inst.srpe = srpe;
    inst.load = sessionLoad(srpe, minutes);
    inst.muscles = [...new Set(inst.items.flatMap((it) => EX[it.ex].p))];
    out.push({ d, w, dow, s: inst });
  }
  return out;
}

/* weekly sets per muscle, per week */
export function weeklyVolume(days, W) {
  const out = [];
  for (let w = 0; w < W; w++) {
    const v = Object.fromEntries(MUSCLES.map((m) => [m.id, 0]));
    for (const d of days.slice(w * 7, w * 7 + 7)) {
      if (!d.s || d.s.missed) continue;
      for (const it of d.s.items) {
        const ex = EX[it.ex];
        for (const m of ex.p) v[m] += it.sets;
        for (const m of ex.s) v[m] += it.sets * SECONDARY_WEIGHT;
      }
    }
    out.push(v);
  }
  return out;
}

/* ======================================================================
   replan: the week you actually had
   R1 missed session: its first main lift moves into the next session of
      the same week, replacing that session's last accessory, unless the
      lift appears again that week. Missed work is not crammed in.
   R2 two or more misses in one week: the next week repeats that week's
      step instead of progressing, and the build week before the next
      deload or taper is dropped so the block keeps its length.
   R3 hard session (logged RPE >= plan + 1.5): the load model is re-run
      with the logged load; each of the next sessions (up to 2) that you
      would start with form further below plan than the tolerance loses
      one set per exercise and one RPE point.
   R4 easy or as-planned: logged, no change.
   ====================================================================== */
const recompute = (ctx, s) => {
  const { goalKey } = ctx;
  let resMin = s.kind === 'res' ? TIME.warmup : 0;
  for (const it of s.items) resMin += slotCost(goalKey, it.role, it.sets);
  if (!s.items.length) resMin = 0;
  const cMin = s.cardio ? s.cardio.minutes : 0;
  const resRpe = s.items.length ? clamp(Math.max(...s.items.filter((i) => i.role !== 'acc').map((i) => i.rpe), s.items[0].rpe) + SESSION_RPE_OFFSET, 2, 10) : 0;
  const cRpe = s.cardio ? s.cardio.rpe : 0;
  s.minutes = Math.round(resMin + cMin);
  s.srpe = s.minutes ? half((resRpe * resMin + cRpe * cMin) / s.minutes) : 0;
  s.load = sessionLoad(s.srpe, s.minutes);
};

export function replan(plan, log) {
  const { ctx, inp } = plan;
  const R = new DecisionLog('R');
  const W = inp.weeks;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let days = clone(plan.days);
  const entries = Object.entries(log || {})
    .map(([d, v]) => [Number(d), v])
    .filter(([d, v]) => days[d] && days[d].s && v && ['missed', 'hard', 'easy', 'done'].includes(v.kind))
    .sort((a, b) => a[0] - b[0]);
  const lastLogged = entries.length ? entries[entries.length - 1][0] : -1;
  const changed = new Set();
  const plannedOf = (d) => plan.days[d].s;

  /* R2 first: it reshapes whole weeks */
  let weeks = plan.weeks.map((x) => ({ ...x }));
  for (let w = 0; w < W - 1; w++) {
    const misses = entries.filter(([d, v]) => v.kind === 'missed' && Math.floor(d / 7) === w).length;
    if (misses < REPLAN.repeatWeekMisses) continue;
    const nextIsBuild = weeks[w + 1] && ['build', 'accumulation', 'transmutation'].includes(weeks[w + 1].phase);
    if (!nextIsBuild) continue;
    const repeat = { ...weeks[w], w: w + 1, repeated: true, label: weeks[w].label + ' again' };
    const seq = weeks.slice(0, w + 1).concat([repeat], weeks.slice(w + 1));
    // drop the last build week before the next deload or taper after the repeat
    let dropAt = -1;
    for (let i = w + 2; i < seq.length; i++) {
      if (!['build', 'accumulation', 'transmutation'].includes(seq[i].phase)) break;
      dropAt = i;
    }
    if (dropAt < 0) dropAt = w + 2 < seq.length ? w + 2 : seq.length - 1;
    const droppedLabel = seq[dropAt].label;
    seq.splice(dropAt, 1);
    weeks = seq.slice(0, W).map((x, i) => ({ ...x, w: i }));
    for (let i = w + 1; i < W; i++) {
      const fresh = expandWeek(ctx, weeks[i], i);
      for (const day of fresh) { if (day.d > lastLogged || !log[day.d]) { days[day.d] = day; if (day.s) changed.add(day.d); } }
    }
    R.add({ kind: 'repeat', text: `${misses} sessions missed in week ${w + 1}: week ${w + 2} repeats that step (${weeks[w + 1].label}) instead of progressing, and ${droppedLabel} is dropped so the block keeps ${W} weeks.`,
      say: `Week ${w + 1} lost ${misses} sessions, so week ${w + 2} repeats it before progressing and the block still ends on schedule.`,
      nums: [misses, w + 1, w + 2, W], tag: 'ILLUSTRATIVE', view: 'calendar', day: (w + 1) * 7 });
  }

  /* per-entry rules in day order */
  const actualLoad = {};
  const autoreg = [];
  const livedLoads = () => days.map((d, i) => {
    if (!d.s) return 0;
    if (actualLoad[i] != null) return actualLoad[i];
    return d.s.load;
  });

  for (const [d, e] of entries) {
    const day = days[d];
    const s = day.s;
    const planned = plannedOf(d) || s;
    const wd = `${DAY_NAMES[day.dow]} of week ${day.w + 1}`;
    if (e.kind === 'missed') {
      actualLoad[d] = 0;
      s.missed = true;
      const main = s.items.find((it) => it.role === 'main');
      const later = days.slice(d + 1, day.w * 7 + 7).filter((x) => x.s && !log[x.d]);
      if (!main) {
        R.add({ kind: 'missed', text: `${wd} missed (${s.name}). Aerobic work is not made up; the plan continues.`,
          say: `You missed ${wd}, and the plan does not try to make the aerobic work up.`, nums: [day.w + 1], tag: 'ILLUSTRATIVE', view: 'calendar', day: d });
        continue;
      }
      const again = later.some((x) => x.s.items.some((it) => it.ex === main.ex));
      // only into a session whose focus already includes the lift's movement pattern
      const target = later.find((x) => x.s.items.some((it) => it.pattern === main.pattern));
      const acc = target ? [...target.s.items].reverse().find((it) => it.role === 'acc') : null;
      if (again || !target || !acc) {
        const why = again ? `${lc(main.name)} appears again later that week`
          : !later.length ? 'no session is left that week'
          : `no later session that week trains the ${PATTERNS[main.pattern]} pattern, and a lift is never moved outside a session's focus`;
        R.add({ kind: 'missed', text: `${wd} missed (${s.name}). Nothing is carried: ${why}. Missed volume is not crammed into the next week.`,
          say: `You missed ${wd}; nothing is carried over because ${why}.`, nums: [day.w + 1], tag: 'ILLUSTRATIVE', view: 'calendar', day: d });
        continue;
      }
      const before = JSON.parse(JSON.stringify(target.s));
      const i = target.s.items.indexOf(acc);
      const carried = { ...main, sets: Math.max(2, main.sets - 1), carried: true, swap: null };
      target.s.items.splice(i, 1, carried);
      recompute(ctx, target.s);
      // keep inside the visitor's minutes: drop further accessories first, then carried sets down to 2
      const removed = [acc.name];
      while (target.s.minutes > inp.minutes) {
        const extra = [...target.s.items].reverse().find((it) => it.role === 'acc' && !it.carried);
        if (extra) { target.s.items.splice(target.s.items.indexOf(extra), 1); removed.push(extra.name); }
        else if (carried.sets > 2) carried.sets--;
        else break;
        recompute(ctx, target.s);
      }
      if (target.s.minutes > inp.minutes) {
        target.s = before;
        days[target.d].s = before;
        R.add({ kind: 'missed', text: `${wd} missed (${s.name}). ${DAY_NAMES[target.dow]} has no room inside ${inp.minutes} minutes for ${lc(main.name)}, so nothing is carried.`,
          say: `You missed ${wd}; the next session has no room inside your ${inp.minutes} minutes, so nothing is carried over.`, nums: [day.w + 1, inp.minutes], tag: 'ILLUSTRATIVE', view: 'calendar', day: d });
        continue;
      }
      changed.add(target.d);
      const rm = list(removed.map(lc));
      R.add({ kind: 'missed', text: `${wd} missed (${s.name}). Its main lift, ${lc(main.name)}, moves to ${DAY_NAMES[target.dow]} for ${carried.sets} sets in place of ${rm}; the rest is not made up.`,
        say: `You missed ${wd}, so its main lift, ${lc(main.name)}, moves to ${DAY_NAMES[target.dow]} in place of ${rm}, and the rest of that session is let go.`,
        nums: [day.w + 1, carried.sets], tag: 'ILLUSTRATIVE', view: 'session', day: target.d });
      continue;
    }
    const rpe = clamp(Number(e.rpe) || (e.kind === 'hard' ? planned.srpe + 2 : e.kind === 'easy' ? planned.srpe - 2 : planned.srpe), 1, 10);
    const mins = clamp(Number(e.min) || s.minutes, 5, 240);
    actualLoad[d] = sessionLoad(rpe, mins);
    s.logged = { rpe, min: mins, load: actualLoad[d] };
    const minTxt = mins !== s.minutes ? ` over ${mins} min instead of ${s.minutes}` : '';
    if (rpe < planned.srpe + REPLAN.hardRpeDelta) {
      const easy = rpe <= planned.srpe - REPLAN.hardRpeDelta;
      R.add({ kind: easy ? 'easy' : 'done', text: `${wd} logged at RPE ${rpe} against a planned ${planned.srpe}${minTxt} (${actualLoad[d]} AU against ${planned.load}). ${easy ? 'Next week this session adds load (see below).' : 'No change; progression continues.'}`,
        say: `${wd} came in at RPE ${rpe} against a planned ${planned.srpe}${easy ? ', so next week that session adds load' : ', which needs no change'}.`, nums: [day.w + 1, rpe, planned.srpe, actualLoad[d], planned.load, mins, s.minutes], tag: 'REAL', view: 'curves', day: d });
      autoreg.push({ d, kind: easy ? 'easy' : 'done' });
      continue;
    }
    autoreg.push({ d, kind: 'hard' });
    // R3: run the load model with the logged load and check the next sessions
    const sessLoads = plan.loads.filter((x) => x > 0);
    const tol = REPLAN.tolSessionFrac * sessLoads.reduce((a, b) => a + b, 0) / Math.max(1, sessLoads.length);
    const baseForm = plan.model.plan.form;
    const upcoming = days.slice(d + 1, d + 8).filter((x) => x.s && !log[x.d]);
    const notes = [];
    let adjusted = 0;
    for (const nx of upcoming) {
      if (adjusted >= REPLAN.maxAdjusted) break;
      if (nx.s.eased) continue;   // a session is eased once at most
      const sim = runModel(plan.loads, livedLoads(), { mode: inp.mode, level: inp.level, weeks: W });
      const drop = baseForm[nx.d - 1] - sim.live.form[nx.d - 1];
      if (drop <= tol) { notes.push({ nx, drop, cut: false }); break; }
      for (const it of nx.s.items) { if (it.sets > 1) it.sets--; it.rpe = Math.max(4, it.rpe - 1); }
      if (nx.s.cardio) { nx.s.cardio.minutes = Math.round(nx.s.cardio.minutes * 0.8); nx.s.cardio.rpe = Math.max(2, nx.s.cardio.rpe - 1); }
      nx.s.eased = true;
      recompute(ctx, nx.s);
      changed.add(nx.d);
      notes.push({ nx, drop, cut: true });
      adjusted++;
    }
    const head = `${wd} logged at RPE ${rpe} against a planned ${planned.srpe}${minTxt}: ${actualLoad[d]} AU against ${planned.load}.`;
    const cuts = notes.filter((x) => x.cut);
    const first = notes[0];
    const tolR = Math.round(tol);
    if (cuts.length) {
      const names = cuts.map((x) => DAY_NAMES[x.nx.dow]);
      R.add({ kind: 'hard', text: `${head} The model has you starting ${names[0]} ${Math.round(cuts[0].drop)} AU of form below plan (tolerance ${tolR} AU, half a typical session), so ${list(names)} lose${cuts.length === 1 ? 's' : ''} one set per exercise and one RPE point.`,
        say: `${wd} came in at RPE ${rpe} instead of ${planned.srpe}, and the load model puts you ${Math.round(cuts[0].drop)} AU of form below plan going into ${names[0]}, more than the ${tolR} AU tolerance, so ${list(names)} ${cuts.length === 1 ? 'is' : 'are'} eased by one set per exercise and one RPE point.`,
        nums: [day.w + 1, rpe, planned.srpe, actualLoad[d], planned.load, Math.round(cuts[0].drop), tolR], src: inp.mode === 'busso' ? 'busso2003' : 'banister1975', tag: 'REAL', view: 'curves', day: cuts[0].nx.d });
    } else {
      const dropTxt = !first ? 'with no unlogged session ahead within the week'
        : first.drop > 0 ? `${Math.round(first.drop)} AU of form below plan going into ${DAY_NAMES[first.nx.dow]}`
        : `${Math.round(-first.drop)} AU of form above plan going into ${DAY_NAMES[first.nx.dow]}, fresher than planned`;
      R.add({ kind: 'hard', text: `${head} The model has you ${dropTxt}, inside the ${tolR} AU tolerance, so the rest of the week stands.`,
        say: `${wd} came in harder than planned, but the load model keeps you within ${tolR} AU of plan, so nothing changes.`,
        nums: [day.w + 1, rpe, planned.srpe, actualLoad[d], planned.load, tolR, ...(first ? [Math.abs(Math.round(first.drop))] : [])], src: inp.mode === 'busso' ? 'busso2003' : 'banister1975', tag: 'REAL', view: 'curves', day: d });
    }
  }

  /* R5 autoregulation, per lift, the same session next week:
       logged hard -> hold: no lift may rise above this week's sets or RPE
       logged easy -> add: main lifts gain a set if the minutes allow, and the load step applies */
  for (const a of autoreg) {
    if (a.kind === 'done') continue;
    const day = days[a.d];
    const nextD = a.d + 7;
    const nx = days[nextD];
    if (!nx || !nx.s || log[nextD] || nx.s.j !== day.s.j) continue;
    if (!['build', 'accumulation', 'transmutation'].includes(weeks[nx.w]?.phase)) continue;
    const fired = [];
    if (a.kind === 'hard') {
      for (const it of nx.s.items) {
        const prev = day.s.items.find((p) => p.ex === it.ex && p.role === it.role);
        if (!prev) continue;
        if (it.sets > prev.sets || it.rpe > prev.rpe) { it.sets = Math.min(it.sets, prev.sets); it.rpe = Math.min(it.rpe, prev.rpe); it.rule = 'hold'; fired.push(it.name); }
        else it.rule = it.rule || 'hold';
      }
    } else {
      for (const it of nx.s.items.filter((x) => x.role !== 'acc')) {
        it.sets++;
        recompute(ctx, nx.s);
        if (nx.s.minutes > inp.minutes) { it.sets--; it.rule = 'add load'; }
        else { it.rule = 'add set + load'; }
        fired.push(it.name);
      }
    }
    recompute(ctx, nx.s);
    if (!fired.length) continue;
    changed.add(nextD);
    const wdN = `${DAY_NAMES[nx.dow]} of week ${nx.w + 1}`;
    if (a.kind === 'hard') {
      R.add({ kind: 'autoreg', text: `Autoregulation: after the hard ${DAY_NAMES[day.dow]}, ${wdN} holds sets and RPE on ${fired.length} lift${fired.length === 1 ? '' : 's'} (${list(fired.slice(0, 3).map(lc))}) instead of progressing.`,
        say: `Because that session was hard, the same session next week holds its sets and RPE instead of progressing.`, nums: [nx.w + 1, fired.length], tag: 'ILLUSTRATIVE', view: 'session', day: nextD });
    } else {
      R.add({ kind: 'autoreg', text: `Autoregulation: after the easy ${DAY_NAMES[day.dow]}, ${wdN} adds load on ${fired.length} main lift${fired.length === 1 ? '' : 's'} (${list(fired.slice(0, 3).map(lc))}): one set where the minutes allow, and the ${REPLAN.loadStep} load step.`,
        say: `Because that session was easy, the same session next week adds load on its main lifts.`, nums: [nx.w + 1, fired.length, 2, 10], src: 'acsm2009', tag: 'REAL', view: 'session', day: nextD });
    }
  }

  const lived = livedLoads();
  const model = runModel(plan.loads, lived, { mode: inp.mode, level: inp.level, weeks: W, band: true });
  return {
    days, weeks, lived, model, changed, lastLogged,
    weekVol: weeklyVolume(days, W),
    log: R.items,
  };
}

/* re-export for the narrator and the views */
export { EX, MUSCLES, MUSCLE_LABEL };
