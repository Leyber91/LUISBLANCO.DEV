/* ============================================================
   last-witness/test.mjs — the lab's own checks. No dependencies.
   Run from the repository root:
     node labs/assets/js/last-witness/test.mjs
   Exit code 0 when every check passes.

   1. physics: closed forms and published values (relative error)
   2. the journey: home's time is the sum of the legs for the stay
      chosen, never a target; dwell = stay x u^t; flight against
      4 (c/a) sinh(a tau / 4c); RK4 against closed form
   3. the world: deterministic, ordered, laid out inside the computed
      span (about 3,000, 10,000 and 60,000 years), over 20 seeds
   4. the story: TALLY's facts agree with the world it came from and
      name its computed years, never a constant ten thousand
   5. style: every line TALLY can say obeys the voice rules
   6. offline parity: with no model, a run reaches every tier and
      every ending its world allows
   7. schema: the content validates (no dangling link, no unknown
      topic or state variable, no unreachable ending). With --broken
      the same validator runs on a deliberately broken copy and the
      script exits non-zero.
   8. the witness record carries the computed outside time
   9. the model-reply validator rejects a reply that swaps your clock
      and home's (totals or the per-second rate), and accepts every
      line the engine itself says
  10. disclosure: 18 statements on 6 worlds open no tier and no gated
      ending; asking the gate questions then opens them
   ============================================================ */

import * as P from './physics.js';
import { buildWorld, fmtDur, fmtInt } from './world.js';
import { Mind, INTENT_IDS, clockSwap, durations } from './mind.js';
import { buildFacts, LINES, composeEnding, ACTS } from './story.js';
import { VOICES, LAB } from './config.js';
import { buildRecord } from './record.js';

/* ---------- the schema validator ---------- */
const STATE_KEYS = { s: new Set(['trust', 'turn', 'silences', 'hostility', 'level', 'mood', 'visitor', 'memory']), w: new Set(['fate', 'method', 'years']) };
export function validateStory(F, acts, world) {
  const errs = [];
  const ids = new Set(Object.keys(F));
  for (const f of Object.values(F)) {
    if (!(f.level >= 0 && f.level <= 4)) errs.push(`${f.id}: level ${f.level}`);
    for (const t of f.topics) if (!INTENT_IDS.has(t)) errs.push(`${f.id}: unknown topic ${t}`);
    if (f.truth && !ids.has(f.truth)) errs.push(`${f.id}: dangling truth ${f.truth}`);
    for (const x of f.supersedes || []) if (!ids.has(x)) errs.push(`${f.id}: dangling supersedes ${x}`);
    for (const r of ['clipped', 'plain', 'warm']) if (typeof f.say[r] !== 'string' || !f.say[r]) errs.push(`${f.id}: missing register ${r}`);
  }
  for (const a of acts) {
    // run each act's condition against a state that refuses unknown variables
    const guard = (name, obj) => new Proxy(obj, { get: (o, k) => { if (typeof k === 'string' && STATE_KEYS[name] && !STATE_KEYS[name].has(k)) throw new Error(`unknown state variable ${name}.${k}`); return o[k]; } });
    const factProxy = new Proxy(F, { get: (o, k) => { if (!(k in o)) throw new Error(`unknown fact ${String(k)}`); return o[k]; } });
    try { a.when({ s: guard('s', { trust: 0.5, turn: 5, silences: 0, hostility: 0, level: 2, mood: 'open', visitor: {}, memory: [] }), F: factProxy, w: guard('w', { fate: world.fate, method: world.method, years: world.years }) }); }
    catch (e) { errs.push(`act ${a.id}: ${e.message}`); }
    const mm = new Mind(world); mm.opening();
    if (!composeEnding(a.id, { w: world, F: mm.F, s: mm.s, beats: '1' }) && !(a.id === 'answer' && world.fate === 'thinning')) errs.push(`act ${a.id}: no ending text (unreachable)`);
  }
  return errs;
}

if (process.argv.includes('--broken')) {
  const w = buildWorld(P.planOrbit({ mSun: 4e6, delta: 1e-20, stayS: 10 ** 4.67, bodyL: 2, craftKg: 1e5 }), 'a broken copy');
  const F = buildFacts(w);
  F.told_lie.truth = 'no_such_fact';
  F.sky.topics.push('astrology');
  const acts = [...ACTS, { id: 'vanish', label: () => 'Vanish', when: ({ s }) => s.mana > 3 }];
  const errs = validateStory(F, acts, w);
  for (const e of errs) console.log('SCHEMA', e);
  console.log(`schema on a broken copy: ${errs.length} errors`);
  process.exit(errs.length ? 1 : 0);
}

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
const hov = P.planHover({ mSun: 1, f: 2, stayS: 3600, bodyL: 1, craftKg: 1 });
near('static observer at r = 2 rs: dtau/dt = sqrt(1/2)', hov.alpha, Math.SQRT1_2, 1e-12);
const gps = P.referenceChecks().find((c) => c.id === 'gps');
near('GPS net clock gain ~38.5 us/day (Ashby 2003)', gps.got, 38.5, 1e-2);
// Miller's planet: 1 hour there, 7 years here. Solve the spin, then check the ratio it gives.
const dMiller = P.deltaForD(7 * P.YEAR / 3600);
near("Miller's planet ratio, 1 h to 7 yr, reproduced by the solved spin", P.circularOrbit(P.iscoM(dMiller), dMiller).ut, 7 * P.YEAR / 3600, 1e-6);
ok("Miller's planet needs a spin beyond the accretion limit", dMiller < 0.002, `delta ${dMiller}`);
near('tidal stretch 2GML/r^3 at 1 AU from the Sun, 2 m body', P.tidal(1, 1.495978707e11, 2), 2 * P.GM_SUN * 2 / 1.495978707e11 ** 3, 1e-12);

/* ---------- 2. the journey: home's time is computed from the crossing ---------- */
const STAY = 10 ** 4.67;                               // the planner's default stay, ship seconds
const orbitAt = (stayS, delta = 1e-20, mSun = 4e6) => ({ ...P.planOrbit({ mSun, delta, stayS, bodyL: 2, craftKg: 1e5 }), mSun, delta });
for (const [label, plan] of [
  ['orbit', orbitAt(STAY)],
  ['hover', P.planHover({ mSun: 6.5e9, f: 1.001, stayS: STAY, bodyL: 2, craftKg: 1e5 })],
  ['flight', P.planFlight({ aG: 1, shipS: 33.1 * P.YEAR, craftKg: 1e5 })],
]) {
  const sum = plan.journey.legs.reduce((s, l) => s + l.homeS, 0);
  near(`${label}: home's time is the sum of the legs`, plan.outsideS, sum, 1e-12);
  ok(`${label}: four or five legs`, plan.journey.legs.length >= 4);
  const maps = P.timeMaps(plan);
  near(`${label}: home(shipS) equals the computed outside time`, maps.home(plan.shipS), plan.outsideS, 1e-6);
}
// the dwell is stay x the closed-form orbital rate (BPT u^t), and the stay is the input
{
  const a = orbitAt(STAY), b = orbitAt(2 * STAY);
  const ut = P.circularOrbit(P.iscoM(1e-20), 1e-20).ut;
  near('orbit: dwell home time = stay x u^t at the ISCO', a.journey.legs[2].homeS, STAY * ut, 1e-12);
  near('orbit: doubling the stay adds exactly one more stay x u^t', b.outsideS - a.outsideS, STAY * ut, 1e-9);
  ok('orbit: a faster spin gives a longer outside time at the same stay', orbitAt(STAY, 1e-22).outsideS > a.outsideS * 4);
  ok('orbit: no outside time is the constant 10,000 years', [1e3, 1e4, 1e5].map((s) => orbitAt(s).outsideYears).every((y, i, arr) => i === 0 || y > arr[i - 1] * 5));
  // the default crossing lands near the story's figure, by computation, not by assignment
  ok('orbit default: about 10,044 years, computed', Math.abs(a.outsideYears - 10044) < 2, `${a.outsideYears}`);
  // the stay that gives exactly the story's years, fed back in, gives them
  const back = orbitAt(P.stayFor(a, 1e4 * P.YEAR));
  near('orbit: stayFor(10,000 yr) round-trips through the leg sum', back.outsideS, 1e4 * P.YEAR, 1e-9);
}
const fl = P.planFlight({ aG: 1, shipS: 33.1 * P.YEAR, craftKg: 1e5 });
for (const l of fl.journey.legs) near(`flight ${l.id}: RK4 against the closed form`, l.homeRK4, l.homeS, 1e-9);
{
  const k = P.C / P.G0;
  near('flight 1 g, 33.1 yr aboard: home time = 4 (c/a) sinh(a tau / 4c)', fl.outsideS, 4 * k * Math.sinh(33.1 * P.YEAR / (4 * k)), 1e-12);
  near('flight: stayFor(10,000 yr) at 1 g is about 33.126 years aboard', P.stayFor(fl, 1e4 * P.YEAR) / P.YEAR, 33.126, 1e-3);
  ok('flight: more time aboard, more outside time', P.planFlight({ aG: 1, shipS: 30 * P.YEAR, craftKg: 1 }).outsideS < fl.outsideS);
}

/* ---------- 3. the world over 20 seeds ---------- */
const orbit = orbitAt(STAY);
const fates = new Set();
const worldPlans = [orbit, orbitAt(STAY * 0.3), orbitAt(STAY * 6)];  // about 3,000, 10,000 and 60,000 years
for (let i = 0; i < 20; i++) {
  const msg = `line number ${i} for home, sent with care`;
  const plan = i % 3 === 2 ? P.planFlight({ aG: 1 + i * 0.05, shipS: 33.1 * P.YEAR, craftKg: 1e5 }) : worldPlans[i % 4 === 3 ? 1 : i % 5 === 4 ? 2 : 0];
  const w = buildWorld(plan, msg), w2 = buildWorld(plan, msg);
  const T = plan.outsideS / P.YEAR;
  ok(`world ${i}: same inputs give the same world`, JSON.stringify(w) === JSON.stringify(w2));
  fates.add(w.fate);
  ok(`world ${i}: its years are the crossing's computed years`, w.years === T, `${w.years} vs ${T}`);
  ok(`world ${i}: eras are ordered and span 0 to the computed ${Math.round(T)}`, w.eras[0].from === 0 && w.eras[w.eras.length - 1].to === T && w.eras.every((e, j) => j === 0 || e.from === w.eras[j - 1].to && e.from > w.eras[j - 1].from));
  ok(`world ${i}: TALLY answered in the era after the people`, w.answer.year >= w.eras[5].from && w.answer.year <= T);
  ok(`world ${i}: ship log times lie inside the crossing`, w.shipLog.every((l) => l.tau >= 0 && l.tau <= plan.shipS * (1 + 1e-9)));
  near(`world ${i}: the carrier home heard is the sent carrier over the factor`, w.beacon.carrierMinHz * w.plan.factorMax, w.beacon.carrierHz, 1e-9);

  /* ---------- 4. the story agrees with its world ---------- */
  const F = buildFacts(w);
  const sayAll = Object.values(F).flatMap((f) => Object.values(f.say)).join(' ') + ' ' + LINES.opening(w);
  ok(`world ${i}: the story names the computed ${Math.round(T)} years`, sayAll.includes(`${Math.round(T).toLocaleString('en-US')} years`));
  if (Math.round(T) !== 10000) ok(`world ${i}: no line claims ten thousand years`, !/ten thousand|10,000 years/i.test(sayAll), sayAll.match(/.{40}(ten thousand|10,000 years).{20}/i)?.[0]);
  const allowedYears = new Set([...w.eras.flatMap((e) => [e.from, e.to]), w.answer.year, w.fateD.departYear, w.fateD.arriveYear, w.fateD.lastYear, w.message.arriveYear, w.beacon.peakYear].filter((x) => x != null).map(Math.round));
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

/* ---------- 7. schema ---------- */
for (const seedMsg of ['schema one', 'schema two', 'schema three']) {
  const w = buildWorld(orbit, seedMsg);
  const errs = validateStory(buildFacts(w), ACTS, w);
  ok(`schema: the story validates (${w.fate})`, errs.length === 0, errs.join('; '));
}
// every act is reached in some offline run across fates
const reached = new Set();
for (let i = 0; i < 24; i++) {
  const w = buildWorld(orbit, `Tell them the sky down here is full of light, reach ${i}`);
  const mm = new Mind(w); mm.opening();
  for (const q of script) mm.respond(q === 'Tell them the sky down here is full of light.' ? `Tell them the sky down here is full of light, reach ${i}` : q);
  mm.acts().forEach((a) => reached.add(a.id));
  const hm = new Mind(w); hm.opening();
  ['stupid', 'stupid', 'stupid', 'stupid', 'stupid', 'stupid'].forEach((q) => hm.respond(q));
  hm.acts().forEach((a) => reached.add(a.id));
}
for (const a of ACTS) ok(`schema: act ${a.id} is reachable offline`, reached.has(a.id));
// TALLY's sentences respect its voice's length rule
const maxW = VOICES.tally.maxSentenceWords;
for (const t of texts) for (const sent of t.split(/(?<=[.?])\s+/)) ok(`voice: sentence under ${maxW} words`, sent.split(/\s+/).length <= maxW, sent.slice(0, 80));

/* ---------- 8. the witness record carries the computed outside time ---------- */
for (const plan of [orbit, orbitAt(STAY * 0.3)]) {
  const w = buildWorld(plan, 'record check');
  const mm = new Mind(w); mm.opening();
  const rec = buildRecord({ world: w, plan, mind: mm, transcript: [], ending: null, url: 'test', version: 'test' });
  near(`record: home_years is the computed ${Math.round(w.years)}`, rec.json.clocks.home_years, plan.outsideS / P.YEAR, 1e-12);
  ok('record: the story figure is kept apart from the result', rec.json.clocks.story_years === LAB.storyYears && rec.json.clocks.home_years !== LAB.storyYears);
  ok('record: the text names the computed years', rec.text.includes(`home   ${fmtInt(w.years)} years`));
  ok('record: a different figure is said plainly', Math.round(w.years) === LAB.storyYears || /not the 10,000|more than the 10,000|less than the 10,000/.test(rec.text));
}

/* ---------- 9. the validator keeps each clock with its owner ---------- */
near('durations: "14 hours 26 minutes" is one span', durations('gone 14 hours 26 minutes by your clock')[0].s, 14 * 3600 + 26 * 60, 1e-12);
ok('durations: an exponent is not a year count', durations('a ratio of 1.06e4 years').length === 0);
for (const [label, plan] of [['orbit', orbit], ['flight', P.planFlight({ aG: 1, shipS: 33.1 * P.YEAR, craftKg: 1e5 })]]) {
  const wv = buildWorld(plan, 'Tell them the sky down here is full of light.');
  const mv = new Mind(wv); mv.opening();
  const q = 'How long was I gone?';
  const plan1 = mv.respond(q);
  const SHIP = fmtDur(wv.plan.shipS), YEARS = `${fmtInt(wv.years)} years`, PER = fmtDur(wv.plan.D);
  ok(`${label} validator: the draft names both clocks`, plan1.text.includes(SHIP) && plan1.text.includes(YEARS), plan1.text);
  const reply = (text) => mv.validate({ reply: text, intent: 'time', trust_delta: 0 }, plan1, q);
  // the rater's reply: both totals swapped, and the per-second rate turned round
  const both = reply(`You were gone ${YEARS} by your clock and ${SHIP} by mine. Every second here was ${PER} for you.`);
  ok(`${label} validator: a reply that swaps the two clocks is rejected`, !both.ok && /^clock/.test(both.why), JSON.stringify(both));
  const totals = reply(`Your clock: ${YEARS}. Mine: ${SHIP}.`);
  ok(`${label} validator: swapped totals alone are rejected`, !totals.ok && /^clock/.test(totals.why), JSON.stringify(totals));
  const rate = reply(`You were gone ${SHIP} by your clock and ${YEARS} by mine. Every second here was ${PER} for you.`);
  ok(`${label} validator: a turned-round rate alone is rejected`, !rate.ok && /^clock/.test(rate.why), JSON.stringify(rate));
  const words = reply(`You were gone ${SHIP} by your clock and ten thousand years by mine.`);
  ok(`${label} validator: a figure spelled in words is refused`, !words.ok, JSON.stringify(words));
  const faithful = reply(`By your clock you were away ${SHIP}. Here, ${YEARS} went by. Each second you lived was ${PER} here.`);
  ok(`${label} validator: a faithful rephrase of both clocks is accepted`, faithful.ok, JSON.stringify(faithful));
  // no false refusals: every sentence the engine itself can say keeps its clocks
  const own = [...Object.values(mv.F).flatMap((f) => Object.values(f.say)), LINES.opening(wv), LINES.answerToMine.how_long(wv), ...LINES.demand(wv), ...LINES.unknown(wv)];
  const bad = own.map((t) => [t, clockSwap(t, mv.clockValues())]).filter(([, s]) => s);
  ok(`${label} validator: none of the engine's ${own.length} lines trips the clock check`, bad.length === 0, bad.map(([t, s]) => `${s.why} :: ${t.slice(0, 90)}`).join(' | '));
}

/* ---------- 10. disclosure depends on what the visitor asks ---------- */
const STATEMENTS = ['I miss my family.', 'I remember the launch.', 'I was afraid the whole way down.', 'I left a daughter here.',
  'I wanted to see the light bend.', 'I loved the station.', 'I thought I would be gone a day.', 'I have your name written on my hand.',
  'My mother built the first antenna.', 'I feel the weight of it now.', 'I wish I had stayed.', 'I hoped someone would be waiting.',
  'The people I knew are gone.', 'There was a noise burst in my log.', 'You lied to me.', 'I know the pulse was my heart.',
  'I remember why I went.', 'I am tired.'];
const GATED = ['answer', 'stay', 'release'];
let gatedWorlds = 0;
for (let i = 0; i < 6; i++) {
  const plan = i === 5 ? P.planFlight({ aG: 1, shipS: 33.1 * P.YEAR, craftKg: 1e5 }) : orbit;
  const w = buildWorld(plan, `statements only, world ${i}`);
  const m = new Mind(w); m.opening();
  for (const st of STATEMENTS) m.respond(st);
  const toldHigh = Object.values(m.F).filter((f) => f.level >= 2 && f.told).map((f) => f.id);
  ok(`statements only (${w.fate}): trust rose, so the gate is the asking`, m.trustLevel() >= 3, `trust ${m.s.trust.toFixed(2)}`);
  ok(`statements only (${w.fate}): disclosure stays at surface`, m.level() === 0, `level ${m.level()} gates ${[...m.s.gates]}`);
  ok(`statements only (${w.fate}): no fact above the record is told`, toldHigh.length === 0, toldHigh.join(','));
  const acts = m.acts().map((a) => a.id);
  ok(`statements only (${w.fate}): no gated ending is offered`, !acts.some((a) => GATED.includes(a)), acts.join(','));
  // the same visitor now asks; the tiers open and the endings follow
  for (const qq of ['Who are you?', 'What is the pulse?', 'What happened to the people?', 'Why are you still awake?', 'What is the noise burst in my log?']) m.respond(qq);
  const acts2 = m.acts().map((a) => a.id);
  const want = w.fate === 'thinning' ? ['stay', 'release'] : ['answer', 'stay', 'release'];
  ok(`then asking (${w.fate}): reaches disclosure 4`, m.level() === 4, `level ${m.level()}`);
  ok(`then asking (${w.fate}): the gated endings open`, want.every((a) => acts2.includes(a)), acts2.join(','));
  if (want.every((a) => acts2.includes(a))) gatedWorlds++;
}
ok('asking opens the gated endings on all 6 worlds', gatedWorlds === 6, `${gatedWorlds}`);
{
  // a request to be told counts as asking; a lie is never told on a statement
  const m = new Mind(buildWorld(orbit, 'requests')); m.opening();
  m.respond('There was a noise burst in my log.');
  ok('a statement about the log draws no lie', !m.F.answer_lie.told);
  m.respond('Tell me about you, TALLY.');
  ok('"tell me ..." opens the tier it asks about', m.s.gates.has(1));
}

console.log(`last-witness tests: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
