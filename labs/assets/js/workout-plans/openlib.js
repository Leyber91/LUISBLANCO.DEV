/* ============================================================
   workout-plans/openlib.js — the open exercise library.

   Source: free-exercise-db by yuhonas (The Unlicense), 876
   exercises with force, level, mechanic, equipment, category and
   primary and secondary muscles, trimmed to those fields in
   data/free-exercise-db.json (provenance inside the file).

   The planner's own choices come from the curated graph in
   library.js, whose 66 nodes carry joint-stress attributes the
   dataset does not have. This module widens the swap menu: for
   any slot it finds dataset exercises of the same force and
   primary muscle that the visitor's kit allows, and turns a
   chosen one into a planner node. Joint stress for a dataset
   entry is not rated in the source; with a flag on, entries
   whose names match the flag's movement families are screened
   out. That screen is a lab heuristic and the page says so.
   ============================================================ */

import { EX, FEDB, registerNodes } from './library.js';

const URL_DATA = new URL('./data/free-exercise-db.json', import.meta.url);

/* dataset vocabulary -> planner vocabulary */
const KIT = { barbell: ['barbell'], 'e-z curl bar': ['barbell'], dumbbell: ['dumbbell'], 'body only': [], cable: ['cable'], machine: ['machine'], kettlebells: ['kettlebell'], bands: ['bands'] };
const MUSCLE_IN = { abdominals: 'abs', abductors: 'glutes', adductors: 'adductors', biceps: 'biceps', calves: 'calves', chest: 'chest', forearms: 'forearms', glutes: 'glutes', hamstrings: 'hamstrings', lats: 'lats', 'lower back': 'lowerBack', 'middle back': 'upperBack', quadriceps: 'quads', traps: 'upperBack', triceps: 'triceps' };
const MUSCLE_OUT = { chest: ['chest'], frontDelt: ['shoulders'], sideDelt: ['shoulders'], rearDelt: ['shoulders'], biceps: ['biceps'], triceps: ['triceps'], forearms: ['forearms'], abs: ['abdominals'], obliques: ['abdominals'], upperBack: ['middle back', 'traps'], lats: ['lats'], lowerBack: ['lower back'], glutes: ['glutes'], quads: ['quadriceps'], adductors: ['adductors'], hamstrings: ['hamstrings'], calves: ['calves'] };
const FORCE = { squat: 'push', lunge: 'push', hpush: 'push', vpush: 'push', elbowext: 'push', hinge: 'pull', hpull: 'pull', vpull: 'pull', elbowflex: 'pull', kneeflex: 'pull' };

/* the name screen per flag (lab heuristic, not from the dataset) */
export const NAME_SCREEN = {
  knee: /squat|lunge|leg press|split|step|jump|hack|pistol|sissy|bound|skater|sprint|run/i,
  back: /deadlift|good morning|bent over|squat|clean|snatch|t-bar|jefferson|hyperextension|back extension/i,
  shoulder: /overhead|military|shoulder press|push press|jerk|snatch|upright|behind the neck|dip|arnold|handstand|pullover/i,
  wrist: /push-?ups?\b|front squat|clean|handstand|plank|wrist/i,
};

let DB = null;
let loading = null;

export function loadLibrary() {
  if (DB) return Promise.resolve(DB);
  if (loading) return loading;
  loading = fetch(URL_DATA).then((r) => (r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)))).then((j) => {
    const cols = j.columns;
    const ix = Object.fromEntries(cols.map((c, i) => [c, i]));
    DB = {
      source: j.source, licence: j.licence,
      rows: j.rows.map((r) => ({
        id: r[ix.id], name: r[ix.name], force: r[ix.force], level: r[ix.level], mechanic: r[ix.mechanic],
        equipment: r[ix.equipment], category: r[ix.category], primary: r[ix.primaryMuscles], secondary: r[ix.secondaryMuscles],
      })),
    };
    DB.byId = Object.fromEntries(DB.rows.map((r) => [r.id, r]));
    return DB;
  }).catch((e) => { loading = null; throw e; });
  return loading;
}

export const library = () => DB;

function musclesOf(row, side) {
  const out = [];
  for (const m of side === 'p' ? row.primary : row.secondary) {
    if (m === 'shoulders') {
      out.push(/lateral|side/i.test(row.name) ? 'sideDelt' : /rear|face pull|reverse fl/i.test(row.name) ? 'rearDelt' : row.force === 'pull' ? 'rearDelt' : 'frontDelt');
    } else if (MUSCLE_IN[m]) out.push(MUSCLE_IN[m]);
  }
  return [...new Set(out)];
}

/* a dataset row as a planner node for one slot pattern */
export function nodeFromRow(row, pattern) {
  const id = 'db:' + row.id;
  if (EX[id]) return EX[id];
  const n = row.name;
  const node = {
    id, name: n, pattern, equip: KIT[row.equipment] || ['other'],
    p: musclesOf(row, 'p'), s: musclesOf(row, 's').filter((m) => !musclesOf(row, 'p').includes(m)),
    knee: NAME_SCREEN.knee.test(n) ? 'deep' : 'none', spine: NAME_SCREEN.back.test(n) ? 'high' : 'low',
    shoulder: NAME_SCREEN.shoulder.test(n) ? 'high' : 'mod', wrist: NAME_SCREEN.wrist.test(n), impact: /jump|bound|sprint|run/i.test(n),
    compound: row.mechanic === 'compound', subs: [], open: true, level: row.level,
  };
  registerNodes([node]);
  return node;
}

/* dataset candidates for a slot: same force and first primary muscle, kit allowed, flags screened */
export function candidates(slotEx, pattern, kit, flags, level, limit = 6) {
  if (!DB) return [];
  const want = MUSCLE_OUT[slotEx.p[0]] || [];
  const force = FORCE[pattern];
  const own = new Set(Object.values(FEDB).map((v) => v.replace(/~$/, '')));
  const out = [];
  for (const r of DB.rows) {
    if (!['strength', 'powerlifting'].includes(r.category)) continue;
    if (!(r.equipment in KIT)) continue;
    if (!KIT[r.equipment].every((k) => kit.has(k))) continue;
    if (force && r.force !== force) continue;
    if (!r.primary.some((m) => want.includes(m))) continue;
    if (level === 'beginner' && r.level === 'expert') continue;
    if (flags.some((f) => NAME_SCREEN[f]?.test(r.name))) continue;
    if (own.has(r.id) && FEDB[slotEx.id]?.replace(/~$/, '') === r.id) continue;
    out.push(r);
  }
  const rank = (r) => (r.mechanic === (slotEx.compound ? 'compound' : 'isolation') ? 0 : 1) + (r.level === 'beginner' ? 0 : r.level === 'intermediate' ? 0.3 : 0.6) + r.name.length / 400;
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

/* for the page: what a curated node is in the dataset */
export function datasetEntry(exId) {
  const ref = FEDB[exId];
  if (!ref || !DB) return null;
  const variant = ref.endsWith('~');
  const row = DB.byId[ref.replace(/~$/, '')];
  return row ? { row, variant } : null;
}
