/* ============================================================
   workout-plans/PlanController.js — state, URL, orchestration.

   State lives in the URL hash, so any plan, any edit and any
   logged week is a link. One change runs: parse the notes ->
   buildPlan (cached on the inputs) -> replan (the log) -> every
   view. The model is called only when the visitor presses "ask
   the model to narrate".
   ============================================================ */

import { buildPlan, replan, violations } from './Planner.js';
import { narrateWithModel, narrateLocal } from './PlanService.js';
import { PlanView } from './PlanView.js';
import { LoadChart } from './charts.js';
import { BodyMap } from './bodymap.js';
import { GraphView } from './graphview.js';
import { parseNotes } from './notes.js';
import { loadLibrary, library, candidates, nodeFromRow } from './openlib.js';
import { $, reduceMotion } from './dom.js';
import {
  DEFAULT_STATE, GOALS, LEVELS, MINUTES, WEEKS, EQUIPMENT, INJURIES, DAY_NAMES, SCHEMES, TEMPLATES, SECONDARY_WEIGHT,
} from './constants.js';
import { EX, MUSCLES, MUSCLE_LABEL, PATTERNS, EXERCISES, edgeReason } from './library.js';
import { mountRoutePanel } from '../ai/route-panel.js';

const KIND_CODE = { missed: 'm', hard: 'h', easy: 'e', done: 'd' };
const CODE_KIND = Object.fromEntries(Object.entries(KIND_CODE).map(([k, v]) => [v, k]));

/* ---------- URL hash <-> state ---------- */
export function encodeState(st) {
  const log = Object.entries(st.log).sort((a, b) => a[0] - b[0])
    .map(([d, e]) => d + KIND_CODE[e.kind] + (e.rpe != null && e.kind !== 'missed' ? e.rpe : '') + (e.min != null && e.kind !== 'missed' ? 'x' + e.min : '')).join('.');
  const pins = Object.entries(st.pins || {}).map(([k, v]) => `${k}~${v}`).join(',');
  const q = new URLSearchParams({
    g: st.goal, l: st.level, d: st.days.join(''), m: st.minutes, e: st.equipment,
    i: st.injuries.join(','), w: st.weeks, k: st.mode, sc: st.scheme, log, s: st.sel,
  });
  if (st.notes) q.set('n', st.notes);
  if (pins) q.set('p', pins);
  if (st.bm !== 'week') q.set('bm', st.bm);
  return '#' + q.toString();
}

export function decodeState(hash) {
  const st = JSON.parse(JSON.stringify(DEFAULT_STATE));
  if (!hash || hash.length < 3) return st;
  st.notes = ''; st.scheme = 'auto'; st.pins = {}; st.bm = 'week';
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const pick = (k, ok) => { const v = q.get(k); return v != null && ok(v) ? v : null; };
  st.goal = pick('g', (v) => v in GOALS) ?? st.goal;
  st.level = pick('l', (v) => v in LEVELS) ?? st.level;
  const d = pick('d', (v) => /^[01]{7}$/.test(v) && v.includes('1'));
  if (d) st.days = [...d].map(Number);
  const m = Number(pick('m', (v) => MINUTES.includes(Number(v))));
  if (m) st.minutes = m;
  st.equipment = pick('e', (v) => v in EQUIPMENT) ?? st.equipment;
  const i = q.get('i');
  if (i != null) st.injuries = i.split(',').filter((x) => x in INJURIES);
  const w = Number(pick('w', (v) => WEEKS.includes(Number(v))));
  if (w) st.weeks = w;
  st.mode = pick('k', (v) => ['busso', 'banister', 'pmc'].includes(v)) ?? st.mode;
  st.scheme = pick('sc', (v) => SCHEMES.includes(v)) ?? 'auto';
  st.notes = (q.get('n') || '').slice(0, 400);
  st.bm = q.get('bm') === 'session' ? 'session' : 'week';
  const p = q.get('p');
  if (p) for (const tok of p.split(',')) {
    const [key, id] = tok.split('~');
    const [tpl, k] = (key || '').split('.');
    if (TEMPLATES[tpl] && TEMPLATES[tpl].slots[Number(k)] && id) st.pins[key] = id;
  }
  const log = q.get('log');
  if (log != null) {
    st.log = {};
    for (const tok of log.split('.').filter(Boolean)) {
      const mm = tok.match(/^(\d{1,3})([mhed])(\d+(?:\.5)?)?(?:x(\d{1,3}))?$/);
      if (!mm) continue;
      const kind = CODE_KIND[mm[2]];
      st.log[Number(mm[1])] = kind === 'missed' ? { kind } : { kind, ...(mm[3] ? { rpe: Number(mm[3]) } : {}), ...(mm[4] ? { min: Number(mm[4]) } : {}) };
    }
  }
  const s = Number(q.get('s'));
  if (Number.isInteger(s) && s >= 0) st.sel = s;
  return st;
}

const inputsKey = (st) => JSON.stringify([st.goal, st.level, st.days, st.minutes, st.equipment, [...st.injuries].sort(), st.weeks, st.mode, st.scheme, st.notes, st.pins,
  Object.keys(st.pins || {}).map((k) => !!EX[st.pins[k]])]);

export class PlanController {
  constructor() {
    this.view = new PlanView();
    this.state = decodeState(location.hash);
    this.cacheKey = null;
    this.plan = null;
    this.lived = null;
    this.modelNarr = null;   // { key, inputs, res }
    this.tourTimer = null;
    this.abort = null;
    this.swapItem = null;
    this.bodyPick = null;
  }

  mount() {
    const freshVisit = !location.hash;
    this.still = reduceMotion();
    if (this.still) document.body.classList.add('still');
    this.view.buildControls((k, v) => this.onControl(k, v), (text) => { this.state.notes = text.slice(0, 400); this.update(); });
    this.view.renderRefs();
    this.chart = new LoadChart({
      svgHost: $('#curves'), stripHost: $('#strip'), readout: $('#readout'),
      onSelect: (d, o) => this.select(d, o),
    });
    this.chart.still = this.still;
    this.body = new BodyMap($('#bodymap'), $('#mbars'), { onPick: (m) => this.pickMuscle(m), onJoint: (f) => this.pickJoint(f) });
    this.graph = new GraphView($('#gv'), $('#gv-pick'), $('#gv-cap'));
    mountRoutePanel($('#route'));

    $('#wk-prev').addEventListener('click', () => this.select(Math.max(0, this.state.sel - 7)));
    $('#wk-next').addEventListener('click', () => this.select(Math.min(this.plan.days.length - 1, this.state.sel + 7)));
    $('#narrate').addEventListener('click', () => this.narrate());
    $('#nr-stop').addEventListener('click', () => this.abort?.abort());
    $('#nr-local').addEventListener('click', () => { this.modelNarr = null; this.renderNarration(); });
    $('#x-link').addEventListener('click', () => this.copyLink());
    $('#x-ics').addEventListener('click', () => this.download('ics'));
    $('#x-json').addEventListener('click', () => this.download('json'));
    $('#x-csv').addEventListener('click', () => this.download('csv'));
    $('#x-import').addEventListener('change', (e) => this.importJSON(e.target.files?.[0]));
    $('#x-print').addEventListener('click', () => { this.view.renderPrint(this.plan, this.lived, this.state.log); window.print(); });
    window.addEventListener('beforeprint', () => { if (this.plan) this.view.renderPrint(this.plan, this.lived, this.state.log); });
    $('#x-tour').addEventListener('click', () => this.tour(true));
    $('#tour-stop').addEventListener('click', () => this.stopTour());
    window.addEventListener('hashchange', () => {
      if (location.hash === this.lastHash) return;
      this.state = decodeState(location.hash);
      this.update();
    });
    for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, (e) => { if (this.tourTimer && !e.target.closest?.('#tourbar')) this.stopTour(); }, true);

    this.update({ first: true });
    requestAnimationFrame(() => document.body.classList.remove('boot'));
    // the open library widens the swap menu; the plan never waits for it
    loadLibrary().then(() => { this.resolveOpenPins(); this.cacheKey = null; this.update(); }).catch((e) => console.warn('[plans] open library unavailable', e));
    let seen = false;
    try { seen = sessionStorage.getItem('wp.toured') === '1'; } catch { /* storage blocked */ }
    if (!this.still && !seen && freshVisit) setTimeout(() => this.tour(false), 2600);
  }

  resolveOpenPins() {
    const lib = library();
    if (!lib) return;
    for (const [key, id] of Object.entries(this.state.pins)) {
      if (!id.startsWith('db:') || EX[id]) continue;
      const row = lib.byId[id.slice(3)];
      const [tpl, k] = key.split('.');
      if (row) nodeFromRow(row, TEMPLATES[tpl].slots[Number(k)][0]);
    }
  }

  /* ---------- state changes ---------- */
  onControl(k, v) {
    const st = this.state;
    if (k === 'days') {
      const next = st.days.slice();
      next[v] = next[v] ? 0 : 1;
      if (!next.some(Boolean)) return;
      st.days = next;
    } else if (k === 'injuries') {
      st.injuries = st.injuries.includes(v) ? st.injuries.filter((x) => x !== v) : st.injuries.concat(v);
    } else if (k === 'bm') {
      st.bm = v;
      this.update({ light: true });
      return;
    } else st[k] = v;
    this.swapItem = null;
    this.update({ pruneLog: true });
  }

  select(d, { focusStrip = false } = {}) {
    this.state.sel = d;
    this.swapItem = null;
    this.update({ light: true });
    if (focusStrip) this.chart.focusSel();
  }

  logSel(kind) {
    const st = this.state;
    const d = st.sel;
    if (!this.lived.days[d]?.s) return;
    if (kind == null) delete st.log[d];
    else {
      const planned = this.plan.days[d].s.srpe;
      st.log[d] = kind === 'missed' ? { kind } : { kind, rpe: kind === 'hard' ? Math.min(10, planned + 2) : kind === 'easy' ? Math.max(1, planned - 2) : planned };
    }
    this.update();
    const w = Math.floor(d / 7) + 1;
    const fresh = this.lived.log.filter((r) => r.day === d || r.text.includes(`of week ${w}`) || r.text.includes(`of week ${w + 1}`));
    this.view.announce(kind ? `Logged ${kind}. ${fresh.map((r) => r.text).join(' ')}` : 'Log entry cleared.');
    this.view.flash('curves');
  }

  setRpe(rpe) {
    const e = this.state.log[this.state.sel];
    if (!e) return;
    const planned = this.plan.days[this.state.sel].s.srpe;
    e.rpe = rpe;
    e.kind = rpe >= planned + 1.5 ? 'hard' : rpe <= planned - 1.5 ? 'easy' : 'done';
    this.update();
  }

  setMin(min) {
    const e = this.state.log[this.state.sel];
    if (!e) return;
    e.min = min;
    this.update();
  }

  /* ---------- swap edits ---------- */
  openSwap(item) {
    this.swapItem = item;
    this.renderSwap();
    this.view.flash('session');
  }

  renderSwap() {
    const it = this.swapItem;
    if (!it || !this.plan) { this.view.renderSwap(null); return; }
    const kit = new Set(this.plan.kit);
    const flags = this.plan.flags;
    const T = TEMPLATES[it.tpl];
    const start = T.slots[it.k][1];
    const curated = EXERCISES.filter((x) => x.pattern === it.pattern && x.id !== it.ex && !violations(x, kit, flags).length)
      .map((x) => ({ id: x.id, name: x.name, why: x.id === start ? "the template's first choice" : edgeReason(start, x.id) }));
    const lib = library();
    const open = lib ? candidates(EX[it.ex], it.pattern, kit, flags, this.plan.inp.level, 6)
      .map((row) => ({ row, name: row.name, why: `${row.equipment}, ${row.mechanic || 'n/a'}, ${row.level}` })) : [];
    const key = `${it.tpl}.${it.k}`;
    this.view.renderSwap({
      item: it, tplName: T.name, patternLabel: PATTERNS[it.pattern], curated, open, libCount: lib ? lib.rows.length : 0,
      pinned: key in this.state.pins,
    }, {
      onClose: () => { this.swapItem = null; this.renderSwap(); },
      onPick: (c) => {
        const id = c.row ? nodeFromRow(c.row, it.pattern).id : c.id;
        this.state.pins[key] = id;
        this.swapItem = null;
        this.update();
        this.view.announce(`${c.name} now fills that slot in every ${T.name}. The solver re-allocated the sets.`);
      },
      onReset: () => { delete this.state.pins[key]; this.swapItem = null; this.update(); },
    });
  }

  /* ---------- body map detail ---------- */
  pickMuscle(m) {
    this.bodyPick = m;
    this.writeBodyDetail();
  }

  writeBodyDetail() {
    const m = this.bodyPick;
    const host = $('#bm-detail');
    if (!m || !this.lived) { host.textContent = 'Tap a muscle or a bar to see the lifts behind its number.'; return; }
    const st = this.state;
    const w = Math.floor(st.sel / 7);
    const days = st.bm === 'session' ? [this.lived.days[st.sel]] : this.lived.days.slice(w * 7, w * 7 + 7);
    const parts = [];
    let total = 0;
    for (const d of days) {
      if (!d.s || st.log[d.d]?.kind === 'missed') continue;
      for (const it of d.s.items) {
        const x = EX[it.ex];
        const k = x.p.includes(m) ? 1 : x.s.includes(m) ? SECONDARY_WEIGHT : 0;
        if (!k) continue;
        total += it.sets * k;
        parts.push(`${it.name} ${it.sets}${k < 1 ? ' x 0.5' : ''} (${DAY_NAMES[d.dow]})`);
      }
    }
    host.textContent = `${MUSCLE_LABEL[m]}: ${total % 1 ? total.toFixed(1) : total} sets ${st.bm === 'session' ? 'this session' : 'in week ' + (w + 1)}` + (parts.length ? ` = ${parts.join(' + ')}.` : '; nothing trains it directly.');
  }

  pickJoint(flag) {
    const removed = [...new Set(this.plan.walks.filter((wk) => Object.values(wk.rejected).flat().some((r) => r.type === flag)).flatMap((wk) => Object.entries(wk.rejected).filter(([, rs]) => rs.some((r) => r.type === flag)).map(([id]) => EX[id].name)))];
    $('#bm-detail').textContent = `${INJURIES[flag].label} flag: the planner avoided ${removed.length ? removed.join(', ') : 'nothing in this plan'} (${INJURIES[flag].why(EX[this.plan.walks.find((wk) => Object.values(wk.rejected).flat().some((r) => r.type === flag))?.start] || { impact: false })}).`;
    this.view.flash('graph');
  }

  /* ---------- compute + render ---------- */
  update({ first = false, light = false, pruneLog = false } = {}) {
    const st = this.state;
    const parsed = parseNotes(st.notes);
    this.view.reflectControls(st, parsed);
    this.view.renderNotes(parsed);
    this.view.renderPaused(parsed.red);
    if (parsed.red.length) { this.writeHash(); return; }   // the red-flag stop: no plan is built

    const key = inputsKey(st);
    if (key !== this.cacheKey) {
      this.plan = buildPlan({ goal: st.goal, level: st.level, days: st.days, minutes: st.minutes, equipment: st.equipment, injuries: st.injuries,
        weeks: st.weeks, mode: st.mode, scheme: st.scheme, notes: parsed, pins: st.pins });
      this.cacheKey = key;
      light = false;
    }
    const D = this.plan.days.length;
    if (pruneLog) for (const d of Object.keys(st.log)) if (!this.plan.days[d]?.s) delete st.log[d];
    st.sel = Math.max(0, Math.min(D - 1, st.sel));
    if (!light || !this.lived) this.lived = replan(this.plan, st.log);
    this.writeHash();

    const { plan, lived } = this;
    this.view.summary(plan);
    this.chart.render({ plan, lived, sel: st.sel, log: st.log });
    const w = Math.floor(st.sel / 7);
    const day = lived.days[st.sel];
    const sessionScope = st.bm === 'session';
    let vol = lived.weekVol[w];
    if (sessionScope) {
      vol = Object.fromEntries(MUSCLES.map((mm) => [mm.id, 0]));
      if (day.s && st.log[st.sel]?.kind !== 'missed') for (const it of day.s.items) { for (const mm of EX[it.ex].p) vol[mm] += it.sets; for (const mm of EX[it.ex].s) vol[mm] += it.sets * SECONDARY_WEIGHT; }
    }
    $('#body-wk').textContent = sessionScope ? `${DAY_NAMES[day.dow]}, week ${w + 1}` : `week ${w + 1}`;
    const [lo, hi] = plan.range;
    const half = lo / 2;
    $('#rl1').textContent = `under ${half % 1 ? half.toFixed(1) : half}`;
    $('#rl2').textContent = `under ${lo}`;
    $('#rl3').textContent = `${lo}-${hi} sets`;
    $('#rl4').textContent = `over ${hi}`;
    this.body.render(vol, sessionScope ? {} : plan.targets, day.s && st.log[st.sel]?.kind !== 'missed' ? day.s.muscles : [], sessionScope ? null : plan.weekVol[w], plan.flags);
    $('#body-note').textContent = sessionScope
      ? 'One session: sets per muscle, no weekly band. Switch to week for the targets.'
      : `Weekly target ${lo}-${hi} sets for each muscle with a bracket (${plan.goalKey === 'hypertrophy' ? 'Schoenfeld et al. 2017; the exact band is a convention' : 'a convention for this goal'}); a primary muscle counts a full set, a secondary one half. A second number is the plan before your log.`;
    this.writeBodyDetail();
    this.view.renderWeek(plan, lived, st.sel, st.log, (d) => this.select(d), (d) => this.chart.setHover(d));
    this.view.renderSession(plan, lived, st.sel, st.log, {
      onLog: (k) => this.logSel(k), onRpe: (r) => this.setRpe(r), onMin: (m) => this.setMin(m),
      onWalk: (k) => { this.graph.show(k); this.view.flash('graph', true); }, onSwap: (it) => this.openSwap(it),
    });
    this.renderSwap();
    this.view.renderMethod(plan, lived, st.sel, library());
    if (!light) {
      this.view.renderLog(plan, lived, (d) => this.pick(d));
      const swapEntry = plan.log.find((e) => e.walk);
      this.graph.setWalks(plan.walks.concat(plan.cardioWalk ? [plan.cardioWalk] : []), swapEntry ? swapEntry.walk.start + '>' + (swapEntry.walk.chosen || 'none') : null);
      this.renderNarration();
    }
  }

  writeHash() {
    const h = encodeState(this.state);
    if (h === location.hash) return;
    this.lastHash = h;
    history.replaceState(null, '', h);
  }

  pick(d) {
    this.view.litLog(d.id);
    this.view.flash(d.view);
    if (d.walk) this.graph.show(d.walk.start + '>' + (d.walk.chosen || 'none'));
    if (d.day != null) this.select(d.day);
  }

  /* ---------- narration ---------- */
  narrKey() { return inputsKey(this.state) + JSON.stringify(this.state.log); }

  renderNarration(busy = '') {
    const onCite = (id) => {
      const d = this.plan.log.concat(this.lived.log).find((x) => x.id === id);
      if (d) this.pick(d);
    };
    const useModel = this.modelNarr && this.modelNarr.inputs === inputsKey(this.state);
    const res = useModel ? this.modelNarr.res : narrateLocal(this.plan, this.lived);
    const stale = useModel && this.modelNarr.key !== this.narrKey();
    this.view.renderNarration(res, { stale, busy, onCite });
    $('#nr-local').hidden = !useModel;
  }

  async narrate() {
    this.abort?.abort();
    this.abort = new AbortController();
    const key = this.narrKey(), inputs = inputsKey(this.state);
    this.view.setNarrateBusy(true, 'asking the model');
    this.renderNarration('asking the model; the planner narration shows until it answers');
    try {
      const res = await narrateWithModel(this.plan, this.lived, { signal: this.abort.signal });
      this.modelNarr = { key, inputs, res };
      this.view.announce(`Narration from ${res.source}: ${res.ok} of ${res.sentences.length} sentences check out.`);
    } catch (e) {
      if (e?.name === 'AbortError') this.view.announce('Narration stopped. The planner narration stands.');
      else console.warn('[plans] narration failed', e);
    } finally {
      this.view.setNarrateBusy(false);
      this.renderNarration();
    }
  }

  /* ---------- the tour: six steps, each lighting the live element it explains ---------- */
  tour(manual) {
    this.stopTour();
    try { sessionStorage.setItem('wp.toured', '1'); } catch { /* storage blocked */ }
    const pickKind = (k) => this.plan.log.find((d) => d.kind === k);
    const steps = [pickKind('split'), pickKind('scheme'), pickKind('swap'), pickKind('volume'), pickKind('load'), this.lived.log[0]].filter(Boolean);
    if (!steps.length) return;
    const bar = $('#tourbar');
    bar.hidden = false;
    let i = 0;
    const step = () => {
      if (i >= steps.length) { this.stopTour(); return; }
      const d = steps[i];
      $('#tour-n').textContent = `${i + 1}/${steps.length} · ${d.id}`;
      $('#tour-t').textContent = d.say || d.text;
      this.view.litLog(d.id);
      this.view.flash(d.view, manual);
      if (d.walk) this.graph.show(d.walk.start + '>' + (d.walk.chosen || 'none'));
      i++;
      this.tourTimer = setTimeout(step, manual ? 4600 : 3800);
    };
    step();
  }

  stopTour() {
    clearTimeout(this.tourTimer);
    this.tourTimer = null;
    $('#tourbar').hidden = true;
    document.querySelectorAll('.le.lit').forEach((n) => n.classList.remove('lit'));
  }

  /* ---------- export ---------- */
  async copyLink() {
    try { await navigator.clipboard.writeText(location.href); this.view.message('Link copied. It holds the plan, your edits and the logged week.'); }
    catch { this.view.message('Copy blocked by the browser; the address bar holds the same link.'); }
  }

  download(kind) {
    const { plan, lived, state } = this;
    let blob, name;
    if (kind === 'json') {
      const out = {
        schema: 'luisblanco.dev/workout-plans/1', generated: new Date().toISOString(), source: 'luisblanco.dev/labs/workout-plans.html',
        note: 'Not medical advice. Model parameters are population defaults, not fitted to you.',
        state: { ...state, log: state.log }, link: location.href, summary: plan.summary,
        decisions: plan.log.concat(lived.log).map(({ id, tag, text, src }) => ({ id, tag, text, src })),
        days: lived.days.map((d) => ({
          day: d.d, week: d.w + 1, weekday: DAY_NAMES[d.dow], session: d.s ? {
            name: d.s.name, minutes: d.s.minutes, sessionRpe: d.s.srpe, loadAU: lived.lived[d.d], plannedLoadAU: plan.loads[d.d],
            cardio: d.s.cardio, exercises: d.s.items.map(({ name, sets, reps, rpe, rest }) => ({ name, sets, reps, rpe, rir: Math.max(0, 10 - rpe), restMin: rest })),
          } : null,
          fitness: Math.round(lived.model.live.fit[d.d]), fatigue: Math.round(lived.model.live.fat[d.d]), form: Math.round(lived.model.live.form[d.d]),
        })),
      };
      blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      name = 'training-plan.json';
    } else if (kind === 'csv') {
      // one row per prescribed exercise; columns documented in the header row
      const q = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
      const rows = [['week', 'day', 'weekday', 'session', 'session_minutes', 'session_rpe', 'load_au', 'planned_load_au', 'logged', 'exercise', 'sets', 'reps', 'rpe', 'rir', 'rest_min']];
      for (const d of lived.days) {
        if (!d.s) continue;
        const base = [d.w + 1, d.d, DAY_NAMES[d.dow], d.s.name, d.s.minutes, d.s.srpe, lived.lived[d.d], plan.loads[d.d], state.log[d.d]?.kind || ''];
        if (d.s.cardio) rows.push([...base, `${d.s.cardio.modality}: ${d.s.cardio.name}`, '', `${d.s.cardio.minutes} min`, d.s.cardio.rpe, '', '']);
        for (const it of d.s.items) rows.push([...base, it.name, it.sets, it.reps, it.rpe, Math.max(0, 10 - it.rpe), it.rest]);
      }
      blob = new Blob([rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv' });
      name = 'training-plan.csv';
    } else {
      blob = new Blob([this.ics()], { type: 'text/calendar' });
      name = 'training-plan.ics';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    this.view.message(`${name} saved.`);
  }

  /* load a plan saved with "download plan (.json)": its state block restores the identical plan */
  async importJSON(file) {
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      if (j.schema !== 'luisblanco.dev/workout-plans/1' || !j.state) throw new Error('not a plan file from this page');
      const h = encodeState({ ...decodeState(''), ...j.state, pins: j.state.pins || {}, log: j.state.log || {} });
      this.state = decodeState(h);
      this.resolveOpenPins();
      this.cacheKey = null;
      this.update();
      this.view.message(`Loaded ${file.name}: the plan, your edits and the logged week are restored.`);
    } catch (e) {
      this.view.message(`Could not load ${file.name}: ${e.message}.`);
    }
  }

  ics() {
    const { lived } = this;
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() + ((8 - start.getDay()) % 7 || 7));   // next Monday
    const ymd = (dt) => `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
    const fold = (line) => { const out = []; let s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); } out.push(s); return out.join('\r\n'); };
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//luisblanco.dev//Personalized Plans//EN', 'CALSCALE:GREGORIAN'];
    for (const d of lived.days) {
      if (!d.s || this.state.log[d.d]?.kind === 'missed') continue;
      const dt = new Date(start); dt.setDate(start.getDate() + d.d);
      const nx = new Date(dt); nx.setDate(dt.getDate() + 1);
      const desc = (d.s.cardio ? [`${d.s.cardio.modality}: ${d.s.cardio.name}, ${d.s.cardio.minutes} min, ${d.s.cardio.note}`] : [])
        .concat(d.s.items.map((it) => `${it.name}: ${it.sets} x ${it.reps} at RPE ${it.rpe}, rest ${it.rest} min`))
        .concat(['', 'Not medical advice. luisblanco.dev/labs/workout-plans.html']).join('\n');
      lines.push('BEGIN:VEVENT', `UID:wp-${d.d}-${ymd(start)}@luisblanco.dev`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(dt)}`, `DTEND;VALUE=DATE:${ymd(nx)}`,
        fold(`SUMMARY:${esc(`W${d.w + 1} ${d.s.name} · ${d.s.minutes} min · RPE ${d.s.srpe}`)}`),
        fold(`DESCRIPTION:${esc(desc)}`), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  static boot() {
    const app = new PlanController();
    app.mount();
    globalThis.__plans = app;   // handy in the console; read-only use
    return app;
  }
}
