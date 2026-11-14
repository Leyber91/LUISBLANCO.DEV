/* ============================================================
   The Pod — boot.

   One record (day.js) is the whole state. Every act, crop, guess
   and mark changes the record, the record is saved, and the three
   views (the pod, the notebook, the panel under the glass) are
   redrawn from it.

   The page stands on the labs' shared platform (Labs OS) and
   keeps nothing of its own beside it:
   - the day is the lab's progress record in the platform's store,
     in this browser, so the privacy page exports and erases it
     with everything else;
   - the canvas is mounted through the platform's scene lifecycle,
     which pauses it while the tab is hidden or the pod is off
     screen;
   - what a visitor uses is logged as counts (an act, a crop, a
     mark raised, the evening's score) and sent only if they have
     allowed sharing. Nothing a visitor types is in an event.
   If the platform cannot start, the day runs in memory.

   Deep links, for looking at a state without playing to it:
     ?species=0|1|2   which of the three species
     ?at=mid          a recorded day, 14 acts in
     ?at=evening      the same day ended, at the first evening step
     ?at=check        at the third ring of the check
     ?at=done         the day over
     ?still           no motion (also set by the system preference)
   A linked state is replayed from a seed, is never saved and logs
   nothing of its own.
   ============================================================ */

import { LabsOS } from '../../os/index.js';
import { mountScene } from '../../os/scene.js';
import { mulberry32 } from '../raster.js';
import { prefersReduced } from '../render.js';
import { OBJ } from './world.js';
import { GATE_SPECIES, makeSpecies, seedOf } from './species.js';
import { ringSpec, soloSpec, recognise, sectorRect } from './ring.js';
import { DAY, GREETING, newDay, doAct, addCrop, addSolo, dropEntry, setGuess, raiseMark, endDay, answer, score, validDay, whereIs, dayOver, carry } from './day.js';
import { initPod } from './scene.js';
import { mountNotebook } from './notebook.js';
import { mountPanel } from './panel.js';

const $ = (id) => document.getElementById(id);
const LAB = 'heptapod';
const RECORD_V = 1;
const q = new URLSearchParams(location.search);
const at = ['mid', 'evening', 'check', 'done'].includes(q.get('at')) ? q.get('at') : null;
const wantSpecies = /^[0-2]$/.test(q.get('species') || '') ? Number(q.get('species')) : null;
const preview = !!at;
const trial = !preview && wantSpecies != null;      // a link that picks the species: played, never stored, so it cannot replace a kept day
const kept = !preview && !trial;
const speciesIndex = (s) => GATE_SPECIES.findIndex(([a, b]) => a === s[0] && b === s[1]);

/* ---------------- the platform ---------------- */
let os = null;
const EVENTS = { 'heptapod.act': 'action', 'heptapod.crop': 'action', 'heptapod.mark': 'action', 'heptapod.evening': 'outcome', 'heptapod.check': 'outcome' };
/* Usage, never content: ids from the lab's own vocabulary and counts. */
function track(type, data) { if (os && !preview) void os.track(type, data); }

async function load() {
  if (!os) return null;
  try {
    const rec = await os.progress.get(); const s = rec && rec.data;
    if (!validDay(s) || speciesIndex(s.species) < 0) return null;
    return validDay(s, makeSpecies(s.species[0], s.species[1])) ? s : null;
  } catch { return null; }
}
let saveTimer = 0;
function writeNow() {
  clearTimeout(saveTimer); saveTimer = 0;
  if (!os || !kept) return;
  os.progress.set(state, { v: RECORD_V }).catch(() => { /* the store refused: the day lives until the tab closes */ });
}
/* Acts and crops are written at once; a pencil guess waits for a pause in the typing. */
function save(soon = false) {
  if (!kept) return;
  if (!soon) return writeNow();
  if (!saveTimer) saveTimer = setTimeout(writeNow, 300);
}
/* What the hub's "continue" shows for this lab. */
function bookmark() {
  if (!os || !kept) return;
  if (state.phase === 'done') { void os.progress.finish().catch(() => {}); return; }
  const label = state.phase === 'day' ? `day one, ring ${state.acts.length} of ${DAY.ACTS}` : 'day one, the evening';
  void os.progress.setResume('heptapod.html', label).catch(() => {});
}

/* ---------------- a recorded day, for the deep links ---------------- */
function recorded(k) {
  const [a, s] = GATE_SPECIES[k];
  const spk = makeSpecies(a, s);
  const st = newDay(a, s, 3);
  const rng = mulberry32(seedOf('recorded', a, s));
  const want = at === 'mid' ? 14 : DAY.ACTS;
  const cropOf = (i, role) => {
    const spec = i === GREETING ? ringSpec(spk, GREETING) : ringSpec(spk, st.acts[i].scene, st.acts[i].emph);
    const rect = sectorRect(spec, role);
    if (!rect) return;
    const kept = recognise(spec, rect, 0);
    addCrop(st, spk, i, rect, 0, kept.roles, kept.cells);
  };
  cropOf(GREETING, 'recipient');
  while (st.acts.length < want) {
    let rec;
    if (!st.held) { const on = OBJ.filter((o) => whereIs(st, o)); rec = doAct(st, spk, 'lift', { obj: on[Math.floor(rng() * on.length)] }); }
    else rec = doAct(st, spk, ['hold', 'putdown', 'give'][Math.floor(rng() * 3)], { place: rng() < 0.5 ? 'near' : 'far', slot: Math.floor(rng() * 6) });
    if (!rec) break;
    const i = st.acts.length - 1;
    if (rng() < 0.5) cropOf(i, rec.emph);
    if (st.acts[i].scene < 12 && rng() < 0.7) raiseMark(st, 'take');
  }
  if (at === 'mid') return st;
  endDay(st, spk);
  if (at === 'evening') return st;
  st.rbSeen = true;
  const upTo = at === 'check' ? 2 : st.check.items.length;
  for (let i = 0; i < upTo; i++) answer(st, i, i % 3 === 2 ? st.check.items[i].options.find((o) => o !== st.check.items[i].target) : st.check.items[i].target);
  return st;
}

function fresh(avoid = null) {
  let k = wantSpecies ?? Math.floor(Math.random() * GATE_SPECIES.length);
  if (avoid != null && wantSpecies == null && GATE_SPECIES.length > 1) while (k === speciesIndex(avoid)) k = (k + 1) % GATE_SPECIES.length;
  return newDay(GATE_SPECIES[k][0], GATE_SPECIES[k][1], 1 + Math.floor(Math.random() * 99999));
}

let state = null, sp = null;
let pod = null, notebook = null, panel = null;

const say = (t) => { $('say').textContent = t; };

/* What stands on the glass outside the day: the read-back, a ring of the check, or the greeting again. */
function evening() {
  pod.setEnabled(state.phase === 'day');
  if (state.phase === 'day') return;
  if (state.phase === 'evening' && state.readback && !state.rbSeen) pod.show(soloSpec(sp, state.readback.id));
  else if (state.phase === 'evening') pod.show(ringSpec(sp, state.check.items[state.check.answers.length].target));
  else pod.show(ringSpec(sp, GREETING));
}
function redraw(freshKey) { notebook.render(freshKey); panel.render(); $('stage').dataset.phase = state.phase; }

function mount() {
  if (notebook) notebook.destroy();
  const hooks = { sp, getState: () => state };
  // the platform's lifecycle: a scene already on this canvas is destroyed first, and this one is paused
  // while the tab is hidden or the pod is off screen
  mountScene($('pod'), ({ reducedMotion }) => {
    pod = initPod($('pod'), {
      ...hooks,
      reduced: reducedMotion,
      say,
      carry(place) { carry(state, place); save(); },
      act(kind, opts) {
        const rec = doAct(state, sp, kind, opts);
        if (!rec) return null;
        save(); bookmark(); redraw();
        track('heptapod.act', { kind, ring: state.acts.length });
        say(`Ring ${state.acts.length} of ${DAY.ACTS} is on the glass.${dayOver(state) ? ' The lamp is out.' : ''}`);
        return rec;
      },
      crop(actIndex, rect, erode, kept) {
        const res = addCrop(state, sp, actIndex, rect, erode, kept.roles, kept.cells);
        if (!res) return null;
        save(); redraw(res.fresh ? res.entry.key : null);
        track('heptapod.crop', { radicals: res.entry.tokens.length, fresh: res.fresh, thinning: erode > 0, greeting: actIndex === GREETING });
        say(res.entry.tokens.length ? (res.fresh ? 'Kept in the notebook.' : 'That radical is already in the notebook.') : 'A scrap: too little ink to know it again.');
        return res;
      },
    });
    return pod;
  }, { reducedMotion: prefersReduced() });
  notebook = mountNotebook({ list: $('nb'), key: $('nb-key'), count: $('nb-n') }, {
    ...hooks,
    onGuess(key, text) { setGuess(state, key, text); save(true); },
    onDrop(key) { dropEntry(state, key); save(); redraw(); notebook.focusFirst(); say('Removed from the notebook.'); },
  });
  panel = mountPanel($('panel'), {
    ...hooks,
    onRaise(text) {
      if (!state.acts.length) return 'Do something on the tray first: a mark needs a ring to be counted against.';
      const rec = raiseMark(state, text);
      if (!rec) return text.trim() ? 'That mark is already raised for this ring.' : '';
      pod.raise(rec.mark); save();
      track('heptapod.mark', { raised: state.marks.length });
      say(`You raised "${rec.mark}".`);
      return '';
    },
    onEnd() {
      if (!endDay(state, sp)) return;
      save(); bookmark(); evening(); redraw(); say('Evening.');
      track('heptapod.evening', { species: speciesIndex(state.species), rings: state.acts.length, kept: state.entries.filter((e) => e.tokens.length).length, marks: state.marks.length, readback: !!state.readback });
      $('stage').scrollIntoView({ block: 'start', behavior: prefersReduced() ? 'auto' : 'smooth' });
    },
    onKeepSolo(id) { const r = addSolo(state, sp, id); save(); redraw(r && r.fresh ? r.entry.key : null); },
    onReadbackSeen() { state.rbSeen = true; save(); evening(); redraw(); },
    onAnswer(i, scene) {
      if (!answer(state, i, scene)) return;
      save(); evening(); redraw();
      if (state.phase === 'done') {
        bookmark();
        track('heptapod.check', { species: speciesIndex(state.species), score: score(state), of: state.check.items.length, rings: state.acts.length, kept: state.entries.filter((e) => e.tokens.length).length });
        say('The day is over.');
      } else say(`Ring ${state.check.answers.length + 1}.`);
    },
    onNewDay() {
      state = fresh(state.species);
      sp = makeSpecies(state.species[0], state.species[1]);
      save(); bookmark(); mount();
    },
  });
  redraw();
  $('pod').probe = () => pod.probe();      // for the drive tool: where things are on screen
  if (state.phase === 'day') pod.greet(); else evening();
  $('pod').setAttribute('aria-label', 'The pod. A being behind glass, and a tray with six things. Arrow keys choose a thing and Enter takes it. With a thing in hand: Up holds it at the glass, Down holds it far from the glass, Enter sets it down, G passes it through the glass. While a ring is on the glass, W, D, S and A keep its top, right, bottom and left part in the notebook.');
  $('preview').hidden = kept;
  $('preview-what').textContent = preview ? 'This is a recorded day, replayed from a seed.' : 'This day was opened from a link that picks the species.';
  $('unkept').hidden = !kept || !!(os && os.storage.persistent);
}

async function boot() {
  try { os = await LabsOS.init({ lab: LAB }); } catch { os = null; }      // the lab runs without the platform
  if (os) for (const [type, cls] of Object.entries(EVENTS)) { try { os.register(type, { cls }); } catch { /* registered by an earlier boot on this page */ } }
  state = preview ? recorded(wantSpecies ?? 0) : (trial ? null : await load()) || fresh();
  sp = makeSpecies(state.species[0], state.species[1]);
  try { mount(); } catch (e) {
    // a record this version cannot draw: begin a new day over it, so the next load does not meet it again
    console.error('the stored day could not be drawn; a new day begins', e);
    state = fresh(); sp = makeSpecies(state.species[0], state.species[1]);
    writeNow(); mount();
  }
  addEventListener('pagehide', writeNow);
}
boot();
