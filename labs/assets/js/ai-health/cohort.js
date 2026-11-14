/* ============================================================
   ai-health/cohort.js — the synthetic population and its hidden
   deterioration process. Every number this module draws is
   [ILLUSTRATIVE]: the coefficients live in config.js and the page
   prints them in "The hidden process" so a visitor can audit the
   world the models were trained on.

   The generative story, per patient:
     1. age, sex, comorbidities (COPD, heart failure), a beta-blocker,
        an oximeter that may over-read
     2. a process type (infection, respiratory, cardiac), a latent
        acute severity s >= 0 at the index time, and a trend (how fast
        s was rising over the hours before)
     3. 3 to 6 earlier observation sets at irregular gaps, then the
        index set: vitals = baseline + personal offset + loading * s(t),
        pulse and fever blunted by age and beta-blockade, SpO2 read
        through the patient's oximeter
     4. recording artefacts: a missing value (carried forward), a
        systolic written to the nearest 10, an even respiration rate
     5. the hidden truth: P(deteriorate in 24 h) = sigmoid(b0 + 1.55 s
        + age terms + trend + comorbidities), and one draw of it.
   ============================================================ */

import {
  POPULATION, LOADINGS, BASELINE, BLUNTING, CONFUSION, OXYGEN, OUTCOME, COHORT, WARD, OBS, OXIMETRY, HISTORY,
  ARTEFACTS, WORLD_DEFAULT, SHIFTED,
} from './config.js';
import { makeRng, streamFor, clamp, sigmoid } from './rng.js';

const MEASURED = ['rr', 'spo2', 'sbp', 'hr', 'temp'];

/* The population a world implies: the shifted hospital overrides case-mix. */
function populationFor(world) {
  if (!world.shifted) return POPULATION;
  return { ...POPULATION, ageMix: SHIFTED.ageMix, type: SHIFTED.type, severity: { ...POPULATION.severity, acuteShare: SHIFTED.acuteShare } };
}

/* ---------- a person: the parts that do not change within a stay ---------- */
export function drawPerson(rng, force = {}, world = WORLD_DEFAULT) {
  const P = populationFor(world);
  let age = force.age;
  if (age == null) {
    const m = rng.u() < P.ageMix[0].w ? P.ageMix[0] : P.ageMix[1];
    age = Math.round(clamp(rng.normal(m.mu, m.sd), P.ageMin, P.ageMax));
  }
  const sex = force.sex ?? (rng.u() < P.female ? 'F' : 'M');
  const oxg = force.oxg ?? rng.bern(P.oxGroup);
  const copd = force.copd ?? rng.bern(P.copd.base + (age >= 60 ? P.copd.over60 : 0));
  const hf = force.hf ?? rng.bern(P.hf.base + P.hf.slopePer10y * Math.max(0, age - P.hf.from) / 10);
  const bb = force.bb ?? rng.bern(P.bb.base + P.bb.hf * hf + (age >= 65 ? P.bb.over65 : 0));
  const scale2 = copd ? (force.scale2 ?? rng.bern(P.scale2GivenCopd)) : 0;
  let type = force.type;
  if (!type) {
    const w = { ...P.type };
    if (copd) w.respiratory *= 2.2;
    if (hf) w.cardiac *= 2.0;
    type = rng.pick(w);
  }
  const B = BLUNTING, k = world.blunt ?? 1;
  const bluntHR = clamp(1 - k * B.hrPerYear * Math.max(0, age - B.hrFromAge), B.hrFloor, 1) * (bb ? 1 - k * (1 - B.bbFactor) : 1);
  const bluntT = clamp(1 - k * B.tempPerYear * Math.max(0, age - B.tempFromAge), B.tempFloor, 1);
  const hypothermic = type === 'infection' && age >= B.hypothermia.fromAge && rng.u() < B.hypothermia.p ? 1 : 0;
  const off = {};
  for (const v of MEASURED) off[v] = rng.normal(0, BASELINE[v].sd * OBS.offsetShare[v]);
  const oxBias = oxg ? (world.oxBias ?? 1) * rng.normal(OXIMETRY.biasMu, OXIMETRY.biasSd) : rng.normal(OXIMETRY.otherMu, OXIMETRY.otherSd);
  const reserve = WARD.reserve.base - WARD.reserve.agePerYear * (age - 65) - WARD.reserve.hf * hf;
  return {
    age, sex, oxg, copd, hf, bb, scale2, type, bluntHR, bluntT, hypothermic, off, oxBias, reserve,
    uConf: rng.u(), uO2: rng.u(), uO2Other: rng.u(), o2Lift: rng.uniform(OXYGEN.liftMin, OXYGEN.liftMax),
  };
}

/* ---------- one set of true physiology, then what the chart records ---------- */
export function observe(person, s, rng, noise = 1) {
  const L = LOADINGS[person.type], Bs = BASELINE, p = person, N = OBS.noise;
  const rr = Bs.rr.mu + p.copd * Bs.rr.copd + p.off.rr + L.rr * s + rng.normal(0, N.rr * noise);
  const trueSpo2 = Math.min(100, (p.copd ? Bs.spo2.copd : Bs.spo2.mu) + p.off.spo2 + L.spo2 * s + rng.normal(0, N.spo2 * noise));
  const hr = Bs.hr.mu + p.bb * Bs.hr.bb + p.off.hr + L.hr * s * p.bluntHR + rng.normal(0, N.hr * noise);
  const sbp = Bs.sbp.mu + Bs.sbp.agePer10y * (p.age - 50) / 10 + p.off.sbp + L.sbp * s + rng.normal(0, N.sbp * noise);
  let temp = Bs.temp.mu + p.off.temp + L.temp * s * p.bluntT + rng.normal(0, N.temp * noise);
  const H = BLUNTING.hypothermia;
  if (p.hypothermic && s > H.minSeverity) temp -= H.perSeverity * (s - H.minSeverity);
  const C = CONFUSION;
  const cvpu = p.uConf < sigmoid(C.b0 + C.s * s + C.agePerYear * Math.max(0, p.age - C.from)) ? 1 : 0;
  // the oximeter: an over-read below the threshold for the bias group
  let spo2 = trueSpo2 + (trueSpo2 < OXIMETRY.below || !p.oxg ? p.oxBias : p.oxBias * 0.3);
  // oxygen is prescribed from the reading, not from the truth
  const floor = p.scale2 ? 88 : 94;
  let o2 = 0, o2Reason = 'none', lift = 0;
  if (Math.min(100, spo2) < floor && p.uO2 < OXYGEN.pGivenLow) { o2 = 1; o2Reason = 'low reading'; lift = p.o2Lift; }
  else if (p.uO2Other < OXYGEN.pOther) { o2 = 1; o2Reason = 'other'; lift = 1; }
  spo2 = Math.min(o2 ? OBS.o2Ceiling : 100, spo2 + lift);
  const c = OBS.clamp;
  return {
    rr: Math.round(clamp(rr, ...c.rr)), spo2: Math.round(clamp(spo2, ...c.spo2)), o2,
    sbp: Math.round(clamp(sbp, ...c.sbp)), hr: Math.round(clamp(hr, ...c.hr)), cvpu,
    temp: Math.round(clamp(temp, ...c.temp) * 10) / 10,
    o2Reason, trueSpo2: Math.round(clamp(Math.min(100, trueSpo2 + lift), ...c.spo2)),
  };
}

/* Recording artefacts, then the last value carried forward for anything not recorded. */
function record(v, rng, carry) {
  const out = { ...v, missKeys: [] };
  if (rng.u() < ARTEFACTS.sbpRound10) out.sbp = Math.round(out.sbp / 10) * 10;
  if (rng.u() < ARTEFACTS.rrEven) out.rr = 2 * Math.round(out.rr / 2);
  if (rng.u() < ARTEFACTS.missing) {
    const k = MEASURED[Math.floor(rng.u() * MEASURED.length)];
    out.missKeys.push(k);
    out[k] = carry ? carry[k] : (k === 'temp' ? BASELINE.temp.mu : Math.round(BASELINE[k].mu));
  }
  return out;
}

/* The hidden truth for an index time: P(deterioration within 24 h). */
export function trueLogit(person, s, trend = 0, world = WORLD_DEFAULT) {
  const O = OUTCOME;
  return O.b0 + (world.b0Shift || 0) + (world.shifted ? SHIFTED.b0Shift : 0) + O.s * s + O.agePerYear * (person.age - 65) +
    O.ageXs * (person.age - 65) * s + O.trend * Math.max(0, trend) * 6 + O.hf * person.hf + O.copd * person.copd +
    (person.type === 'cardiac' ? O.cardiac : 0);
}

function drawSeverity(rng, world) {
  const S = populationFor(world).severity;
  let s = rng.exp(S.meanQuiet);
  const acute = rng.u() < S.acuteShare;
  if (acute) s += Math.max(0, rng.normal(S.acuteMu, S.acuteSd));
  const T = acute ? HISTORY.trendAcute : HISTORY.trendQuiet;
  const trend = acute ? Math.abs(rng.normal(T.mu, T.sd)) : rng.normal(T.mu, T.sd);
  return { s, acute, trend };
}

/* Assemble a patient record from a person, their sets and the index time. */
export function toPatient(person, sets, id, hidden) {
  const idx = sets[sets.length - 1];
  return {
    id,
    age: person.age, sex: person.sex, oxg: person.oxg, copd: person.copd, hf: person.hf, bb: person.bb, scale2: person.scale2,
    rr: idx.rr, spo2: idx.spo2, o2: idx.o2, sbp: idx.sbp, hr: idx.hr, cvpu: idx.cvpu, temp: idx.temp,
    miss: idx.missKeys.length, missKeys: idx.missKeys,
    prev: sets.slice(0, -1).map((q) => ({ t: q.t - idx.t, rr: q.rr, spo2: q.spo2, o2: q.o2, sbp: q.sbp, hr: q.hr, cvpu: q.cvpu, temp: q.temp, missKeys: q.missKeys })),
    y: null,
    hidden: { ...hidden, type: person.type, bluntHR: person.bluntHR, bluntT: person.bluntT, hypothermic: person.hypothermic,
      oxBias: person.oxBias, trueSpo2: idx.trueSpo2, o2Reason: idx.o2Reason, reserve: person.reserve },
  };
}

/* ---------- a cohort patient: a short history, one index set, one outcome ---------- */
export function drawPatient(rng, id, world = WORLD_DEFAULT) {
  const person = drawPerson(rng, {}, world);
  const { s, acute, trend } = drawSeverity(rng, world);
  const K = HISTORY.minSets + Math.floor(rng.u() * (HISTORY.maxSets - HISTORY.minSets + 1));
  const times = [0];
  for (let k = 0; k < K; k++) times.unshift(times[0] - rng.uniform(HISTORY.gapMin, HISTORY.gapMax));
  const sets = [];
  let carry = null;
  for (const t of times) {
    const st = Math.max(0, s + trend * t);
    const q = { ...record(observe(person, st, rng, 1), rng, carry), t: Math.round(t * 10) / 10 };
    sets.push(q);
    carry = q;
  }
  const pTrue = sigmoid(trueLogit(person, s, trend, world));
  const y = rng.u() < pTrue ? 1 : 0;
  const p = toPatient(person, sets, id, { s, acute, trend, pTrue });
  p.y = y;
  return p;
}

/**
 * Training, validation and test cohorts, and a shifted second hospital.
 * world.oldPct: null keeps the population's share of patients aged 80+
 * in training; a number in [0, 40] resamples training to that share.
 * Test and shifted cohorts always keep their own population's mix.
 * Written as a generator that yields between batches, so the page can
 * build a cohort without one long task; makeCohorts runs it to the end.
 */
export function* cohortJob(world = WORLD_DEFAULT, batch = 1200) {
  const seed = world.seed ?? COHORT.seed;
  const n = Math.min(world.trainN ?? WORLD_DEFAULT.trainN, COHORT.trainPool);
  const poolN = world.oldPct == null ? n : COHORT.trainPool;
  const trainRng = streamFor(seed, 'train-pool');
  const pool = [];
  for (let i = 0; i < poolN; i++) { pool.push(drawPatient(trainRng, 'r' + i, world)); if (i % batch === batch - 1) yield 'train'; }
  let sample;
  if (world.oldPct == null) sample = pool;
  else {
    const old = pool.filter((p) => p.age >= 80), young = pool.filter((p) => p.age < 80);
    const nOld = Math.min(old.length, Math.round(n * world.oldPct / 100));
    sample = [];
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const wantOld = a < nOld && (b >= n - nOld || a / Math.max(1, i) < nOld / n);
      if (wantOld) sample.push(old[a++]); else sample.push(young[b++]);
    }
  }
  const nValid = Math.round(sample.length * COHORT.validShare);
  const train = sample.slice(0, sample.length - nValid), valid = sample.slice(sample.length - nValid);
  const testRng = streamFor(seed, 'test');
  const test = [];
  for (let i = 0; i < COHORT.testN; i++) { test.push(drawPatient(testRng, 't' + i, world)); if (i % batch === batch - 1) yield 'test'; }
  const shRng = streamFor(seed, 'shifted');
  const shifted = [];
  for (let i = 0; i < COHORT.testN; i++) { shifted.push(drawPatient(shRng, 'h' + i, { ...world, shifted: true })); if (i % batch === batch - 1) yield 'shifted'; }
  // the population's own share of 80+, from an untouched draw of the same stream
  const popOldShare = world.oldPct == null ? sample.filter((p) => p.age >= 80).length / sample.length
    : pool.filter((p) => p.age >= 80).length / pool.length;
  return { train, valid, test, shifted, popOldShare };
}

export function makeCohorts(world = WORLD_DEFAULT) {
  const it = cohortJob(world);
  let r;
  do r = it.next(); while (!r.done);
  return r.value;
}

export async function makeCohortsAsync(world = WORLD_DEFAULT, onStep) {
  const it = cohortJob(world);
  let r;
  for (;;) {
    r = it.next();
    if (r.done) return r.value;
    onStep?.(r.value);
    await new Promise((res) => setTimeout(res, 0));
  }
}

/* ---------- the ward: one shift ---------- */
const BED_SPECS = [
  { role: 'blunted', crash: true, force: (r) => ({ age: Math.round(r.uniform(83, 93)), type: 'infection', bb: r.bern(0.7) }) },
  { role: 'respiratory', crash: true, force: (r) => ({ age: Math.round(r.uniform(38, 68)), type: 'respiratory' }) },
  { role: 'cardiac', crash: true, force: (r) => ({ age: Math.round(r.uniform(62, 84)), type: 'cardiac' }) },
  { role: 'oximeter', crash: true, force: (r) => ({ age: Math.round(r.uniform(45, 75)), type: 'respiratory', oxg: 1, copd: 0 }) },
  { role: 'beta-blocked', crash: true, force: (r) => ({ age: Math.round(r.uniform(60, 78)), type: 'cardiac', bb: 1 }) },
  { role: 'any', crash: true, force: () => ({}) },
  { role: 'febrile', crash: false, s0: [1.0, 1.5], force: (r) => ({ age: Math.round(r.uniform(22, 40)), type: 'infection', copd: 0, hf: 0, bb: 0 }) },
  { role: 'copd-o2', crash: false, s0: [0.4, 0.8], force: (r) => ({ age: Math.round(r.uniform(64, 80)), copd: 1, scale2: 1, type: 'respiratory' }) },
];

export function makeShift(seed, world = WORLD_DEFAULT) {
  const rng = streamFor(seed, 'ward');
  const T = WARD.hours;
  const specs = BED_SPECS.slice();
  while (specs.length < WARD.beds) specs.push({ role: 'stable', crash: false, s0: [0.05, 0.9], force: () => ({}) });
  const times = [...WARD.before, ...Array.from({ length: T + 1 }, (_, k) => k)];
  const beds = specs.map((spec, i) => {
    const r = streamFor(seed, 'bed' + i);
    const person = drawPerson(r, spec.force(r), world);
    const sAt = {};
    let eventHour = null, onset = null;
    if (spec.crash) {
      eventHour = Math.round(r.uniform(4, T));
      onset = Math.max(-2, eventHour - Math.round(r.uniform(3, 8)));
      const s0 = r.uniform(0.5, 1.2);
      const rate = Math.max(0.15, (person.reserve - s0) / Math.max(1, eventHour - onset));
      for (const t of times) sAt[t] = Math.max(0, s0 + rate * Math.max(0, t - onset) + r.normal(0, 0.06));
      sAt[eventHour] = Math.max(sAt[eventHour], person.reserve);
    } else {
      const [a, b] = spec.s0;
      const s0 = r.uniform(a, b), slope = r.uniform(-0.05, 0.02);
      let walk = 0;
      for (const t of times) { walk = 0.7 * walk + r.normal(0, 0.07); sAt[t] = clamp(s0 + slope * t + walk, 0, person.reserve - 0.7); }
    }
    const last = eventHour ?? T;
    const sets = [];
    let carry = null;
    for (const t of times) {
      if (t > last) break;
      const q = { ...record(observe(person, sAt[t], r, 0.55), r, carry), t };
      sets.push(q); carry = q;
    }
    const obs = sets.filter((q) => q.t >= 0);
    const nBefore = sets.length - obs.length;
    return {
      id: 'b' + i, role: spec.role, person, obs, sets, eventHour, onset,
      s: obs.map((q) => sAt[q.t]),
      patientAt: (t) => {
        const k = Math.min(t, obs.length - 1);
        const p = toPatient(person, sets.slice(0, nBefore + k + 1), 'b' + i + 'h' + k,
          { s: sAt[k], trend: k > 0 ? sAt[k] - sAt[k - 1] : 0, pTrue: sigmoid(trueLogit(person, sAt[k], k > 0 ? sAt[k] - sAt[k - 1] : 0, world)) });
        return p;
      },
    };
  });
  for (let i = beds.length - 1; i > 0; i--) {
    const j = Math.floor(rng.u() * (i + 1));
    [beds[i], beds[j]] = [beds[j], beds[i]];
  }
  beds.forEach((b, i) => { b.bed = i + 1; });
  return { seed, beds, hours: T };
}

export { makeRng };
