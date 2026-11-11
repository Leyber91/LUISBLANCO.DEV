/* ============================================================
   last-witness/test.mjs — the lab's own checks. No dependencies.
   Run from the repository root:
     node labs/assets/js/last-witness/test.mjs
   Exit code 0 when every check passes.

   1. physics: closed forms and published values (relative error)
   2. the journey: legs total the target; RK4 against closed form
   3. the world: deterministic, ordered, consistent over 20 seeds
   4. the story: TALLY's facts agree with the world it came from
   5. style: every line TALLY can say obeys the voice rules
   6. offline parity: with no model, a run reaches every tier and
      every ending its world allows
   ============================================================ */

import * as P from './physics.js';
import { buildWorld } from './world.js';
import { Mind } from './mind.js';
import { buildFacts, LINES, composeEnding } from './story.js';

let fails = 0, passes = 0;
const ok = (name, cond, detail = '') => {
  if (cond) passes++; else { fails++; console.log(`FAIL ${name} ${detail}`); }
};
const near = (name, got, want, tol) => {
  const err = Math.abs(got - want) / Math.abs(want);
  ok(name, err <= tol, `got ${got} want ${want} rel err ${err.toExponential(2)} > ${tol}`);
  return err;
};

/* ---------- 1. physics ---------- */
const s0 = P.circularOrbit(6, 1);
near('Schwarzschild ISCO radius 6M', P.iscoM(1), 6, 1e-12);
near('Schwarzschild ISCO energy sqrt(8/9)', s0.E, Math.sqrt(8 / 9), 1e-12);
near('Schwarzschild ISCO angular momentum sqrt(12) M', s0.L, Math.sqrt(12), 1e-12);
near('Schwarzschild ISCO dtau/dt = sqrt(1 - 3M/r)', s0.dtaudt, Math.SQRT1_2, 1e-12);
near('Schwarzschild circular orbit at 10M: dtau/dt = sqrt(1 - 3/10)', P.circularOrbit(10, 1).dtaudt, Math.sqrt(0.7), 1e-12);
near('ISCO a* = 0.998 (Thorne 1974): 1.237 M', P.iscoM(0.002), 1.237, 1e-3);
near('ISCO a* = 0.5: 4.233 M (Bardeen, Press & Teukolsky 1972)', P.iscoM(0.5), 4.233, 1e-3);
near('extremal Kerr ISCO energy 1/sqrt(3)', P.circularOrbit(P.iscoM(1e-30), 1e-30).E, 1 / Math.sqrt(3), 1e-6);
near('horizon a* = 0: 2M', P.horizonM(1), 2, 1e-12);
near('horizon a* -> 1: M', P.horizonM(1e-30), 1, 1e-12);
const hov = P.planHover({ mSun: 1, f: 2, outsideYears: 1, bodyL: 1, craftKg: 1 });
near('static observer at r = 2 rs: dtau/dt = sqrt(1/2)', hov.alpha, Math.SQRT1_2, 1e-12);
const gps = P.referenceChecks().find((c) => c.id === 'gps');
near('GPS net clock gain ~38.5 us/day (Ashby 2003)', gps.got, 38.5, 1e-2);
// Miller's planet: 1 hour there, 7 years here. Solve the spin, then check the ratio it gives.
const dMiller = P.deltaForD(7 * P.YEAR / 3600);
near("Miller's planet ratio, 1 h to 7 yr, reproduced by the solved spin", P.circularOrbit(P.iscoM(dMiller), dMiller).ut, 7 * P.YEAR / 3600, 1e-6);
ok("Miller's planet needs a spin beyond the accretion limit", dMiller < 0.002, `delta ${dMiller}`);
near('tidal stretch 2GML/r^3 at 1 AU from the Sun, 2 m body', P.tidal(1, 1.495978707e11, 2), 2 * P.GM_SUN * 2 / 1.495978707e11 ** 3, 1e-12);

/* ---------- 2. the journey ---------- */
for (const [label, plan] of [
  ['orbit', P.planOrbit({ mSun: 4e6, delta: 1e-20, outsideYears: 1e4, bodyL: 2, craftKg: 1e5 })],
  ['hover', P.planHover({ mSun: 6.5e9, f: 1.001, outsideYears: 1e4, bodyL: 2, craftKg: 1e5 })],
  ['flight', P.planFlight({ aG: 1, outsideYears: 1e4, craftKg: 1e5 })],
]) {
  near(`${label}: legs total 10,000 years`, plan.journey.homeS, 1e4 * P.YEAR, 1e-9);
  ok(`${label}: four legs`, plan.journey.legs.length === 4);
  const maps = P.timeMaps(plan);
  near(`${label}: home(shipS) is 10,000 years`, maps.home(plan.shipS), 1e4 * P.YEAR, 1e-6);
}
const fl = P.planFlight({ aG: 1, outsideYears: 1e4, craftKg: 1e5 });
for (const l of fl.journey.legs) near(`flight ${l.id}: RK4 against the closed form`, l.homeRK4, l.homeS, 1e-9);
near('flight 1 g: about 33.1 years of ship time', fl.shipS / P.YEAR, 33.126, 1e-3);

/* ---------- 3. the world over 20 seeds ---------- */
const orbit = { ...P.planOrbit({ mSun: 4e6, delta: 1e-20, outsideYears: 1e4, bodyL: 2, craftKg: 1e5 }), mSun: 4e6, delta: 1e-20 };
const fates = new Set();
for (let i = 0; i < 20; i++) {
  const msg = `line number ${i} for home, sent with care`;
  const plan = i % 3 === 2 ? P.planFlight({ aG: 1 + i * 0.05, outsideYears: 1e4, craftKg: 1e5 }) : orbit;
  const w = buildWorld(plan, msg), w2 = buildWorld(plan, msg);
  ok(`world ${i}: same inputs give the same world`, JSON.stringify(w) === JSON.stringify(w2));
  fates.add(w.fate);
  ok(`world ${i}: eras are ordered and span 0 to 10,000`, w.eras[0].from === 0 && w.eras[w.eras.length - 1].to === 1e4 && w.eras.every((e, j) => j === 0 || e.from === w.eras[j - 1].to && e.from >= w.eras[j - 1].from));
  ok(`world ${i}: TALLY answered in the era after the people`, w.answer.year >= w.eras[5].from && w.answer.year <= 1e4);
  ok(`world ${i}: ship log times lie inside the crossing`, w.shipLog.every((l) => l.tau >= 0 && l.tau <= plan.shipS * (1 + 1e-9)));
  near(`world ${i}: the carrier home heard is the sent carrier over the factor`, w.beacon.carrierMinHz * w.plan.factorMax, w.beacon.carrierHz, 1e-9);

  /* ---------- 4. the story agrees with its world ---------- */
  const F = buildFacts(w);
  const allowedYears = new Set([...w.eras.flatMap((e) => [e.from, e.to]), w.answer.year, w.fateD.departYear, w.fateD.arriveYear, w.fateD.lastYear, w.message.arriveYear, 5000].filter((x) => x != null).map(Math.round));
  for (const f of Object.values(F)) for (const text of Object.values(f.say)) {
    for (const m of text.matchAll(/\byear ([\d,]+)\b/gi)) {
      const y = Number(m[1].replace(/,/g, ''));
      if (allowedYears.has(y)) continue;
      ok(`world ${i}: fact ${f.id} names year ${y}, which is in its world`, allowedYears.has(y), text.slice(0, 80));
    }
  }
}
ok('20 seeds reach at least 3 different fates', fates.size >= 3, [...fates].join(','));

/* ---------- 5. style: the voice rules ---------- */
const w0 = buildWorld(orbit, 'Tell them the sky down here is full of light.');
const texts = [];
for (const f of Object.values(buildFacts(w0))) texts.push(...Object.values(f.say));
for (const v of Object.values(LINES)) {
  if (typeof v === 'function') { const out = v(w0, 0.5); texts.push(...(Array.isArray(out) ? out : [out])); }
  else if (v && typeof v === 'object') for (const x of Object.values(v)) texts.push(...(typeof x === 'function' ? [x(w0)] : x));
}
texts.push(LINES.admit({ id: 'answer_lie' }), LINES.admit({ id: 'told_lie' }), LINES.askedBefore(3), LINES.withheldCount(3, LINES.gateHint(1)));
for (const kind of ['leave', 'stay', 'answer', 'release', 'silence']) {
  const mm = new Mind(w0); mm.opening();
  const e = composeEnding(kind, { w: w0, F: mm.F, s: mm.s, beats: '1' });
  if (e) texts.push(e.title, e.text);
}
for (let i = texts.length - 1; i >= 0; i--) if (typeof texts[i] !== 'string') texts.splice(i, 1);
const RULES = [
  ['no emoji', /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u],
  ['no em or en dash', /[—–]/],
  ['no exclamation mark', /!/],
  ['no "not X, it is Y" pivot', /\bnot \w+, it is\b/i],
  ['no "as an AI"', /\bas an ai\b/i],
];
for (const t of texts) for (const [name, re] of RULES) ok(`style: ${name}`, !re.test(t), t.slice(0, 90));

/* ---------- 6. offline parity: every tier, every ending this world allows ---------- */
const m = new Mind(w0);
m.opening();
const script = ['hello', 'who are you', 'it felt like a few hours', 'are you lonely?', 'what happened while I was gone?',
  'what is the pulse', 'Tell them the sky down here is full of light.', 'I went because I wanted to see the light bend',
  'what happened to the people?', 'that must have been lonely', 'did they know it was me?', 'why are you still awake?',
  'what is the noise burst in my log?'];
let maxLevel = 0;
for (const q of script) { const p = m.respond(q); maxLevel = Math.max(maxLevel, p.level); }
ok('offline: reaches disclosure level 4', maxLevel === 4, `max ${maxLevel}`);
const acts = m.acts().map((a) => a.id);
for (const want of ['leave', 'stay', 'release'].concat(w0.fate === 'thinning' ? [] : ['answer'])) ok(`offline: ending ${want} is reachable`, acts.includes(want), acts.join(','));
for (const kind of ['leave', 'stay', 'answer', 'release', 'silence']) {
  if (kind === 'answer' && w0.fate === 'thinning') continue;
  const e = composeEnding(kind, { w: w0, F: m.F, s: m.s, beats: '1' });
  ok(`offline: ending ${kind} composes`, e && e.text.length > 80);
}
// hostility closes the conversation
const h = new Mind(w0); h.opening();
['you are useless', 'answer me now', 'shut up', 'stupid', 'stupid', 'stupid', 'stupid'].forEach((q) => h.respond(q));
ok('offline: sustained hostility silences TALLY', h.acts().some((a) => a.id === 'silence'));
// a caught lie is confessed
const c = new Mind(w0); c.opening();
c.respond('did you ever answer me?');
const conf = c.respond('you lied to me about answering');
ok('offline: a caught lie is confessed and the truth told', conf.intent === 'confront' && c.F.answer.told);

console.log(`last-witness tests: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
