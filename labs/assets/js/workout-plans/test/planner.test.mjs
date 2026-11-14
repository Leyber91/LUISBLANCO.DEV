/* ============================================================
   test/planner.test.mjs — Node tests for Personalized Plans.
   No dependencies, no browser. From the repo root:
     node labs/assets/js/workout-plans/test/planner.test.mjs
   1 every input combination of the form (goals x levels x kits x
     flag sets x day patterns x minutes x block lengths) solves
     with 0 hard-constraint violations, before and after a re-plan
   2 1,000 random constraint sets, with random notes and swaps, ditto
   3 the load model reproduces hand-computed values within 1%
   4 the notes parser fires on injuries and nothing else
   5 the claim checker over 10 recorded model narrations, and over
     sentences known to be wrong
   ============================================================ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPlan, replan, EX } from '../Planner.js';
import { sessionLoad, simulate, weeklyIndices } from '../LoadModel.js';
import { parseNotes } from '../notes.js';
import { check, normalise } from '../LocalCoach.js';
import { EQUIPMENT, INJURIES, TEMPLATES, VOLUME, LOAD_MODEL } from '../constants.js';
import { CASES } from './cases.mjs';

let checks = 0;
const fail = [];
const expect = (ok, msg) => { checks++; if (!ok && fail.length < 20) fail.push(msg); };

/* ---------- hard constraints on one solved plan ---------- */
function audit(inp, plan, lived, tag) {
  const notes = inp.notes || { flags: [], noDays: [], kitAdd: [], kitRemove: [] };
  const kit = new Set(EQUIPMENT[inp.equipment].kit.concat(notes.kitAdd).filter((k) => !notes.kitRemove.includes(k)));
  const flags = [...new Set(inp.injuries.concat(notes.flags))];
  const avail = inp.days.map((v, i) => (v && !notes.noDays.includes(i) ? i : -1)).filter((i) => i >= 0);
  const allowedDays = new Set(avail.length ? avail : inp.days.map((v, i) => (v ? i : -1)).filter((i) => i >= 0));
  for (const src of [plan.days, lived.days]) {
    for (let w = 0; w < inp.weeks; w++) {
      const week = src.slice(w * 7, w * 7 + 7);
      expect(week.filter((d) => d.s).length === plan.n, `${tag}: week ${w + 1} has ${week.filter((d) => d.s).length} sessions, plan says ${plan.n}`);
    }
    for (const d of src) {
      if (!d.s) continue;
      expect(allowedDays.has(d.dow), `${tag}: session on unavailable day ${d.dow}`);
      expect(d.s.minutes <= inp.minutes + 0.5, `${tag}: ${d.s.name} runs ${d.s.minutes} min over the ${inp.minutes} cap`);
      expect(Number.isFinite(d.s.load), `${tag}: non-finite load`);
      const S = plan.sessions[d.s.j];
      const focus = new Set(S.T ? S.T.slots.map(([p]) => p) : []);
      for (const it of d.s.items) {
        const x = EX[it.ex];
        expect(x.equip.every((k) => kit.has(k)), `${tag}: ${x.name} needs kit the visitor lacks`);
        for (const f of flags) expect(!INJURIES[f].test(x), `${tag}: ${x.name} breaks the ${f} flag`);
        expect(focus.has(it.pattern), `${tag}: ${x.name} (${it.pattern}) outside the focus of ${S.name}`);
        // a lift of another pattern is allowed only when no lift of the slot's pattern passes
        if (x.pattern !== it.pattern && !x.open) {
          const alt = Object.values(EX).some((y) => !y.open && y.pattern === it.pattern && y.equip.every((k) => kit.has(k)) && !flags.some((f) => INJURIES[f].test(y)));
          expect(!alt || it.carried, `${tag}: ${x.name} fills a ${it.pattern} slot although a same-pattern lift passes`);
        }
      }
    }
  }
  const range = VOLUME[plan.goalKey][inp.level];
  for (const [m, r] of Object.entries(plan.targets)) expect(plan.refVol[m] <= r[1] + 1e-9, `${tag}: ${m} at ${plan.refVol[m]} over the ${range[1]} cap`);
  for (const v of lived.lived) expect(Number.isFinite(v), `${tag}: non-finite lived load`);
}

function logFor(plan, rnd) {
  const sess = plan.days.filter((d) => d.s).map((d) => d.d);
  const log = {};
  for (let i = 0; i < 4 && sess.length; i++) {
    const d = sess[Math.floor(rnd() * sess.length)];
    const k = ['missed', 'hard', 'easy', 'done'][Math.floor(rnd() * 4)];
    log[d] = k === 'missed' ? { kind: k } : { kind: k, rpe: Math.round((3 + rnd() * 7) * 2) / 2, ...(rnd() < 0.3 ? { min: 20 + Math.floor(rnd() * 60) } : {}) };
  }
  return log;
}

/* mulberry32: a seeded generator so the random sets are the same every run */
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* 1 the exhaustive sweep */
const t0 = Date.now();
let solved = 0;
const dayPats = ['1010100', '1101100', '1111111', '0000011', '1000000', '1110110'].map((s) => [...s].map(Number));
const flagSets = [[], ['knee'], ['back'], ['shoulder', 'wrist'], ['knee', 'back', 'shoulder', 'wrist']];
const r1 = rng(7);
for (const goal of ['strength', 'hypertrophy', 'endurance', 'general'])
  for (const level of ['beginner', 'intermediate', 'advanced'])
    for (const equipment of Object.keys(EQUIPMENT))
      for (const injuries of flagSets)
        for (const days of dayPats)
          for (const minutes of [30, 60, 90])
            for (const weeks of [6, 8, 12]) {
              const inp = { goal, level, equipment, injuries, days, minutes, weeks, mode: 'busso' };
              const plan = buildPlan(inp);
              audit(inp, plan, replan(plan, logFor(plan, r1)), `${goal}/${level}/${equipment}/${injuries}/${days.join('')}/${minutes}/${weeks}`);
              solved++;
            }
console.log(`1 exhaustive: ${solved} plans solved and re-planned in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

/* 2 random constraint sets with notes and swaps */
const r2 = rng(42);
const pickOf = (a) => a[Math.floor(r2() * a.length)];
const NOTES = ['dodgy left knee', 'back from holiday', 'no knee problems', 'sore shoulder, busy Friday', 'I have a pull-up bar but no barbell',
  'cannot train Wednesdays', 'lower back flares up', 'wrists are fine', 'kettlebell at home', ''];
let randomSolved = 0;
for (let i = 0; i < 1000; i++) {
  const days = Array.from({ length: 7 }, () => (r2() < 0.5 ? 1 : 0));
  if (!days.some(Boolean)) days[Math.floor(r2() * 7)] = 1;
  const notesText = pickOf(NOTES);
  const inp = {
    goal: pickOf(['strength', 'hypertrophy', 'endurance', 'general']), level: pickOf(['beginner', 'intermediate', 'advanced']),
    equipment: pickOf(Object.keys(EQUIPMENT)), injuries: Object.keys(INJURIES).filter(() => r2() < 0.3), days,
    minutes: pickOf([30, 45, 60, 75, 90]), weeks: pickOf([6, 8, 12]), mode: pickOf(['busso', 'banister', 'pmc']),
    scheme: pickOf(['auto', 'linear', 'undulating', 'block']), notes: parseNotes(notesText), pins: {},
  };
  // a random swap: any node of the same pattern; the planner must keep it only if it passes
  const tpl = pickOf(Object.keys(TEMPLATES));
  const k = Math.floor(r2() * TEMPLATES[tpl].slots.length);
  const pat = TEMPLATES[tpl].slots[k][0];
  inp.pins[`${tpl}.${k}`] = pickOf(Object.values(EX).filter((x) => x.pattern === pat)).id;
  const plan = buildPlan(inp);
  audit(inp, plan, replan(plan, logFor(plan, r2)), `random ${i} ${JSON.stringify({ ...inp, notes: notesText })}`);
  randomSolved++;
}
console.log(`2 random: ${randomSolved} constraint sets with notes and swaps`);

/* 3 the load model against hand computation */
const close = (a, b, tag) => expect(Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 0.01), `${tag}: ${a} vs hand ${b}`);
close(sessionLoad(7, 60), 420, 'session load 7 x 60');
{
  const w = [100, 0, 50];
  const e1 = Math.exp(-1 / 45), e2 = Math.exp(-1 / 15);
  const F = [100, 100 * e1, 100 * e1 * e1 + 50];
  const H = [200, 200 * e2, 200 * e2 * e2 + 100];
  const sim = simulate(w, { mode: 'banister' });
  for (let i = 0; i < 3; i++) { close(sim.fit[i], F[i], `fitness day ${i}`); close(sim.fat[i], H[i], `fatigue day ${i}`); close(sim.form[i], F[i] - H[i], `form day ${i}`); }
  const pmc = simulate([100, 0], { mode: 'pmc' });
  close(pmc.fit[0], 100 / 42, 'CTL day 0');
  close(pmc.fat[1], (100 / 7) * (6 / 7), 'ATL day 1');
  // Busso: k2 on day 2 = k3 * (w0 e^(-1/tau3) + w1), impulse w2 = 50
  const k3 = 0.01, e3 = Math.exp(-1 / LOAD_MODEL.tau3);
  const bus = simulate(w, { mode: 'busso', k3 });
  const H2 = (0 * e2 * e2) + (k3 * 100) * 0 + 0;   // day 0 has q = 0, day 1 has w = 0
  close(bus.fat[2], H2 + k3 * (100 * e3 + 0) * 50, 'variable-dose fatigue day 2');
  const week = [100, 0, 50, 0, 0, 0, 0];
  const mean = 150 / 7, sd = Math.sqrt(week.reduce((a, x) => a + (x - mean) ** 2, 0) / 7);
  const ix = weeklyIndices(week)[0];
  close(ix.monotony, mean / sd, 'monotony');
  close(ix.strain, 150 * mean / sd, 'strain');
}
console.log('3 load model: hand-computed session load, fitness, fatigue, form, CTL, ATL, variable dose, monotony, strain');

/* 4 the notes parser */
const N = (t) => parseNotes(t);
expect(N('dodgy left knee').flags.includes('knee'), 'notes: knee');
expect(N('back from holiday').flags.length === 0, 'notes: "back from holiday" bans nothing');
expect(N('no knee problems').flags.length === 0, 'notes: negated knee');
expect(N('my knees are fine but my lower back hurts').flags.join() === 'back', 'notes: fine knees, bad back');
expect(N('cannot train on Wednesdays').noDays.includes(2), 'notes: no Wednesday');
expect(N('I have a pull-up bar but no barbell').kitAdd.includes('bar') && N('I have a pull-up bar but no barbell').kitRemove.includes('barbell'), 'notes: kit items');
for (const t of ['had chest pain last week', 'I fainted at the gym', 'I am pregnant', 'heart condition', 'knee surgery last month']) expect(N(t).red.length > 0, `notes: red flag in "${t}"`);
console.log('4 notes parser: injuries, negation, weekdays, kit items, red flags');

/* 5 the claim checker */
const rec = JSON.parse(readFileSync(fileURLToPath(new URL('./narrations.json', import.meta.url)), 'utf8'));
let total = 0, unmatched = 0;
for (const c of rec.cases) {
  let sentences = [];
  try { sentences = normalise(JSON.parse(c.reply)); } catch { sentences = []; }
  const res = check(sentences, c.decisions, c.planNames);
  const bad = res.filter((r) => !r.ok);
  total += res.length; unmatched += bad.length;
  console.log(`   ${c.name.padEnd(28)} ${res.length} sentences, ${bad.length} unmatched${bad.length ? ': ' + bad.map((b) => b.why).join(' | ') : ''}`);
}
console.log(`5 recorded narrations (${rec.model}, ${rec.cases.length} cases): ${unmatched} of ${total} sentences unmatched`);
{
  const c = rec.cases[0];
  const bad = check([
    { say: 'You train 5 days a week.', cites: ['D1'] },
    { say: 'This block will heal your knee.', cites: ['D1'] },
    { say: 'Volume is high.', cites: [] },
    { say: 'The plan uses 4 sessions.', cites: ['D99'] },
  ], c.decisions, c.planNames);
  expect(bad.every((b) => !b.ok), 'checker: known-bad sentences are all struck');
}

if (fail.length) { console.error(`\nFAILED ${fail.length} of ${checks} checks:\n` + fail.join('\n')); process.exit(1); }
console.log(`\nall ${checks} checks pass`);
