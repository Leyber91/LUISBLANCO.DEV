/* ============================================================
   last-witness/main.js — the view. Four phases:
     plan     choose the crossing; the clocks and costs update live
     film     the crossing, with both clocks on one log axis
     talk     the return: the world, the ship log, TALLY
     end      the ending and the witness record
   Engine files compute; this file only reads them and draws.
   ============================================================ */

import { mountRoutePanel } from '../ai/route-panel.js';
import { voiceTurn, routeStatus } from './voice.js';
import { LAB, BODY, MODES, MASS_MARKS, SPIN_MARKS, SOURCES, CONSTANTS, MISCONCEPTIONS, HOLES } from './config.js';
import { ENDING_VARIANTS } from './story.js';
import { YEAR, G0, GM_SUN, planOrbit, planHover, planFlight, timeMaps, referenceChecks, iscoM, circularOrbit, propellant } from './physics.js';
import { buildWorld, fmtInt, fmtDur, fmtSci, fmtWordsBig, fmtHz, fmtLen, shipStamp } from './world.js';
import { Mind, LEVEL_NAMES } from './mind.js';
import { Scene, lookAt, lookAlong, projectLatLon } from './scene.js';
import { Sound } from './audio.js';
import { buildRecord, download } from './record.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const STILL = params.has('still');
const TEXT = params.has('text');            // text-only: no canvas, no film, captions instead
const REDUCE = STILL || TEXT || matchMedia('(prefers-reduced-motion: reduce)').matches;
const VERSION = 'last-witness/G1 2026-11-11';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isPhone = () => innerWidth <= 900;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/* ---------------- state ---------------- */
const S = {
  phase: 'plan',
  mode: 'orbit',
  vals: { orbit: {}, hover: {}, flight: {} },
  plan: null,
  world: null,
  mind: null,
  transcript: [],
  ending: null,
  film: null,
  busy: false,
  lastActivity: performance.now(),
  idleCount: 0,
  voice: params.get('voice') === 'engine' ? 'engine' : 'model',   // 'model' = a model voices heavy turns
  abort: null,
  modelCalls: 0,
  pageT0: performance.now(),
};
for (const [m, def] of Object.entries(MODES)) for (const [k, p] of Object.entries(def.params)) S.vals[m][k] = p.value;

/* ---------------- hash state (shareable) ---------------- */
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const c = h.get('c');
  if (c && MODES[c]) S.mode = c;
  const num = (k) => { const v = Number(h.get(k)); return Number.isFinite(v) && h.has(k) ? v : null; };
  const put = (m, key, v) => { if (v == null) return; const p = MODES[m].params[key]; S.vals[m][key] = clamp(v, p.min, p.max); };
  put('orbit', 'logM', num('m')); put('orbit', 'logDelta', num('s'));
  put('hover', 'logM', num('hm')); put('hover', 'logF', num('f'));
  put('flight', 'aG', num('g'));
  const msg = h.get('msg');
  $('msg').value = msg ? msg.slice(0, 160) : LAB.defaultMessage;
}
function writeHash() {
  const h = new URLSearchParams();
  h.set('c', S.mode);
  if (S.mode === 'orbit') { h.set('m', S.vals.orbit.logM.toFixed(3)); h.set('s', S.vals.orbit.logDelta.toFixed(1)); }
  if (S.mode === 'hover') { h.set('hm', S.vals.hover.logM.toFixed(3)); h.set('f', S.vals.hover.logF.toFixed(2)); }
  if (S.mode === 'flight') h.set('g', S.vals.flight.aG.toFixed(2));
  const msg = $('msg').value.trim();
  if (msg && msg !== LAB.defaultMessage) h.set('msg', msg);
  history.replaceState(null, '', '#' + h.toString());
}

/* ---------------- the planner ---------------- */
const LEG_NAMES = { depart: 'depart', approach: 'approach', fall: 'fall', dwell: 'orbit', climb: 'climb', return: 'return', accelerate: 'accelerate', brake: 'brake', return: 'return', arrive: 'arrive' };
const fmtYears = (s) => { const y = s / YEAR; return y >= 1 ? `${y >= 100 ? fmtInt(y) : y.toPrecision(3)} yr` : fmtDur(s, { short: true }); };

function legWhy(P, l) {
  if (P.method === 'flight') return l.rate[0] < l.rate[1] ? `speed: dt/dτ = cosh(aτ/c) rises to ${fmtSci(P.gammaMax)}` : `speed: γ falls from ${fmtSci(P.gammaMax)} to 1`;
  if (l.id === 'depart' || l.id === 'return') return `far out at ${fmtSci(l.rFrom, 3)} M: gravity and orbital speed, ×${fmtSci(l.rate[0], 4)}`;
  if (l.id === 'fall') return `spiralling in: ×${fmtSci(l.rate[0], 3)} to ×${fmtSci(l.rate[1])}`;
  if (l.id === 'climb') return `the fall in reverse: ×${fmtSci(l.rate[0])} to ×${fmtSci(l.rate[1], 3)}`;
  return P.method === 'hover' ? `hover at ${fmtSci(P.rM / 2, 8)} rs: gravity, ×${fmtSci(P.D)}` : `orbit at the ISCO of a* = 1 − ${fmtSci(P.delta, 2)}: gravity and speed, ×${fmtSci(P.D)}`;
}

function renderLedger(P) {
  const name = (l) => (l.id === 'dwell' && P.method === 'hover' ? 'hover' : LEG_NAMES[l.id]);
  $('ledger').innerHTML = `<tr><td>leg</td><td>you</td><td>home</td></tr>` + P.journey.legs.map((l) =>
    `<tr><td>${esc(name(l))}</td><td>${esc(fmtDur(l.shipS, { short: true }))}</td><td>${esc(fmtYears(l.homeS))}</td></tr>`).join('');
}

/* The map of possible crossings: every cell is a full feasibility check
   (tide, acceleration, your lifetime) at that mass and spin, height or thrust. */
function renderFeas(P) {
  const cv = $('feasc'); const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const def = MODES[S.mode].params;
  const nx = 60, ny = 24;
  const cell = (x, y) => {
    if (S.mode === 'orbit') {
      const logM = def.logM.min + (def.logM.max - def.logM.min) * (x + 0.5) / nx;
      const logD = def.logDelta.min + (def.logDelta.max - def.logDelta.min) * (y + 0.5) / ny;
      const d = 10 ** logD, r = iscoM(d), o = circularOrbit(r, d);
      const tide = 2 * (10 ** logM) * GM_SUN * LAB.bodyL / Math.pow(r * (10 ** logM) * GM_SUN / (299792458 ** 2), 3) / G0;
      const life = (LAB.outsideYears * YEAR / o.ut) / YEAR;
      return tide > 1 ? 'tide' : life > LAB.maxShipYears ? 'life' : 'ok';
    }
    if (S.mode === 'hover') {
      const logM = def.logM.min + (def.logM.max - def.logM.min) * (x + 0.5) / nx;
      const logF = def.logF.min + (def.logF.max - def.logF.min) * (y + 0.5) / ny;
      const f = 1 + 10 ** logF, mS = 10 ** logM, alpha = Math.sqrt(1 - 1 / f);
      const r = 2 * f * mS * GM_SUN / (299792458 ** 2);
      const acc = mS * GM_SUN / (r * r * alpha) / G0;
      const life = LAB.outsideYears * alpha;
      return acc > 3 ? 'accel' : life > LAB.maxShipYears ? 'life' : 'ok';
    }
    const aG = def.aG.min + (def.aG.max - def.aG.min) * (x + 0.5) / nx;
    const k = 299792458 / (aG * G0);
    const ship = 4 * k * Math.asinh(LAB.outsideYears * YEAR / (4 * k)) / YEAR;
    return aG > 3 ? 'accel' : ship > LAB.maxShipYears ? 'life' : aG > 1.25 ? 'risk' : 'ok';
  };
  const col = { ok: 'rgba(212,162,76,.16)', risk: 'rgba(231,184,92,.08)', tide: 'rgba(224,108,117,.10)', life: 'rgba(66,75,87,.35)', accel: 'rgba(224,108,117,.10)' };
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) {
    g.fillStyle = col[cell(x, y)];
    g.fillRect(Math.floor(x * W / nx), Math.floor(H - (y + 1) * H / ny), Math.ceil(W / nx), Math.ceil(H / ny));
  }
  // the current plan
  const v = S.vals[S.mode];
  const px = S.mode === 'flight' ? (v.aG - def.aG.min) / (def.aG.max - def.aG.min) : (v.logM - def.logM.min) / (def.logM.max - def.logM.min);
  const py = S.mode === 'orbit' ? (v.logDelta - def.logDelta.min) / (def.logDelta.max - def.logDelta.min)
    : S.mode === 'hover' ? (v.logF - def.logF.min) / (def.logF.max - def.logF.min) : 0.5;
  g.strokeStyle = '#D4A24C'; g.fillStyle = '#F0C674'; g.lineWidth = 1;
  g.beginPath(); g.arc(px * W, H - py * H, 3.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(px * W, 0); g.lineTo(px * W, H); g.moveTo(0, H - py * H); g.lineTo(W, H - py * H);
  g.globalAlpha = 0.35; g.stroke(); g.globalAlpha = 1;
  $('feasl').innerHTML = S.mode === 'orbit' ? '<span>mass →, slower spin ↑</span><span>gold crossable · red tides · grey age</span>'
    : S.mode === 'hover' ? '<span>mass →, height ↑</span><span>red engines crush you · grey age</span>'
      : '<span>thrust →</span><span>gold crossable · amber risk · red lethal</span>';
}

function computePlan() {
  const v = S.vals[S.mode];
  const common = { outsideYears: LAB.outsideYears, bodyL: LAB.bodyL, craftKg: LAB.craftKg };
  if (S.mode === 'orbit') {
    const mSun = 10 ** v.logM, delta = 10 ** v.logDelta;
    return { ...planOrbit({ mSun, delta, ...common }), mSun, delta };
  }
  if (S.mode === 'hover') {
    const mSun = 10 ** v.logM, f = 1 + 10 ** v.logF;
    return { ...planHover({ mSun, f, ...common }), mSun, f };
  }
  return { ...planFlight({ aG: v.aG, ...common }), aG: v.aG };
}

const band = (bands, x) => bands.find((b) => x <= b.max) || bands[bands.length - 1];

/* The deepest a hovering ship can sit at a given acceleration (bisection on height). */
function hoverLimit(mSun, aMaxG) {
  let lo = -12, hi = 6;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const p = planHover({ mSun, f: 1 + 10 ** mid, outsideYears: 1, bodyL: 1, craftKg: 1 });
    if (p.accelG > aMaxG) lo = mid; else hi = mid;
  }
  return planHover({ mSun, f: 1 + 10 ** hi, outsideYears: LAB.outsideYears, bodyL: LAB.bodyL, craftKg: LAB.craftKg });
}

function costsOf(P) {
  const rows = [];
  const life = P.shipS / YEAR > LAB.maxShipYears ? 'lethal' : 'ok';
  const lifeRow = { k: 'your time', v: fmtDur(P.shipS), verdict: life,
    n: life === 'lethal' ? `longer than ${LAB.maxShipYears} years: you would not live to see home [illustrative limit]` : P.method === 'flight' ? `you come home ${fmtDur(P.shipS)} older` : 'the whole crossing, by your own clock' };
  if (P.method === 'orbit') {
    const t = band(BODY.tidal, P.tidalG);
    const stellar = P.tidalG * (P.mSun / 10) ** 2;
    rows.push({ k: 'tidal stretch, head to foot', v: `${fmtSci(P.tidalG)} g`, verdict: t.verdict, n: `${t.text}; lethal above 1 g [illustrative]. The same orbit of a 10 Msun hole: ${fmtSci(stellar)} g. 2GML/r³, an order-one estimate this close to a spinning hole` });
    const sf = P.delta < 0.002;
    rows.push({ k: 'spin the hole needs', v: `a* = 1 − ${fmtSci(P.delta, 2)}`, verdict: sf ? 'sf' : 'ok',
      n: sf ? '[speculative] past a* = 0.998, the most accretion can spin a hole (Thorne 1974)' : 'within what accretion can make (Thorne 1974)' });
    const yrs = P.energyJ / LAB.worldEnergyJ;
    rows.push({ k: 'energy to climb back out', v: `${(P.bind * 100).toFixed(1)} % of rest mass`, verdict: 'sf',
      n: `1 − E at the orbit: ${fmtSci(P.energyJ)} J for 100 t, ${fmtSci(yrs)} years of world energy use [sf territory]` });
    const pr = propellant(P, LAB.craftKg);
    rows.push({ k: 'propellant, ideal photon rocket', v: `${fmtSci(pr.startKg / 1000)} t at the start`, verdict: 'sf',
      n: `to bring 100 t home: two spiral burns, Δv = c tanh(ln m0/m1); the spiral's Δv is the change in local orbital speed, ${fmtSci(Math.tanh(pr.legs[1].lnRatio), 3)} c each [approximation]` });
  } else if (P.method === 'hover') {
    const a = band(BODY.accel, P.accelG), t = band(BODY.tidal, P.tidalG);
    rows.push({ k: 'acceleration you feel', v: `${fmtSci(P.accelG)} g`, verdict: a.verdict, n: `${a.text}; a = GM / (r² √(1 − rs/r))` });
    rows.push({ k: 'tidal stretch, head to foot', v: `${fmtSci(P.tidalG)} g`, verdict: t.verdict, n: t.text });
    const lim = hoverLimit(P.mSun, 1.25);
    rows.push({ k: 'the deepest you can hover at 1.25 g', v: `×${fmtSci(lim.D)}`, verdict: 'sf',
      n: `this hole's surface gravity is ${fmtSci(P.kappaG)} g, and near the horizon a ≈ κ/α; at 1.25 g, ten thousand years would take ${fmtDur(lim.shipS)} of your life` });
    const pr = propellant(P, LAB.craftKg);
    rows.push({ k: 'propellant, ideal photon rocket', v: `mass ratio e^${fmtSci(pr.lnTotal, 3)}`, verdict: 'sf',
      n: 'holding station burns continuously: m1 = m0 exp(−∫a dτ / c) over every leg' });
  } else {
    const a = band(BODY.accel, P.aG);
    rows.push({ k: 'acceleration you feel', v: `${P.aG.toFixed(2)} g`, verdict: a.verdict, n: a.text });
    rows.push({ k: 'top speed', v: `γ = ${fmtSci(P.gammaMax)}`, verdict: 'ok', n: `1 − β = ${fmtSci(1 / (2 * P.gammaMax * P.gammaMax))}; you turn ${fmtInt(P.xMaxLy)} light-years out` });
    const l10 = P.lnRatio / Math.LN10;
    rows.push({ k: 'fuel, ideal photon rocket', v: `mass ratio 1e${l10.toFixed(1)}`, verdict: 'sf',
      n: `to bring 100 t home you leave with 1e${(l10 + 2).toFixed(1)} t; the Earth is 6.0e21 t [sf territory]` });
    rows.push({ k: 'energy', v: `${fmtSci(P.energyJ)} J`, verdict: 'sf', n: `${fmtSci(P.energyJ / LAB.sunJperYear)} years of the Sun's entire output` });
  }
  rows.push(lifeRow);
  const lethal = rows.filter((r) => r.verdict === 'lethal');
  return { rows, ok: lethal.length === 0, lethal, risk: rows.some((r) => r.verdict === 'risk'), sf: rows.filter((r) => r.verdict === 'sf').length };
}

function renderModes() {
  const host = $('modes');
  host.innerHTML = '';
  for (const [id, def] of Object.entries(MODES)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mode'; b.setAttribute('role', 'radio'); b.textContent = def.label;
    b.setAttribute('aria-checked', String(id === S.mode));
    b.addEventListener('click', () => { S.mode = id; renderModes(); renderParams(); update(); });
    b.addEventListener('keydown', (e) => {
      const ids = Object.keys(MODES); const i = ids.indexOf(S.mode);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        S.mode = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
        renderModes(); renderParams(); update(); host.querySelector('[aria-checked="true"]').focus();
      }
    });
    host.appendChild(b);
  }
  $('mblurb').textContent = MODES[S.mode].blurb;
}

function paramValueText(mode, key, x) {
  if (key === 'logM') return `${fmtSci(10 ** x)} <small>Msun</small>`;
  if (key === 'logDelta') return x >= -0.01 ? `a* = 0 <small>no spin</small>` : `a* = 1 − 1e${x.toFixed(1)}`;
  if (key === 'logF') return `r = rs (1 + 1e${x.toFixed(2)})`;
  if (key === 'aG') return `${x.toFixed(2)} <small>g</small>`;
  return String(x);
}

function renderParams() {
  const host = $('params');
  host.innerHTML = '';
  const def = MODES[S.mode];
  for (const [key, p] of Object.entries(def.params)) {
    const id = `p_${key}`;
    const wrap = document.createElement('div');
    wrap.className = 'prm';
    wrap.innerHTML = `<label class="pk" for="${id}">${p.label}</label><span class="pv" id="${id}_v"></span>
      <input type="range" id="${id}" min="${p.min}" max="${p.max}" step="${p.step}" value="${S.vals[S.mode][key]}" />
      <div class="marks" id="${id}_m"></div>`;
    host.appendChild(wrap);
    const input = wrap.querySelector('input');
    const marks = key === 'logM' ? MASS_MARKS.map((m) => ({ x: m.logM, label: m.label }))
      : key === 'logDelta' ? SPIN_MARKS.map((m) => ({ x: m.logDelta, label: '0.998' })) : [];
    const mk = wrap.querySelector('.marks');
    for (const m of marks) {
      const s = document.createElement('span');
      s.style.left = `${((m.x - p.min) / (p.max - p.min)) * 100}%`;
      s.textContent = m.label;
      mk.appendChild(s);
    }
    if (!marks.length) mk.remove();
    const show = () => { $(`${id}_v`).innerHTML = paramValueText(S.mode, key, Number(input.value)); };
    input.addEventListener('input', () => { S.vals[S.mode][key] = Number(input.value); show(); update(); });
    show();
  }
}

function spark(P) {
  const svg = $('spark');
  const b = buildWorldPreviewBeacon(P);
  const W = 300, H = 58, lo = -4, hi = 8;
  const y = (s) => H - 6 - ((clamp(Math.log10(s), lo, hi) - lo) / (hi - lo)) * (H - 14);
  const pts = b.samples.map((s) => `${(s.rxYears / LAB.outsideYears * W).toFixed(1)},${y(b.beatS * s.factor).toFixed(1)}`);
  const ticks = [[1, '1 s'], [3600, '1 h'], [86400 * 30, '1 mo']].map(([s, t]) => `<line class="axis" x1="0" x2="${W}" y1="${y(s)}" y2="${y(s)}" stroke-dasharray="2 4" opacity=".5"/><text x="${W - 2}" y="${y(s) - 2}" text-anchor="end" font-size="8" fill="#424B57">${t}</text>`).join('');
  svg.innerHTML = `${ticks}<polygon class="fillc" points="0,${H} ${pts.join(' ')} ${W},${H}"/><polyline class="curve" points="${pts.join(' ')}"/>
    <text x="2" y="${H - 1}" font-size="8" fill="#424B57">year 0</text><text x="${W - 2}" y="${H - 1}" font-size="8" fill="#424B57" text-anchor="end">10,000</text>`;
  const ht = $('heardt');
  if (P.method === 'flight') {
    ht.innerHTML = `Your beats stretch to <b>${fmtDur(b.beatS * b.factorMax)}</b> apart by year 5,000, then close up again; the whole return leg arrives in the last <b>${fmtDur(b.lastBurstS)}</b>. The carrier falls to <b>${fmtHz(LAB.carrierHz / b.factorMax)}</b>.`;
  } else {
    ht.innerHTML = `One beat every <b>${fmtDur(b.beatS * P.D)}</b>, for ten thousand years. Your ${fmtHz(LAB.carrierHz)} carrier arrives at <b>${fmtHz(LAB.carrierHz / P.D)}</b>; hearing it takes an antenna element <b>${fmtLen(299792458 / (2 * LAB.carrierHz / P.D))}</b> long.`;
  }
}

function buildWorldPreviewBeacon(P) {
  const maps = timeMaps(P);
  const N = 160, samples = [];
  for (let i = 0; i <= N; i++) {
    const tau = P.shipS * i / N;
    samples.push({ rxYears: maps.rx(tau) / YEAR, factor: P.method === 'flight' ? maps.rate(tau) : P.D });
  }
  const factorMax = Math.max(...samples.map((s) => s.factor));
  const lastBurstS = P.method === 'flight' ? (LAB.outsideYears * YEAR - maps.rx(2 * P.tauQ)) : 0;
  return { samples, factorMax, beatS: 1 / LAB.heartHz, lastBurstS };
}

function formulaFor(P) {
  if (P.method === 'orbit') return {
    fx: `dt/dτ = (r<sup>3/2</sup> + a) / ( r<sup>3/4</sup> √(r<sup>3/2</sup> − 3r<sup>1/2</sup> + 2a) )  at r = r<sub>isco</sub>(a) = ${P.iscoM.toPrecision(8)} M`,
    cite: `Prograde circular orbit of a Kerr hole, G = c = M = 1. Bardeen, Press &amp; Teukolsky 1972, ApJ 178, 347. Here dt/dτ = ${fmtSci(P.D)}.`,
  };
  if (P.method === 'hover') return {
    fx: `dτ/dt = √(1 − r<sub>s</sub>/r) = ${fmtSci(P.alpha)}     a = GM / ( r² √(1 − r<sub>s</sub>/r) )`,
    cite: 'Static observer in the Schwarzschild metric. Hartle 2003, Gravity, ch. 9; Misner, Thorne &amp; Wheeler 1973, §25.',
  };
  return {
    fx: `t = (c/a) sinh(aτ/c),  x = (c²/a)(cosh(aτ/c) − 1),  four legs;  mass ratio = e<sup>4aτ<sub>leg</sub>/c</sup>`,
    cite: 'Uniformly accelerated (hyperbolic) motion. Misner, Thorne &amp; Wheeler 1973, Gravitation, §6.2. The mass ratio is the ideal photon rocket, exhaust at c.',
  };
}

function update() {
  const P = computePlan();
  S.plan = P;
  const C = costsOf(P);
  $('c_you').textContent = fmtDur(P.shipS);
  $('c_ratio').textContent = P.method === 'flight'
    ? `average ×${fmtSci(P.D)}; at top speed your clock runs ×${fmtSci(P.gammaMax)} slow`
    : `×${fmtSci(P.D)}: one of your seconds is ${fmtDur(P.D)} at home`;
  $('costs').innerHTML = C.rows.map((r) => `<div class="cost" data-v="${r.verdict}"><span class="k">${esc(r.k)}</span><span class="v">${esc(r.v)}</span><span class="n">${esc(r.n)}</span></div>`).join('');
  const vd = $('verdict');
  if (C.ok) { vd.className = 'verdict ok'; vd.textContent = `crossable${C.risk ? ', at a risk' : ''}${C.sf ? ` · ${C.sf} cost${C.sf > 1 ? 's' : ''} beyond any engine` : ''}`; }
  else { vd.className = 'verdict'; vd.textContent = `not survivable · ${C.lethal.map((r) => r.k).join(', ')}`; }
  $('cross').disabled = !C.ok;
  const why = $('why');
  if (!C.ok) {
    const r = C.lethal[0];
    why.innerHTML = `<b>The physics refuses.</b> ${esc(r.k)}: ${esc(r.v)}. ${S.mode === 'hover' ? 'No known hole is heavy enough to hover your way ten thousand years ahead.' : S.mode === 'orbit' ? 'Spin the hole faster, or choose a heavier hole.' : ''}`;
  } else {
    why.textContent = P.method === 'orbit' && P.delta < 0.002 ? 'The orbit is real physics; the spin it needs is not known to exist. The page lets you go.' : P.method === 'flight' ? 'The kinematics are exact; the fuel is fiction. The page lets you go.' : '';
  }
  const f = formulaFor(P);
  $('fx').innerHTML = f.fx; $('fcite').innerHTML = f.cite;
  renderLedger(P);
  renderFeas(P);
  spark(P);
  writeHash();
  if (S.phase === 'plan') setPreviewScene();
}

/* the live ticker: home ages while you read */
function tick() {
  if (S.phase !== 'plan' || !S.plan) return;
  const el = (performance.now() - S.pageT0) / 1000;
  const P = S.plan;
  $('ticker').innerHTML = `You have been on this page <b>${fmtDur(el)}</b>. At this ratio, home would have aged <b>${fmtDur(el * P.D)}</b>.`;
}

/* ---------------- the scene ---------------- */
const canvas = $('gl');
const scene = TEXT ? { ok: false, u: {}, render() {}, setTier() {} } : new Scene(canvas, { still: STILL });
if (params.has('tier') && scene.setTier) scene.setTier(Number(params.get('tier')));
const sound = new Sound();
let previewYaw = 0.6;

function setPreviewScene() {
  if (!scene.ok) return;
  if (S.mode === 'flight') {
    scene.mode = 'flight';
    Object.assign(scene.u, { right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, 1], fov: 1.1 });
  } else {
    scene.mode = 'hole';
    Object.assign(scene.u, { disk: 1, blue: 0, fov: isPhone() ? 1.25 : 0.95 });
  }
  scene.u.shift = isPhone() ? 0.27 : 0.08;
}

function previewFrame(t) {
  if (S.mode === 'flight') {
    scene.u.beta = REDUCE ? 0.82 : 0.55 + 0.4 * Math.sin(t * 0.22);
    return;
  }
  previewYaw = REDUCE ? 0.9 : 0.6 + t * 0.035;
  const R = isPhone() ? 26 : 19, el = 0.11;
  const cam = [R * Math.cos(previewYaw) * Math.cos(el), R * Math.sin(el), R * Math.sin(previewYaw) * Math.cos(el)];
  Object.assign(scene.u, { cam, ...lookAt(cam) });
}

/* ---------------- phases ---------------- */
function phase(name) {
  S.phase = name;
  document.body.dataset.phase = name;
  for (const id of ['plan', 'film', 'talk', 'end']) {
    const el = $(id);
    const on = id === name;
    if (on) { el.hidden = false; requestAnimationFrame(() => el.classList.add('in')); }
    else { el.classList.remove('in'); el.hidden = true; }
  }
  $('labels').hidden = !(name === 'talk' || name === 'end');
  scrollTo(0, 0);
}

/* ---------------- II. the film ---------------- */
const AXIS_MAX = Math.log10(LAB.outsideYears * YEAR * 1.05);
const axisX = (s) => clamp(Math.log10(Math.max(1, s)) / AXIS_MAX, 0, 1);

function buildAxis() {
  const marks = [[1, '1 s'], [60, '1 min'], [3600, '1 h'], [86400, '1 d'], [YEAR, '1 yr'], [100 * YEAR, '100 yr'], [LAB.outsideYears * YEAR, '10,000 yr']];
  $('axis').innerHTML = marks.map(([s, t]) => `<span style="left:${axisX(s) * 100}%">${t}</span>`).join('');
}

function startCrossing() {
  const P = S.plan;
  if (!P || $('cross').disabled) return;
  const msg = $('msg').value.trim() || LAB.defaultMessage;
  S.world = buildWorld(P, msg);
  S.mind = new Mind(S.world);
  S.transcript = [];
  S.ending = null;
  S.idleCount = 0;
  phase('film');
  buildAxis();
  $('flog').innerHTML = '';
  $('b_home').parentElement.querySelectorAll('.tick').forEach((t) => t.remove());
  const maps = timeMaps(P);
  const flight = P.method === 'flight';
  const total = 35;
  S.film = { t0: performance.now(), P, maps, flight, total, logged: new Set(), eraTicks: new Set(), done: false, lastAnom: -1, shot: -1 };
  $('flegs').innerHTML = P.journey.legs.map((l) => `<tr><td>${esc(LEG_NAMES[l.id])}</td><td>${esc(fmtDur(l.shipS, { short: true }))}</td><td>${esc(fmtYears(l.homeS))}</td><td>${esc(legWhy(P, l))}</td></tr>`).join('');
  $('f_cap').textContent = flight ? 'flight · four legs at constant thrust' : 'orbit · the last stable circular orbit';
  if (REDUCE) { S.film.t0 -= total * 1000; }
  if (TEXT) { S.film.done = true; arrive(); return; }
  scene.u.shift = 0;
  sound.crossing(0);
}

/* The film's shots: one per leg, each with its own camera and caption. Film seconds per leg. */
const SHOTS = {
  hole: [
    { leg: 'depart', part: [0, 0.5], from: 1.5, to: 3.5, beat: 'departure', cap: (P, l) => `I · departure · leaving the station at ${fmtSci(l.rFrom, 3)} M; your clock runs ${pct(l.rate[0])} slow` },
    { leg: 'depart', part: [0.5, 1], from: 3.5, to: 6, beat: 'approach', cap: () => 'II · approach · the hole fills the sky; light bends around the shadow' },
    { leg: 'fall', from: 6, to: 13, beat: 'fall', cap: (P, l) => `III · the fall · spiralling in, the rate climbs from ×${fmtSci(l.rate[0])} to ×${fmtSci(l.rate[1])}` },
    { leg: 'dwell', from: 13, to: 27, beat: 'orbit', cap: (P) => `IV · ${P.method === 'hover' ? 'the hover' : 'the last stable orbit'} · ×${fmtSci(P.D)}; the home star flashes once per home century` },
    { leg: 'climb', from: 27, to: 31.5, beat: 'climb', cap: (P, l) => `V · the climb · the fall in reverse, ${fmtDur(l.homeS)} at home` },
    { leg: 'return', from: 31.5, to: 33, beat: 'return', cap: () => 'VI · return · back to the station, and home' },
  ],
  flight: [
    { leg: 'accelerate', from: 1.5, to: 9.5, beat: 'departure', cap: (P) => `I · accelerate at ${P.aG} g · the sky folds forward into the direction you fly` },
    { leg: 'brake', from: 9.5, to: 17.5, beat: 'turn', cap: (P) => `II · brake · you stop ${fmtInt(P.xMaxLy)} light-years out; home's light is ${fmtInt(P.xMaxLy)} years old` },
    { leg: 'return', from: 17.5, to: 25.5, beat: 'return', cap: () => 'III · return · now you fly into home\u2019s light, and its history arrives compressed' },
    { leg: 'arrive', from: 25.5, to: 33, beat: 'arrive', cap: () => 'IV · arrive · braking into home' },
  ],
};
const pct = (rate) => `${((1 - 1 / rate) * 100).toPrecision(2)} %`;

function shotAt(F, t) {
  const list = F.flight ? SHOTS.flight : SHOTS.hole;
  let i = list.findIndex((s) => t < s.to);
  if (i < 0) i = list.length - 1;
  const sh = list[i];
  const leg = F.P.journey.legs.find((l) => l.id === sh.leg);
  const k = clamp((t - sh.from) / (sh.to - sh.from), 0, 1);
  const part = sh.part || [0, 1];
  const kl = part[0] + (part[1] - part[0]) * k;
  return { sh, leg, k, i, shipT: t < list[0].from ? 0 : leg.ship0 + kl * leg.shipS };
}

function filmFrame(now) {
  const F = S.film;
  if (!F || F.done) return;
  const t = (now - F.t0) / 1000;
  const P = F.P, W = S.world;
  const { sh, leg, k, i: shotI, shipT } = shotAt(F, t);
  let depth = 0;
  const rateNow = F.maps.rate(shipT);
  if (F.flight) {
    const st = F.maps.state(shipT);
    depth = Math.min(1, Math.log10(1 + Math.abs(st.v) * P.gammaMax) / Math.log10(1 + P.gammaMax));
    const outbound = shipT < 2 * P.tauQ;
    const fwd = outbound ? [0, 0, 1] : [0, 0, -1];
    scene.mode = 'flight';
    Object.assign(scene.u, { beta: Math.abs(st.v), right: outbound ? [1, 0, 0] : [-1, 0, 0], up: [0, 1, 0], fwd, fov: 1.1, ignite: t > F.total - 2 ? clamp(F.total - t, 0, 1) : clamp(t / 1.5, 0, 1) });
  } else {
    const RF = 24, RN = 3.1;
    // the sky's blueshift look follows the computed clock rate, on a log scale
    const blue = clamp(Math.log10(rateNow) / Math.log10(Math.max(10, P.D)), 0, 1);
    let R = RF;
    if (sh.beat === 'departure') R = 40 - 10 * ease(k);
    else if (sh.beat === 'approach') R = 30 - 8 * ease(k);
    else if (sh.leg === 'fall') R = 22 + (RN - 22) * ease(k);
    else if (sh.leg === 'dwell') R = RN;
    else if (sh.leg === 'climb') R = RN + (RF - RN) * ease(k);
    else R = RF + 14 * ease(k);
    depth = blue;
    const yaw = 0.6 + t * 0.06 + (t > 13 ? Math.min(15, t - 13) * 0.36 : 0);
    const el = 0.12 + 0.05 * Math.sin(t * 0.3);
    const cam = [R * Math.cos(yaw) * Math.cos(el), R * Math.sin(el), R * Math.sin(yaw) * Math.cos(el)];
    // deep in the well the camera turns to look along the orbit: the shadow to one side, the bent sky ahead
    const inward = cam.map((x) => -x / R);
    const tangent = [-Math.sin(yaw), 0, Math.cos(yaw)];
    const turn = 0.62 * clamp((RF - R) / (RF - RN), 0, 1);
    const dir = inward.map((x, j) => x * (1 - turn) + tangent[j] * turn);
    scene.mode = 'hole';
    const homeYears = F.maps.home(shipT) / YEAR;
    const homeFlash = Math.pow(Math.max(0, Math.cos(Math.PI * (homeYears / 100))), 24);
    Object.assign(scene.u, { cam, ...lookAlong(dir), disk: 1, blue, home: homeFlash, fov: isPhone() ? 1.3 : 1.05, ignite: t > F.total - 2 ? clamp(F.total - t, 0, 1) : 1 });
  }
  const home = F.maps.home(shipT);
  $('f_you').textContent = F.flight ? fmtDur(shipT, { short: true }) : shipStamp(shipT);
  $('f_home').textContent = `year ${fmtInt(Math.floor(home / YEAR))}`;
  $('b_you').style.width = `${axisX(shipT) * 100}%`;
  $('b_home').style.width = `${axisX(home) * 100}%`;
  if (F.shot !== shotI) {
    F.shot = shotI;
    $('f_cap').textContent = sh.cap(P, leg);
    const legIdx = P.journey.legs.indexOf(leg);
    $('flegs').querySelectorAll('tr').forEach((tr, j) => tr.classList.toggle('on', j === legIdx));
    sound.thump(0.5);
  }
  $('f_note').innerHTML = F.flight
    ? `speed <b>${(Math.abs(F.maps.state(shipT).v) * 100).toFixed(shipT > 0 ? 6 : 0)} %</b> of light · you see home at year <b>${fmtInt(Math.max(0, F.maps.seen(shipT) / YEAR))}</b> · home hears one beat every <b>${fmtDur(1 / LAB.heartHz * rateNow)}</b><br><span class="fx2">dt/dτ = γ(1 + β cos θ) for the light from home · t = (c/a) sinh(aτ/c)</span>`
    : `${esc(sh.beat)} · clock rate <b>×${fmtSci(rateNow)}</b> · one of your seconds is <b>${fmtDur(rateNow)}</b> at home · home hears one beat every <b>${fmtDur(1 / LAB.heartHz * rateNow)}</b><br><span class="fx2">${P.method === 'hover' ? 'dt/dτ = 1/√(1 − rs/r)' : 'dt/dτ = u<sup>t</sup>(r, a*), Bardeen, Press &amp; Teukolsky 1972'} · r = ${(sh.leg === 'fall' ? P.journey.path(k) : sh.leg === 'climb' ? P.journey.path(1 - k) : sh.leg === 'dwell' ? P.rM : leg.rFrom).toPrecision(8)} M</span>`;
  sound.crossing(depth);
  sound.home(rateNow);

  // era boundaries seen from the ship: unreadable at the time, marked on the home row
  for (const l of W.shipLog) {
    if (F.logged.has(l.id) || shipT < l.tau) continue;
    F.logged.add(l.id);
    const li = document.createElement('li');
    if (l.anomaly) li.className = 'anom';
    li.innerHTML = `<span class="t">${esc(shipStamp(l.tau))}</span><span>${esc(l.text)}</span>`;
    $('flog').appendChild(li);
    if (l.anomaly) { F.lastAnom = t; sound.ping(1760, 0.14); } else sound.thump(0.35);
    const tk = document.createElement('span');
    tk.className = 'tick'; tk.style.left = `${axisX(l.year * YEAR) * 100}%`;
    $('b_home').parentElement.appendChild(tk);
  }
  scene.u.flash = F.lastAnom >= 0 ? Math.max(0, 1 - (t - F.lastAnom) / 1.2) : 0;
  if (t >= F.total) { F.done = true; arrive(); }
}

/* ---------------- III. the return ---------------- */
let PL = null;        // planet layout

function planetLayout() {
  const W = innerWidth, H = innerHeight;
  if (isPhone()) return { cx: W / 2, cy: H * 0.22, radius: Math.min(W * 0.3, H * 0.14) };
  const right = Math.min(470, Math.max(360, W * 0.34)) + 40 + 24;
  const areaW = W - right - 40;
  return { cx: 40 + areaW * 0.5, cy: H * 0.385, radius: Math.min(areaW * 0.27, H * 0.255) };
}

function setWorldScene(reveal = 1) {
  const W = S.world, p = W.planet, d2r = Math.PI / 180;
  PL = planetLayout();
  const startRot = W.line.lon * d2r - Math.PI / 2 + 0.35;
  scene.mode = 'world';
  Object.assign(scene.u, {
    ...PL, rot: startRot, tilt: p.tilt, sun: [0.86, 0.3, -0.42], seedX: p.seedX, seedY: p.seedY,
    ocean: p.ocean, ice: (p.iceLat * d2r), lights: W.fate === 'slowing' ? 1 : 0, lineOn: 1,
    line: [W.line.lat * d2r, W.line.lon * d2r, W.line.az * d2r, Math.max(W.line.lenRad, 0.012)],
    station: [W.line.lat * d2r, W.line.lon * d2r],
    mark: p.fateMark ? [p.fateMark.lat * d2r, p.fateMark.lon * d2r] : [0, 0], markOn: p.fateMark ? 1 : 0,
    reveal, glow: 1, ignite: 1,
  });
  S.rot0 = startRot;
}

function features() {
  const W = S.world, p = W.planet, f = W.fateD;
  // the line's midpoint along its great circle
  const d2r = Math.PI / 180, la = W.line.lat * d2r, lo = W.line.lon * d2r, az = W.line.az * d2r;
  const A = [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
  const east = (() => { const e = [A[2], 0, -A[0]]; const l = Math.hypot(...e); return e.map((x) => x / l); })();
  const north = [A[1] * east[2] - A[2] * east[1], A[2] * east[0] - A[0] * east[2], A[0] * east[1] - A[1] * east[0]];
  const dir = north.map((x, i) => Math.cos(az) * x + Math.sin(az) * east[i]);
  const s = Math.max(W.line.lenRad, 0.012) / 2;
  const mid = A.map((x, i) => Math.cos(s) * x + Math.sin(s) * dir[i]);
  const midLat = Math.asin(mid[1]) / d2r, midLon = Math.atan2(mid[2], mid[0]) / d2r;
  const out = [
    { id: 'station', lat: W.line.lat, lon: W.line.lon, un: 'heat source · one point', res: 'TALLY · the station', by: 'self' },
    { id: 'line', lat: midLat, lon: midLon, dx: 0, un: `linear structure · ${fmtLen(W.line.lengthKm * 1000)}`, res: `the listening line · tuned to ${fmtHz(W.beacon.carrierMinHz)}`, by: 'line' },
    { id: 'cities', anchor: [-0.62, -0.28], un: W.fate === 'slowing' ? `urban light · changes over ${f.lightPeriodMin} min` : 'urban grid · no emission',
      res: { hush: 'cities · emptied downward', going: 'cities · emptied outward', slowing: `${f.cities} cities · minds slowed ×${fmtWordsBig(W.plan.factorMax)}`, thinning: `cities · the last died in year ${fmtInt(f.lastYear)}` }[W.fate], by: 'fate' },
    { id: 'ice', iceLat: p.iceLat, un: `ice to ${p.iceLat}°`, res: `the ice came back · ${p.iceLat}°`, by: 'ice' },
  ];
  if (p.fateMark) out.push({ id: 'mark', lat: p.fateMark.lat, lon: p.fateMark.lon,
    un: W.fate === 'hush' ? `${f.shafts} vertical features` : 'equatorial rail',
    res: W.fate === 'hush' ? `${f.shafts} sealed shafts · ${f.heatMW} MW below` : `launch rail · ${f.ships} ships left`, by: 'fate' });
  return out;
}

function renderLabels() {
  if (!S.world || !PL) return;
  const host = $('labels');
  const feats = features();
  if (!host.childElementCount) {
    host.innerHTML = '<svg class="leaders" aria-hidden="true"></svg>' + feats.map((f) => `<div class="lab" data-id="${f.id}"><span class="tx"></span></div>`).join('') + '<ol class="legend"></ol>';
  }
  const rot = scene.u.rot, tilt = scene.u.tilt, R = scene.u.radius || PL.radius;
  const geo = { rot, tilt, cx: PL.cx, cy: PL.cy, radius: R };
  const told = new Set(S.mind ? S.mind.snapshot().told : []);
  const shown = (scene.u.reveal ?? 1) >= 0.85;
  const phone = isPhone() || TEXT;
  const items = [];
  for (const f of feats) {
    let pos;
    if (f.anchor) pos = { x: PL.cx + f.anchor[0] * R, y: PL.cy - f.anchor[1] * R, visible: true };
    else if (f.iceLat != null) pos = projectLatLon(f.iceLat + 9, (rot + Math.PI / 2) * 180 / Math.PI - 25, geo);
    else pos = projectLatLon(f.lat, f.lon, geo);
    const dx = pos.x - PL.cx, dy = pos.y - PL.cy, d = Math.hypot(dx, dy) || 1;
    const side = dx >= 0 ? 1 : -1;
    const out = { x: PL.cx + (dx / d) * (R + (phone ? 16 : 30)), y: PL.cy + (dy / d) * (R + (phone ? 16 : 30)) };
    items.push({ f, pos, out, side, res: told.has(f.by) });
  }
  // keep labels on each side at least 20 px apart
  for (const side of [1, -1]) {
    const col = items.filter((i) => i.side === side && i.pos.visible).sort((x, y) => x.out.y - y.out.y);
    for (let i = 1; i < col.length; i++) if (col[i].out.y - col[i - 1].out.y < 20) col[i].out.y = col[i - 1].out.y + 20;
  }
  let svg = '';
  for (const it of items) {
    const el = host.querySelector(`[data-id="${it.f.id}"]`);
    if (!el) continue;
    const vis = it.pos.visible && shown;
    el.classList.toggle('res', it.res);
    el.classList.toggle('hide', !vis);
    el.classList.toggle('l', it.side < 0);
    el.style.left = `${it.out.x}px`; el.style.top = `${it.out.y}px`;
    const tx = el.querySelector('.tx');
    const n = feats.indexOf(it.f) + 1;
    const want = (phone ? 'p' : 'd') + (it.res ? it.f.res : it.f.un);
    if (tx.dataset.v !== want) {
      tx.innerHTML = phone ? `<b>${n}</b>` : it.res ? esc(it.f.res) : `${esc(it.f.un)} <span class="q">?</span>`;
      tx.dataset.v = want;
    }
    if (vis) {
      const k = it.res ? 'r' : 'u';
      const ex = it.out.x + it.side * 6;
      svg += `<polyline class="ld ${k}" points="${it.pos.x.toFixed(1)},${it.pos.y.toFixed(1)} ${it.out.x.toFixed(1)},${it.out.y.toFixed(1)} ${ex.toFixed(1)},${it.out.y.toFixed(1)}"/>` +
        `<circle class="pt ${k}" cx="${it.pos.x.toFixed(1)}" cy="${it.pos.y.toFixed(1)}" r="${it.res ? 2.6 : 2.2}"/>`;
    }
  }
  host.querySelector('svg').innerHTML = svg;
  const lg = host.querySelector('.legend');
  if (phone) {
    lg.hidden = false;
    lg.style.top = TEXT ? '96px' : `${PL.cy + R + 18}px`;
    const html = items.map((it, i) => `<li class="${it.res ? 'res' : ''}"><b>${i + 1}</b> ${esc(it.res ? it.f.res : it.f.un + ' ?')}</li>`).join('');
    if (lg.dataset.v !== html) { lg.innerHTML = html; lg.dataset.v = html; }
  } else lg.hidden = true;
}

function arrive() {
  sound.homeOff();
  phase('talk');
  setWorldScene(REDUCE ? 1 : 0);
  S.arriveT = performance.now();
  $('labels').innerHTML = '';
  $('transcript').innerHTML = '';
  renderLog();
  renderEngine(null);
  const carrier = sound.setCarrier(S.world.beacon.carrierMinHz);
  S.carrierNote = carrier.exact ? `TALLY's tone is the ship's carrier as home receives it, ${fmtHz(S.world.beacon.carrierMinHz)}` : `the carrier home receives, ${fmtHz(S.world.beacon.carrierMinHz)}, is inaudible; you hear it folded ${Math.abs(carrier.folds)} octave${Math.abs(carrier.folds) === 1 ? '' : 's'} to ${fmtHz(carrier.audibleHz)}`;
  $('tsub').textContent = `${fmtInt(S.world.years)} years since you left`;
  $('tnote').textContent = S.carrierNote;
  if (TEXT) {
    const list = S.plan.method === 'flight' ? SHOTS.flight : SHOTS.hole;
    for (const sh of list) {
      const leg = S.plan.journey.legs.find((l) => l.id === sh.leg);
      const d = addTurn('narr', sh.cap(S.plan, leg)); d.querySelector('.tx').textContent = sh.cap(S.plan, leg);
    }
    for (const l of S.world.shipLog) { const t = `ship log ${shipStamp(l.tau)}: ${l.text}`; const d = addTurn('narr', t); d.querySelector('.tx').textContent = t; }
  }
  const open = S.mind.opening();
  setTimeout(() => present(open, { source: 'engine' }), REDUCE ? 0 : 2600);
  renderChips(); renderActs([]);
  setTimeout(() => $('q').focus({ preventScroll: true }), REDUCE ? 0 : 3200);
}

function renderLog() {
  const told = new Set(S.mind.snapshot().told);
  const W = S.world;
  const resolved = (l) => {
    if (l.anomaly) return told.has('answer') ? `TALLY's answer, compressed to 1 s: "${W.answer.words}"` : null;
    const e = W.eras.find((x) => 'era-' + x.id === l.id);
    if (!e) return null;
    const need = { count: 'count', argument: 'argument', reverence: 'reading', dread: 'reading', after: 'fate', hush: 'fate', going: 'fate', slowing: 'fate', thinning: 'fate' }[e.id];
    if (!told.has(need)) return null;
    return `year ${fmtInt(e.from)} · ${e.name} begins${e.id === 'reverence' || e.id === 'dread' ? `: they call the pulse ${W.pulseWord}` : ''}`;
  };
  $('tlog').innerHTML = W.shipLog.map((l) => {
    const r = resolved(l);
    return `<li class="${r ? 'res' : ''}${l.anomaly ? ' anom' : ''}"><span class="t">${esc(shipStamp(l.tau))}</span><span class="d">${esc(r || l.text)}</span></li>`;
  }).join('');
}

function renderEngine(plan) {
  const sn = S.mind.snapshot();
  const lv = [0, 1, 2, 3, 4].map((i) => `<span class="${i <= sn.level ? 'on' : ''}" title="${esc(LEVEL_NAMES[i])}"></span>`).join('');
  const d = plan && plan.delta ? ` <em class="${plan.delta > 0 ? 'up' : 'dn'}">${plan.delta > 0 ? '+' : ''}${plan.delta.toFixed(2)}</em>` : '';
  $('eng').innerHTML = `
    <span class="ei"><span class="ek">trust</span><span class="meter" title="${sn.trust.toFixed(2)}"><i style="width:${(sn.trust * 100).toFixed(0)}%"></i></span>${d}</span>
    <span class="ei"><span class="ek">disclosure</span><span class="lv">${lv}</span><b>${esc(LEVEL_NAMES[sn.level])}</b></span>
    <span class="ei"><span class="ek">mood</span><b>${esc(sn.mood)}</b></span>
    <span class="ei"><span class="ek">told</span><b>${sn.told.length}/${sn.total}</b></span>
    <span class="ei"><span class="ek">heard</span><b>${plan ? esc(plan.intent) : '·'}</b></span>
    <span class="ei"><span class="ek">model</span><b>${S.modelCalls} voiced · ${S.modelRefused || 0} refused</b></span>
    <span class="ei"><span class="ek">seed</span><b>${S.world.seed}</b></span>
    <details class="mem"><summary>memory</summary><ol>${sn.memory.slice().reverse().map((m) => `<li>turn ${m.turn} · ${m.who === 'you' ? esc(m.intent) : 'TALLY ' + esc(m.intent)} · ${esc(m.text)}${m.delta ? ` · ${m.delta > 0 ? '+' : ''}${m.delta}` : ''}</li>`).join('') || '<li>nothing yet</li>'}</ol></details>
    <button class="lnk" id="voiceT" type="button" aria-pressed="${S.voice === 'model'}" title="On revelations a model may voice TALLY's reply; the engine decides the facts either way.">${S.voice === 'model' ? 'model voices revelations' : 'engine voice only'}</button>`;
  $('voiceT').addEventListener('click', () => { S.voice = S.voice === 'model' ? 'engine' : 'model'; renderEngine(plan); });
}

const CHIP_FOR = {
  self: 'Who are you?', clocks: 'How long was I gone?', physics: 'Why did so much time pass?', surface: 'What am I looking at?',
  alone_now: 'Where is everyone?', beacon: 'Did my heartbeat reach you?', line0: 'What is the bright line?', line: 'Why is the line so long?',
  message: 'Did my message arrive?', watch: 'What happened while I was gone?', count: 'What did my heartbeat become?', alone_long: 'Are you alone?',
  ice: 'Why is there so much ice?', eras: 'Tell me everything, in order.', argument: 'Did they believe it was me?', reading: 'What did they call the pulse?',
  told_them: 'Did you tell them it was me?', fate: 'What happened to the people?', last_voice: 'Who spoke to you last?',
  answer: 'What is the noise burst in my log?', secret: 'Why are you still awake?',
};

function renderChips() {
  const host = $('chips');
  if (!S.mind || S.ending) { host.innerHTML = ''; return; }
  const L = S.mind.level();
  const F = S.mind.F;
  const pool = Object.values(F).filter((f) => !f.told && CHIP_FOR[f.id]);
  const now = pool.filter((f) => f.level <= L).sort((a, b) => a.level - b.level).slice(0, 3);
  const tease = pool.filter((f) => f.level === L + 1).slice(0, 1);
  const list = [...now, ...tease].slice(0, 4);
  host.innerHTML = list.map((f) => `<button type="button" class="chip${f.level > L ? ' lock' : ''}" data-q="${esc(CHIP_FOR[f.id])}">${esc(CHIP_FOR[f.id])}</button>`).join('');
  host.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => ask(b.dataset.q)));
}

function renderActs(acts) {
  const host = $('acts');
  host.innerHTML = (acts || []).map((a) => `<button class="act" type="button" data-a="${a.id}">${esc(a.label)}</button>`).join('');
  host.querySelectorAll('.act').forEach((b) => b.addEventListener('click', () => end(b.dataset.a)));
}

function addTurn(who, text, meta = {}) {
  const div = document.createElement('div');
  div.className = `turn ${who}${meta.silence ? ' sil' : ''}`;
  div.innerHTML = `<span class="who">${who === 'you' ? 'you' : who === 'narr' ? 'caption' : 'TALLY'}</span><span class="tx"></span>`;
  $('transcript').appendChild(div);
  S.transcript.push({ who, text, source: meta.source, model: meta.model });
  return div;
}

/* The reveal grammar: characters per second by mood. A withdrawn or
   grieving TALLY slows, and breaks at sentence ends. */
const TYPE_CPS = { withdrawn: 22, guarded: 34, measuring: 46, open: 56, warm: 62, grieving: 30 };

async function typeInto(div, text, mood = 'measuring') {
  const tx = div.querySelector('.tx');
  if (REDUCE) { tx.textContent = text; return; }
  const caret = document.createElement('span'); caret.className = 'caret';
  const cps = TYPE_CPS[mood] || 46;
  const breaks = mood === 'grieving' || mood === 'withdrawn';
  for (let i = 0; i <= text.length; i += 2) {
    tx.textContent = text.slice(0, i);
    tx.appendChild(caret);
    $('transcript').scrollTop = 1e9;
    const pause = breaks && /[.?]/.test(text.charAt(i - 1)) ? 520 : 0;
    await new Promise((r) => setTimeout(r, 2000 / cps + pause));
  }
  tx.textContent = text;
}

function thinking(on, text = '', canSkip = false) {
  $('thinking').hidden = !on;
  $('thinkt').textContent = text;
  $('nowait').hidden = !canSkip;
}

async function present(plan, { source = 'engine', model = '', note = '' } = {}) {
  const text = plan.silence ? (plan.note || 'TALLY does not answer.') : plan.text;
  const div = addTurn('tally', text, { source, model, silence: plan.silence });
  sound.mood(plan.mood);
  sound.voice(Math.min(6, text.length / 40));
  await typeInto(div, text, plan.mood);
  if (source !== 'engine' || note) {
    const s = document.createElement('span'); s.className = 'src';
    s.textContent = source === 'engine' ? `TALLY's own engine${note ? ` · ${note}` : ''}` : `voiced by ${model || source}${source === 'ollama' ? ' on your machine' : source === 'pollinations' ? ' via the public route' : ''} · checked against the engine's facts`;
    div.appendChild(s);
  }
  // every reply that carries a fact says what the fact rests on
  const extra = plan.intent === 'opening' ? ['clocks', 'beacon'] : plan.intent === 'answer-to-tally' && /beats/.test(plan.text) ? ['clocks'] : plan.intent === 'idle' ? ['beacon'] : [];
  const tags = [...new Set([...extra, ...(plan.facts || [])].map((id) => S.mind.F[id]?.tag).filter(Boolean))];
  if (tags.length) { const t = document.createElement('span'); t.className = 'src tagline'; t.textContent = tags.join(' · '); div.appendChild(t); }
  $('transcript').scrollTop = 1e9;
  renderLog(); renderEngine(plan); renderChips(); renderActs(plan.acts);
  S.lastActivity = performance.now();
  if (plan.silence && S.mind.s.silences >= 3 && !S.ending) setTimeout(() => end('silence'), 2500);
}

async function voiceWithModel(plan, visitorText) {
  const ctrl = new AbortController();
  S.abort = ctrl;
  const t0 = performance.now();
  const status = () => {
    const st = routeStatus();
    const sec = Math.round((performance.now() - t0) / 1000);
    if (st.route === 'pollinations' && st.readyIn > 0) return `TALLY is choosing its words. The public model route allows one reply every 45 seconds; it opens in ${st.readyIn} s.`;
    if (st.route === 'ollama') return `TALLY is choosing its words · ${st.model} on your machine · ${sec} s`;
    if (st.route === 'pollinations') return `TALLY is choosing its words · public route · ${sec} s`;
    return `TALLY is choosing its words · ${sec} s`;
  };
  // a closed public window is part of the fiction: the engine speaks while the model waits
  const st0 = routeStatus();
  if (st0.route === 'pollinations' && st0.readyIn > 3) await present({ ...plan, text: S.mind.interim(), facts: [], acts: plan.acts }, { source: 'engine', note: 'while the public model route opens' });
  thinking(true, status(), true);
  const iv = setInterval(() => thinking(true, status(), true), 1000);
  try {
    const v = await voiceTurn({ mind: S.mind, plan, visitorText, history: S.transcript, signal: ctrl.signal });
    if (v.source !== 'engine' || v.refused) S.modelCalls++;
    if (v.refused) S.modelRefused = (S.modelRefused || 0) + 1;
    if (v.json && S.mind) S.mind.noteModel(v);
    return v;
  } finally {
    clearInterval(iv);
    thinking(false);
    S.abort = null;
  }
}

async function ask(text) {
  const q = String(text || '').trim();
  if (!q || S.busy || !S.mind || S.ending) return;
  S.busy = true;
  S.lastActivity = performance.now();
  $('q').value = '';
  const you = addTurn('you', q);
  you.querySelector('.tx').textContent = q;
  $('transcript').scrollTop = 1e9;
  const plan = S.mind.respond(q);
  renderEngine(plan);
  try {
    if (plan.weight >= 2 && !plan.silence && S.voice === 'model') {
      const v = await voiceWithModel(plan, q);
      await present({ ...plan, text: v.text }, v);
    } else {
      const ms = REDUCE ? 0 : plan.pause;
      if (ms > 900) thinking(true, plan.silence ? 'TALLY is silent.' : `TALLY pauses. The engine answered at once; the ${(ms / 1000).toFixed(1)} s is pacing.`);
      await new Promise((r) => setTimeout(r, ms));
      thinking(false);
      await present(plan, { source: 'engine' });
    }
  } finally {
    S.busy = false;
    S.lastActivity = performance.now();
  }
}

/* patience: if the visitor is quiet, TALLY may speak, and trust rises a little */
setInterval(() => {
  if (S.phase !== 'talk' || S.busy || S.ending || !S.mind || S.idleCount >= 3) return;
  if (document.activeElement === $('q') && $('q').value) return;
  const quiet = (performance.now() - S.lastActivity) / 1000;
  if (quiet < 26) return;
  const plan = S.mind.idle(quiet);
  if (!plan) return;
  S.idleCount++;
  S.busy = true;
  present(plan, { source: 'engine' }).finally(() => { S.busy = false; });
}, 1000);

/* ---------------- IV. the ending ---------------- */
function end(kind) {
  if (!S.mind) return;
  if (S.abort) S.abort.abort();
  const e = S.mind.ending(kind);
  if (!e) return;
  S.ending = e;
  phase('end');
  $('end-k').textContent = 'ending · ' + kind;
  $('end-h').textContent = e.title;
  $('endtext').innerHTML = e.text.split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('');
  const sn = S.mind.snapshot(), W = S.world;
  $('endnums').innerHTML = `your clock ${esc(fmtDur(S.plan.shipS))} · home ${fmtInt(W.years)} years · ratio ×${esc(fmtSci(W.plan.factorMax))}<br>
    TALLY told you ${sn.told.length} of the ${sn.total} things it knew · ${S.modelCalls} model call${S.modelCalls === 1 ? '' : 's'} · ${S.transcript.filter((t) => t.who === 'you').length} things you said`;
  const P = S.plan;
  const tideAt = (rM) => P.method === 'flight' ? 0 : 2 * P.mSun * GM_SUN * LAB.bodyL / Math.pow(rM * P.mSun * GM_SUN / (299792458 ** 2), 3) / G0;
  const prop = propellant(P, LAB.craftKg);
  const tons = (kg) => (kg > 1e300 ? 'beyond count' : `${fmtSci(kg / 1000)} t`);
  $('endledger').innerHTML = `<tr><td>leg</td><td>you</td><td>home</td><td>tide</td><td>mass after</td></tr>` + P.journey.legs.map((l, i) =>
    `<tr><td>${esc(LEG_NAMES[l.id] || l.id)}</td><td>${esc(fmtDur(l.shipS, { short: true }))}</td><td>${esc(fmtYears(l.homeS))}</td>` +
    `<td>${P.method === 'flight' ? '0 g' : esc(fmtSci(tideAt(Math.min(l.rFrom, l.rTo))) + ' g')}</td>` +
    `<td>${esc(tons(prop.legs[i].massAfterKg))}</td></tr>`).join('');
  $('replay').innerHTML = P.journey.legs.map((l, i) => `<li><b>${i + 1}. ${esc(LEG_NAMES[l.id] || l.id)}</b> · ${esc(legWhy(P, l))}. You: ${esc(fmtDur(l.shipS))}. Home: ${esc(fmtYears(l.homeS))}.</li>`).join('') +
    `<li><b>total</b> · ${esc(fmtDur(P.shipS))} for you, ${fmtInt(LAB.outsideYears)} years at home. ${esc(formulaFor(P).cite.replace(/&amp;/g, '&'))}</li>`;
  scene.u.glow = 0.55;
  sound.ping(660, 0.1);
  const seen = readEndings(); seen.add(e.variant); try { localStorage.setItem('lw.endings', JSON.stringify([...seen])); } catch { /* storage blocked */ }
  $('endmap').innerHTML = `<span class="ek">endings reached on this device · ${seen.size} of ${ENDING_VARIANTS.length}</span>` +
    ENDING_VARIANTS.map(([id, name]) => `<span class="em${seen.has(id) ? ' on' : ''}${id === e.variant ? ' now' : ''}" title="${seen.has(id) ? esc(name) : 'not reached yet'}">${seen.has(id) ? esc(name) : '?'}</span>`).join('');
}

function readEndings() { try { return new Set(JSON.parse(localStorage.getItem('lw.endings') || '[]')); } catch { return new Set(); } }

function record() {
  return buildRecord({ world: S.world, plan: S.plan, mind: S.mind, transcript: S.transcript, ending: S.ending, url: location.href.split('#')[0] + location.hash, version: VERSION, model: { voiced: S.modelCalls, refused: S.modelRefused || 0 } });
}

/* ---------------- sources panel ---------------- */
function renderSources() {
  const checks = referenceChecks();
  $('srcbody').innerHTML = `
    <h4>Formulas and values</h4>
    <ul>${SOURCES.map((s) => `<li><b>${esc(s.cite)}</b>: ${esc(s.use)}</li>`).join('')}</ul>
    <h4>Constants</h4>
    <table>${CONSTANTS.map((c) => `<tr><td>${esc(c.k)}</td><td>${esc(c.v)}</td><td>${esc(c.src)}</td></tr>`).join('')}</table>
    <h4>Real holes on the mass slider</h4>
    <ul>${HOLES.map((h) => `<li>${esc(h.name)}: ${fmtSci(h.mSun)} Msun · ${esc(h.src)}</li>`).join('')}</ul>
    <h4>What the page corrects</h4>
    <ul>${MISCONCEPTIONS.map(([a, b]) => `<li><b>${esc(a)}</b> ${esc(b)}</li>`).join('')}</ul>
    <h4>The engine against published values</h4>
    <table><tr><th>check</th><th>engine</th><th>published</th><th>error</th></tr>
    ${checks.map((c) => `<tr><td>${esc(c.what)}<br><span style="color:var(--text-faint)">${esc(c.src)}</span></td><td>${c.got.toPrecision(6)}${c.unit ? ' ' + esc(c.unit) : ''}</td><td>${c.want.toPrecision(5)}</td><td class="${c.err < 2e-3 ? 'ok' : ''}">${(c.err * 100).toPrecision(2)} %</td></tr>`).join('')}</table>
    <h4>What is invented</h4>
    <p>The world's history, its people, TALLY and its words are generated from a seed made of your crossing and your line for home. The hole is placed 0.6 light-years from home so travel to it can be ignored; no hole is known that close to any star. The body tolerance bands are illustrative: no person has lived for months above about 1 g. The lensing picture traces light around a non-spinning hole; frame dragging by the spin is not drawn.</p>
    <h4>The story</h4>
    <p>An original story in the spirit of TRIVERSE, Luis Blanco's hard-SF saga in progress. It shares the saga's question, what we do with a signal we cannot read, and none of its plot.</p>
    <h4>Render</h4>
    <p>Three tiers, chosen from measured frame time: ${scene.ok ? `now tier <b id="tierNow">${scene.tier}</b>` : 'WebGL is off'}. <button class="lnk" type="button" data-tier="0">low</button> · <button class="lnk" type="button" data-tier="1">mid</button> · <button class="lnk" type="button" data-tier="2">high</button> · <a class="lnk" href="?text">text only</a></p>
    <h4>The model</h4>
    <p>A deterministic engine decides every fact TALLY says. On heavy turns a language model may voice the reply, through the labs' shared route: your own machine when served locally, your key if you bring one, or a public route that allows one reply every 45 seconds. A reply that adds a number or names a locked fact is refused and the engine's words are used.</p>
    <p id="evalNote">Measured contribution: loading.</p>`;
  // the measured share of model replies, from the repo's own evaluation run (model-eval.mjs)
  fetch('assets/js/last-witness/model-eval.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((e) => {
    const n = $('evalNote');
    if (!n) return;
    if (!e) { n.textContent = 'Measured contribution: no evaluation file.'; return; }
    const mm = e.model_mode;
    const why = Object.entries(mm.refused_by_reason).map(([k, v]) => `${v} ${k}`).join(', ') || 'none';
    n.textContent = `Measured contribution (${e.measured.slice(0, 10)}, ${e.model} on ${e.route}, ${e.questions} fixed lines, every line sent to the model): ${mm.voiced} replies accepted, ${mm.refused} refused (${why}); the model's stated intent matched the engine's on ${mm.intent_matches_engine} of ${e.questions}. Method: model-eval.mjs in this lab's folder.`;
  }).catch(() => {});
}

/* ---------------- wiring ---------------- */
function bind() {
  $('srcbody').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tier]');
    if (!t || !scene.setTier) return;
    scene.lockTier = true; scene.setTier(Number(t.dataset.tier));
    const n = $('tierNow'); if (n) n.textContent = scene.tier;
  });
  $('cross').addEventListener('click', startCrossing);
  $('msg').addEventListener('input', () => writeHash());
  $('share').addEventListener('click', async () => {
    writeHash();
    try { await navigator.clipboard.writeText(location.href); $('share').textContent = 'link copied'; }
    catch { $('share').textContent = 'link in the address bar'; }
    setTimeout(() => { $('share').textContent = 'copy link'; }, 1800);
  });
  $('skip').addEventListener('click', () => { if (S.film && !S.film.done) { S.film.done = true; S.film.t0 = -1e9; filmFrame(performance.now()); arrive(); } });
  $('ask').addEventListener('submit', (e) => { e.preventDefault(); ask($('q').value); });
  $('q').addEventListener('input', () => { S.lastActivity = performance.now(); });
  $('nowait').addEventListener('click', () => { if (S.abort) S.abort.abort(); });
  $('rec_txt').addEventListener('click', () => download(`witness-record-${S.world.seed}.txt`, record().text, 'text/plain'));
  $('rec_json').addEventListener('click', () => download(`witness-record-${S.world.seed}.json`, JSON.stringify(record().json, null, 2), 'application/json'));
  $('again').addEventListener('click', () => { S.ending = null; S.film = null; phase('plan'); setPreviewScene(); update(); });
  $('snd').addEventListener('click', async () => {
    if (sound.on) { sound.disable(); $('snd').textContent = 'sound off'; $('snd').setAttribute('aria-pressed', 'false'); }
    else if (await sound.enable()) { $('snd').textContent = 'sound on'; $('snd').setAttribute('aria-pressed', 'true'); if (S.world) sound.setCarrier(S.world.beacon.carrierMinHz); }
  });
  addEventListener('resize', () => { if (S.phase === 'talk' || S.phase === 'end') { PL = planetLayout(); Object.assign(scene.u, PL); } });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.phase === 'film') $('skip').click(); });
  if (window.self !== window.top) $('back').hidden = true;
}

/* ---------------- the loop ---------------- */
let lastNow = performance.now();
let heartT = 0;
function loop(now) {
  const dt = now - lastNow; lastNow = now;
  const t = STILL ? 8 : (now - S.pageT0) / 1000;
  if (S.phase === 'plan') {
    previewFrame(t);
    scene.u.ignite = REDUCE ? 1 : clamp(t / 2.2, 0, 1);
    // the pilot's heart in the planner: real rate, so the page has a pulse
    if (now - heartT > 1000 / LAB.heartHz) { heartT = now; sound.thump(0.22); }
  } else if (S.phase === 'film') {
    filmFrame(now);
  } else if (S.phase === 'talk' || S.phase === 'end') {
    const k = REDUCE ? 1 : clamp((now - (S.arriveT || now)) / 2600, 0, 1);
    scene.u.reveal = ease(k);
    scene.u.radius = PL ? PL.radius * (0.82 + 0.18 * ease(k)) : 200;
    scene.u.rot = (S.rot0 || 0) + (REDUCE ? 0 : (now - (S.arriveT || now)) / 1000 * 0.008);
    // the station pulses at the rate home now hears your heart: in real time, now that you are here
    scene.u.pulse = 0.5 + 0.5 * Math.cos(now / 1000 * LAB.heartHz * Math.PI * 2);
    renderLabels();
  }
  scene.render(t, dt);
  if (S.phase === 'plan' && Math.floor(t * 2) !== loop.lastT) { loop.lastT = Math.floor(t * 2); tick(); }
  if (scene.ok && Math.floor(t) !== loop.lastF) { loop.lastF = Math.floor(t); const n = $('tierNow'); if (n) n.textContent = `${scene.tier} · median ${scene.medianMs ? scene.medianMs.toFixed(1) : '-'} ms a frame`; }
  requestAnimationFrame(loop);
}

function boot() {
  readHash();
  renderModes();
  renderParams();
  bind();
  renderSources();
  mountRoutePanel($('route'));
  update();
  setPreviewScene();
  document.querySelectorAll('.pleft > *, .pright > *').forEach((el, i) => { el.classList.add('reveal'); el.style.transitionDelay = `${0.15 + i * 0.06}s`; });
  requestAnimationFrame(() => document.body.classList.add('ready'));
  if (!scene.ok) document.body.classList.add('nogl');
  if (TEXT) document.body.classList.add('textmode');
  phase('plan');
  if (STILL) { previewFrame(8); scene.render(8, 16); tick(); }
  requestAnimationFrame(loop);
  // ?demo jumps straight to the return (for screenshots and for the curious)
  if (params.has('demo')) { startCrossing(); if (S.phase === 'film') { S.film.done = true; arrive(); } }
  // ?cross[=seconds] starts the crossing at once, optionally that far into the film
  if (params.has('cross')) { startCrossing(); if (S.film) S.film.t0 -= (Number(params.get('cross')) || 0) * 1000; }
  // ?say=a|b|c sends lines after the return, one after another (for tests and screenshots)
  if (params.has('say')) {
    const lines = params.get('say').split('|').filter(Boolean);
    const next = () => {
      if (S.busy || S.phase !== 'talk' || !S.transcript.length) { setTimeout(next, 300); return; }
      if (!lines.length) { if (params.has('end')) end(params.get('end')); return; }
      ask(lines.shift()); setTimeout(next, 300);
    };
    setTimeout(next, 3000);
  }
  if (params.has('sources')) $('src').open = true;
  if (params.has('debug')) setInterval(() => console.log('[lw] phase', S.phase, S.film ? ((performance.now() - S.film.t0) / 1000).toFixed(2) + ' done=' + S.film.done : ''), 700);
  if (params.has('debug')) setTimeout(() => {
    const wide = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((e) => e.tagName + '.' + e.className + '#' + e.id + ':' + Math.round(e.getBoundingClientRect().right));
    console.log('[lw] iw', innerWidth, 'sw', document.documentElement.scrollWidth, wide.join(' | '));
  }, 2500);
}

boot();
