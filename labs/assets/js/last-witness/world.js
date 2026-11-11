/* ============================================================
   last-witness/world.js — the world you come back to.

   Deterministic: the same crossing and the same line for home give
   the same world. Everything numeric about it is derived from the
   crossing's physics (the beacon's stretch, the carrier's drop, the
   antenna that could hear it); everything cultural is drawn from a
   seeded grammar and tagged [ILLUSTRATIVE] on the page.
   ============================================================ */

import { LAB, FATE_WEIGHTS, PHON, LAST_NAMES } from './config.js';
import { YEAR, C, timeMaps, beaconAtHome } from './physics.js';

/* xmur3 string hash -> 32-bit seed; mulberry32 generator. */
export function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];
const between = (R, lo, hi) => lo + (hi - lo) * R();

function weighted(R, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  let x = R() * sum;
  for (const [k, w] of entries) { if ((x -= w) <= 0) return k; }
  return entries[entries.length - 1][0];
}

function word(R) {
  for (let tries = 0; tries < 40; tries++) {
    const syl = () => pick(R, PHON.onset) + pick(R, PHON.vowel) + pick(R, PHON.coda);
    const w = syl() + syl();
    if (w.length < 4 || w.length > 9) continue;
    if (PHON.banned.some((b) => w.includes(b))) continue;
    return w[0].toUpperCase() + w.slice(1);
  }
  return 'Tomeil';
}

/* Invert a monotonic map f on [0, hi] by bisection. */
function invert(f, target, hi) {
  let lo = 0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function buildWorld(plan, message) {
  const msg = (message || '').trim() || LAB.defaultMessage;
  const seed = hashStr([plan.method, plan.D.toPrecision(6), msg.toLowerCase()].join('|'));
  const R = rng(seed);
  const T = LAB.outsideYears;
  const maps = timeMaps(plan);
  const beacon = beaconAtHome(plan, { heartHz: LAB.heartHz, carrierHz: LAB.carrierHz });
  const flight = plan.method === 'flight';

  /* ---- the beacon, as home received it [REAL: computed] ---- */
  const beatS = 1 / LAB.heartHz;
  const factorMax = beacon.factorMax;
  // the line for home is sent from the deepest point of the crossing
  const msgTau = flight ? plan.tauQ : plan.journey.legs[2].ship0 + 1;
  const msgFactor = maps.rate(msgTau);
  const msgBits = new TextEncoder().encode(msg).length * 8;
  const msgEmitS = msgBits / LAB.bitRate;
  const msgSpanS = msgEmitS * msgFactor;
  const msgArriveYear = maps.rx(msgTau) / YEAR;
  const carrierMinHz = beacon.carrierMinHz;
  const halfWaveM = beacon.halfWaveM;

  /* ---- the eras [ILLUSTRATIVE: seeded] ---- */
  const y1 = Math.round(between(R, 140, 320));
  const y2 = Math.round(between(R, 1400, 2500));
  const y3 = Math.round(y2 + between(R, 1500, 2600));
  const y4 = Math.round(Math.min(8200, y3 + between(R, 1400, 2600)));
  const reading = R() < (flight ? 0.35 : 0.55) ? 'reverence' : 'dread';
  const fw = { ...FATE_WEIGHTS[plan.method] };
  if (reading === 'dread') { fw.hush *= 1.6; fw.thinning *= 1.2; } else { fw.going *= 1.5; fw.slowing *= 1.4; }
  const fate = weighted(R, fw);
  let y5 = Math.round(Math.min(9700, y4 + between(R, 300, Math.max(400, 9700 - y4))));
  const pulseWord = word(R);
  const lastName = pick(R, LAST_NAMES);


  /* ---- the listening line: an array of half-wave elements tuned to the
     lowest carrier that ever arrived [REAL: c / 2f; element count ILLUSTRATIVE] ---- */
  const elements = flight ? Math.round(between(R, 1400, 2600)) : Math.round(between(R, 18, 42));
  const lineKm = elements * halfWaveM / 1000;
  const planetKm = 6371;                       // home is Earth-sized [ILLUSTRATIVE]
  const line = {
    elements, elementM: halfWaveM, lengthKm: lineKm,
    lat: between(R, -28, 28), lon: between(R, -150, 150), az: between(R, 20, 160),
    lenRad: Math.min(1.1, lineKm / planetKm),
    built: flight ? 'grown' : 'planned',
  };

  /* ---- the fate's own numbers ---- */
  const fateD = {};
  if (fate === 'hush') {
    fateD.shafts = Math.round(between(R, 12, 40));
    fateD.depthKm = Math.round(between(R, 2, 5) * 10) / 10;
    fateD.heatMW = Math.round(between(R, 1.5, 9) * 10) / 10;
  } else if (fate === 'going') {
    fateD.ships = Math.round(between(R, 3, 30));
    fateD.speedC = Math.round(between(R, 0.004, 0.02) * 1000) / 1000;
    fateD.distLy = 0.6;                        // the hole sits 0.6 light-years out [ILLUSTRATIVE]
    fateD.departYear = y4 + Math.round(between(R, 20, 200));
    fateD.arriveYear = Math.round(fateD.departYear + fateD.distLy / fateD.speedC);
    fateD.lastYear = fateD.arriveYear + Math.round(fateD.distLy) + Math.round(between(R, 3, 40));
  }
  if (fate === 'going' && fateD.lastYear > y5) y5 = fateD.lastYear; else if (fate === 'slowing') {
    // they slowed their minds by the beacon's own factor, so your beat felt like a heartbeat
    fateD.factor = factorMax;
    fateD.subjectiveS = (T - y4) * YEAR / factorMax;
    fateD.cities = Math.round(between(R, 3, 9));
    fateD.lightPeriodMin = Math.max(2, Math.round(between(R, 6, 40)));
  } else {
    fateD.lastYear = y5;
    fateD.peak = Math.round(between(R, 40, 900)) * 1e6;
  }

  const eras = [
    { id: 'watch', from: 0, to: y1, name: 'the Watch' },
    { id: 'count', from: y1, to: y2, name: 'the Count' },
    { id: 'argument', from: y2, to: y3, name: 'the Argument' },
    { id: reading, from: y3, to: y4, name: reading === 'reverence' ? 'the Reverence' : 'the Dread' },
    { id: fate, from: y4, to: y5, name: { hush: 'the Hush', going: 'the Going', slowing: 'the Slowing', thinning: 'the Thinning' }[fate] },
    { id: 'after', from: y5, to: T, name: 'After' },
  ];

  /* ---- TALLY's answer: sent in the quiet after, on the same line.
     Blueshifted by the factor at the moment it reached you, it landed
     in your receiver's own band, compressed to one second [REAL]. ---- */
  const answerYear = Math.round(y5 + between(R, 0.15, 0.85) * (T - y5));
  const answerTau = invert(maps.seen, answerYear * YEAR, plan.shipS);
  const answerFactor = maps.rate(answerTau);
  const answerSpanShipS = 1;                   // what TALLY wanted you to hear: one second
  const answerSpanHomeS = answerSpanShipS * answerFactor;
  const answerWords = pick(R, ['Heard you. Still counting.', 'We hear you. Come home.', 'Still here. Still counting.', 'Heard. Come home.']);
  const powerGain = answerFactor * answerFactor;

  /* ---- what the ship saw of home on the way (era boundaries in its log) ---- */
  const shipLog = eras.slice(1).map((e) => ({
    id: 'era-' + e.id,
    tau: invert(maps.seen, e.from * YEAR, plan.shipS),
    year: e.from,
    text: e.id === 'after' ? 'home falls silent except one carrier' : 'home signal changes character',
    eraId: e.id,
  }));
  shipLog.push({ id: 'answer', tau: answerTau, year: answerYear, text: 'noise burst in the X-band receiver', anomaly: true });
  shipLog.sort((a, b) => a.tau - b.tau);

  const planet = {
    ocean: between(R, 0.52, 0.7),
    iceLat: Math.round(between(R, 46, 64)),
    seedX: between(R, 0, 100), seedY: between(R, 0, 100),
    tilt: between(R, 0.18, 0.42),
    station: { lat: line.lat, lon: line.lon },
    fateMark: fate === 'hush' ? { lat: between(R, 50, 64) * (R() < 0.5 ? 1 : -1), lon: between(R, -150, 150) }
      : fate === 'going' ? { lat: between(R, -6, 6), lon: between(R, -150, 150) } : null,
  };

  return {
    seed, method: plan.method, years: T, msg,
    plan: {
      D: plan.D, shipS: plan.shipS, factorMax,
      mSun: plan.mSun, delta: plan.delta, aG: plan.aG,
      periodFarS: plan.periodFarS, gammaMax: plan.gammaMax, xMaxLy: plan.xMaxLy, tauQ: plan.tauQ,
    },
    beacon: {
      beatS, beatsSent: beacon.beatsSent, beatMaxS: beatS * factorMax,
      carrierHz: LAB.carrierHz, carrierMinHz, halfWaveM,
      profile: flight ? 'slowing-then-quickening' : 'steady',
      lastBurstYears: flight ? (T - maps.rx(2 * plan.tauQ) / YEAR) : 0,
      samples: beacon.samples,
    },
    message: { text: msg, bits: msgBits, emitS: msgEmitS, spanS: msgSpanS, arriveYear: msgArriveYear, factor: msgFactor },
    eras, reading, fate, fateD, pulseWord, lastName,
    line, planet,
    answer: { year: answerYear, tau: answerTau, factor: answerFactor, spanHomeS: answerSpanHomeS, words: answerWords,
      powerGain, rxHz: carrierMinHz * answerFactor },
    aloneYears: T - y5,
    lastBeatDays: flight ? 0 : Math.round(between(R, 4, 19)),
    shipLog,
  };
}

/* Short human names for numbers and durations. */
export function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }

export function fmtDur(s, { short = false } = {}) {
  if (!Number.isFinite(s)) return 'forever';
  const y = s / YEAR;
  if (y >= 2) {
    const yy = Math.floor(y), mm = Math.floor((y - yy) * 12);
    if (y >= 1000) return fmtSci(y) + (short ? ' yr' : ' years');
    return short ? `${yy} yr ${mm} mo` : `${yy} years ${mm} month${mm === 1 ? '' : 's'}`;
  }
  const d = s / 86400;
  if (d >= 2) return short ? `${d.toFixed(0)} d` : `${Math.round(d)} days`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (h >= 1) return short ? `${h} h ${m} min` : `${h} hour${h === 1 ? '' : 's'} ${m} minute${m === 1 ? '' : 's'}`;
  if (m >= 1) return short ? `${m} min ${sec} s` : `${m} minute${m === 1 ? '' : 's'} ${sec} second${sec === 1 ? '' : 's'}`;
  if (s >= 1) return `${s.toFixed(1)} s`;
  if (s >= 1e-3) return `${(s * 1e3).toFixed(1)} ms`;
  return `${(s * 1e6).toFixed(1)} µs`;
}

export function fmtSci(x, digits = 3) {
  if (!Number.isFinite(x)) return '∞';
  const ax = Math.abs(x);
  if (ax === 0) return '0';
  if (ax >= 1e-2 && ax < 1e4) return Number(x.toPrecision(digits)).toLocaleString('en-US');
  if (ax >= 1e4 && ax < 1e6) return fmtInt(x);
  const e = Math.floor(Math.log10(ax));
  const m = x / Math.pow(10, e);
  return `${m.toFixed(digits - 1)}e${e}`;
}

export function fmtWordsBig(x) {
  if (x >= 1e12) return `${(x / 1e12).toPrecision(3)} trillion`;
  if (x >= 1e9) return `${(x / 1e9).toPrecision(3)} billion`;
  if (x >= 1e6) return `${(x / 1e6).toPrecision(3)} million`;
  if (x >= 1e4) return fmtInt(x);
  return Number(x.toPrecision(3)).toLocaleString('en-US');
}

export function fmtHz(f) {
  if (f >= 1e15) return `${fmtSci(f)} Hz`;
  if (f >= 1e9) return `${(f / 1e9).toPrecision(3)} GHz`;
  if (f >= 1e6) return `${(f / 1e6).toPrecision(3)} MHz`;
  if (f >= 1e3) return `${(f / 1e3).toPrecision(3)} kHz`;
  return `${f.toPrecision(3)} Hz`;
}

export function fmtLen(m) {
  if (m >= 1e3) return `${fmtWordsBig(m / 1e3)} km`;
  return `${m.toPrecision(3)} m`;
}

/* A ship-log time stamp: hh:mm:ss under four days, else years and days. */
export function shipStamp(s) {
  if (s < 4 * 86400) return clockHMS(s);
  const y = Math.floor(s / YEAR), d = Math.floor((s - y * YEAR) / 86400);
  const rest = s - y * YEAR - d * 86400;
  return `${y} yr ${d} d ${clockHMS(rest).slice(0, 5)}`;
}

export function clockHMS(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}

export const C_LIGHT = C;
