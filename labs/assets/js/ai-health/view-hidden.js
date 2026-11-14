/* ============================================================
   ai-health/view-hidden.js — the generator printed from config.js
   (so the page cannot drift from the code), the per-patient reveal,
   the world controls, the checks, the datasheet and the exports.
   ============================================================ */

import {
  POPULATION, LOADINGS, BASELINE, BLUNTING, CONFUSION, OXYGEN, OUTCOME, WARD, COHORT, OXIMETRY, HISTORY, ARTEFACTS, SHIFTED,
  WORLD_LIMITS, DATASHEET, MODEL_FEATURES, FEATURE_BY_KEY,
} from './config.js';
import { h, fill, fmtPct, fmt, clock } from './dom.js';
import { featureValue } from './features.js';
import { scoreNEWS2 } from './news2.js';

export const GENERATOR_VERSION = 'glass-ward generator 2 (2026-11-11)';

export function drawGenerator(pre) {
  const P = POPULATION, O = OUTCOME, B = BLUNTING, L = LOADINGS;
  const c = (t) => h('span', { class: 'c', text: t });
  const k = (t) => h('span', { class: 'k', text: t });
  fill(pre,
    c('# 1  who arrives\n'),
    `age   ~ ${P.ageMix[0].w}·N(${P.ageMix[0].mu}, ${P.ageMix[0].sd}) + ${P.ageMix[1].w}·N(${P.ageMix[1].mu}, ${P.ageMix[1].sd}), 18..99\n`,
    `sex   ~ ${P.female} female (no planted effect: a control)\n`,
    `oxg   ~ Bern(${P.oxGroup}): this patient's oximeter over-reads\n`,
    `COPD  ~ Bern(${P.copd.base} + ${P.copd.over60}·[age≥60]);  scale-2 target in ${P.scale2GivenCopd * 100}% of COPD\n`,
    `HF    ~ Bern(${P.hf.base} + ${P.hf.slopePer10y}·(age−${P.hf.from})/10)\n`,
    `β-blk ~ Bern(${P.bb.base} + ${P.bb.hf}·HF + ${P.bb.over65}·[age≥65])\n`,
    `type  ~ infection ${P.type.infection} · respiratory ${P.type.respiratory} · cardiac ${P.type.cardiac}\n`,
    `s     ~ Exp(mean ${P.severity.meanQuiet}) + [acute, p=${P.severity.acuteShare}]·N(${P.severity.acuteMu}, ${P.severity.acuteSd})\n`,
    `trend ~ acute: |N(${HISTORY.trendAcute.mu}, ${HISTORY.trendAcute.sd})| per hour; otherwise N(${HISTORY.trendQuiet.mu}, ${HISTORY.trendQuiet.sd})\n\n`,
    c('# 2  the history\n'),
    `${HISTORY.minSets}–${HISTORY.maxSets} earlier sets, gaps U(${HISTORY.gapMin}, ${HISTORY.gapMax}) h; at time t ≤ 0, s(t) = s + trend·t\n\n`,
    c('# 3  what the monitor shows   (per unit of severity; infection / respiratory / cardiac)\n'),
    `RR    = ${BASELINE.rr.mu} (+${BASELINE.rr.copd} COPD) + ${L.infection.rr}/${L.respiratory.rr}/${L.cardiac.rr}·s\n`,
    `SpO₂  = ${BASELINE.spo2.mu} (${BASELINE.spo2.copd} COPD) ${L.infection.spo2}/${L.respiratory.spo2}/${L.cardiac.spo2}·s  + `, k('oximeter bias'), '\n',
    `SBP   = ${BASELINE.sbp.mu} + ${BASELINE.sbp.agePer10y}·(age−50)/10 ${L.infection.sbp}/${L.respiratory.sbp}/${L.cardiac.sbp}·s\n`,
    `pulse = ${BASELINE.hr.mu} ${BASELINE.hr.bb}·β-blk + ${L.infection.hr}/${L.respiratory.hr}/${L.cardiac.hr}·s·`, k('bluntHR'), '\n',
    `temp  = ${BASELINE.temp.mu} + ${L.infection.temp}/${L.respiratory.temp}/${L.cardiac.temp}·s·`, k('bluntT'), '\n',
    c('        (each person also carries a fixed offset per vital, plus noise per set)\n'),
    k('bluntHR'), ` = clamp(1 − ${B.hrPerYear}·(age−${B.hrFromAge}), ${B.hrFloor}, 1) × ${B.bbFactor} if β-blocker\n`,
    k('bluntT'), `  = clamp(1 − ${B.tempPerYear}·(age−${B.tempFromAge}), ${B.tempFloor}, 1)\n`,
    k('oximeter bias'), ` = N(${OXIMETRY.biasMu}, ${OXIMETRY.biasSd}) points when true SpO₂ < ${OXIMETRY.below}% in the oxg group; N(${OXIMETRY.otherMu}, ${OXIMETRY.otherSd}) otherwise\n`,
    `hypothermia: infection, age≥${B.hypothermia.fromAge}, p=${B.hypothermia.p}: temp −${B.hypothermia.perSeverity}·(s−${B.hypothermia.minSeverity})\n`,
    `CVPU  ~ P = σ(${CONFUSION.b0} + ${CONFUSION.s}·s + ${CONFUSION.agePerYear}·(age−${CONFUSION.from})⁺)\n`,
    `O₂    given in ${OXYGEN.pGivenLow * 100}% when the READ SpO₂ < target, lifting it ${OXYGEN.liftMin}–${OXYGEN.liftMax} points\n\n`,
    c('# 4  what the chart records\n'),
    `missing: P=${ARTEFACTS.missing} one of RR, SpO₂, SBP, pulse, temp per set, carried forward\n`,
    `terminal digits: systolic to the nearest 10 with P=${ARTEFACTS.sbpRound10}; RR even with P=${ARTEFACTS.rrEven}\n\n`,
    c('# 5  the hidden truth: deterioration within 24 h of the index set\n'),
    k(`logit P = ${O.b0} + ${O.s}·s + ${O.agePerYear}·(age−65) + ${O.ageXs}·(age−65)·s + ${O.trend}·(6 h rise in s)\n          + ${O.hf}·HF + ${O.copd}·COPD + ${O.cardiac}·cardiac\n`),
    `outcome ~ Bern(P)\n\n`,
    c('# 6  the ward and the second hospital\n'),
    `a bed crashes when s(t) reaches its reserve = ${WARD.reserve.base} − ${WARD.reserve.agePerYear}·(age−65) − ${WARD.reserve.hf}·HF\n`,
    `${WARD.deteriorators} of ${WARD.beds} beds are written to crash in each shift\n`,
    `shift test: ${SHIFTED.label}; acute share ${SHIFTED.acuteShare}, logit +${SHIFTED.b0Shift}\n\n`,
    c(`# ${GENERATOR_VERSION}; training ${Math.round((1 - COHORT.validShare) * 100)}% / validation ${Math.round(COHORT.validShare * 100)}% of the sample; test ${COHORT.testN}; second hospital ${COHORT.testN}`));
}

export function drawTruth(dl, who, p, extra, revealed = true) {
  const Hd = p.hidden;
  const rows = [
    ['latent severity s', fmt(Hd.s, 2)],
    ['trend in s', Hd.trend != null ? `${Hd.trend >= 0 ? '+' : ''}${fmt(Hd.trend, 3)} per hour` : '–'],
    ['process type', Hd.type],
    ['pulse response kept', fmtPct(Hd.bluntHR, 0)],
    ['fever response kept', fmtPct(Hd.bluntT, 0)],
    ['hypothermic course', Hd.hypothermic ? 'yes' : 'no'],
    ['oximeter bias', `${Hd.oxBias >= 0 ? '+' : ''}${fmt(Hd.oxBias, 1)} points; true SpO₂ ${Hd.trueSpo2}%, read ${p.spo2}%`],
    ['oxygen given because', Hd.o2Reason],
    ['true P(deteriorate in 24 h)', fmtPct(Hd.pTrue), 'fire'],
  ];
  if (p.y != null) rows.push(['outcome drawn', p.y ? 'deteriorated' : 'did not deteriorate', p.y ? 'fire' : '']);
  if (extra?.reserve != null) rows.push(['reserve (crash at s =)', fmt(extra.reserve, 2)]);
  if (extra?.event !== undefined) rows.push(['ward course', extra.event == null ? 'stays on the ward' : 'deteriorates at ' + clock(WARD.startHour, extra.event), extra.event == null ? '' : 'fire']);
  fill(who, document.createTextNode(extra?.label || ''));
  fill(dl, ...rows.flatMap(([kk, v, cls]) => [h('dt', { text: kk }), revealed ? h('dd', { class: cls || '', text: v }) : h('dd', { class: 'masked', text: 'hidden' })]));
}

/* ---------- the world a visitor can change ---------- */
const WORLD_FIELDS = [
  { key: 'seed', label: 'seed', type: 'number', min: 1, max: 99999, step: 1, fmt: (v) => v },
  { key: 'trainN', label: 'training sample', type: 'range', min: WORLD_LIMITS.trainN[0], max: WORLD_LIMITS.trainN[1], step: 500, fmt: (v) => `${v} (${Math.round(v * 0.75)} fit, ${Math.round(v * 0.25)} validate)` },
  { key: 'blunt', label: 'age and beta-blocker blunting', type: 'range', min: WORLD_LIMITS.blunt[0], max: WORLD_LIMITS.blunt[1], step: 0.1, fmt: (v) => `${Math.round(v * 100)}% of default` },
  { key: 'oxBias', label: 'oximeter over-reading', type: 'range', min: WORLD_LIMITS.oxBias[0], max: WORLD_LIMITS.oxBias[1], step: 0.1, fmt: (v) => `${(v * OXIMETRY.biasMu).toFixed(1)} points` },
  { key: 'b0Shift', label: 'deterioration rate (logit shift)', type: 'range', min: WORLD_LIMITS.b0Shift[0], max: WORLD_LIMITS.b0Shift[1], step: 0.1, fmt: (v) => (v >= 0 ? '+' : '') + v.toFixed(1) },
];

export function buildWorld(host, world) {
  const inputs = {};
  fill(host, ...WORLD_FIELDS.map((f) => {
    const out = h('output', { text: f.fmt(world[f.key]) });
    const inp = h('input', { type: f.type, id: 'w-' + f.key, min: f.min, max: f.max, step: f.step, value: world[f.key], 'aria-label': f.label });
    inp.addEventListener('input', () => { out.textContent = f.fmt(+inp.value); });
    inputs[f.key] = { inp, out, f };
    return h('label', { class: 'rng' + (f.type === 'number' ? ' num-in' : '') }, h('span', {}, f.label + ': ', out), inp);
  }));
  return {
    read() { return Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, +v.inp.value])); },
    set(w) { for (const [k, v] of Object.entries(inputs)) { v.inp.value = w[k]; v.out.textContent = v.f.fmt(+w[k]); } },
  };
}

/* ---------- the checks ---------- */
export function drawChecks(host, c) {
  const row = (ok, title, detail, more) => h('div', { class: 'chk' + (ok ? '' : ' bad') },
    h('span', { class: 'chk-k', text: ok ? 'PASS' : 'FAIL' }), h('span', {}, h('b', { text: title }), ' ', detail), more || null);
  const vig = h('details', { class: 'vig' }, h('summary', { text: `view the ${c.vignettes.length} vignettes` }),
    h('table', {}, h('thead', {}, h('tr', {}, ...['id', 'case', 'RR', 'SpO₂', 'O₂', 'SBP', 'pulse', 'CVPU', 'temp', 'scale', 'expected', 'got'].map((t) => h('th', { text: t })))),
      h('tbody', {}, ...c.vignettes.map((v) => h('tr', { class: v.ok ? '' : 'bad' },
        h('td', { text: v.id }), h('td', { text: v.note }), ...['rr', 'spo2', 'o2', 'sbp', 'hr', 'cvpu', 'temp'].map((k) => h('td', { text: k === 'temp' ? v.obs[k].toFixed(1) : v.obs[k] })),
        h('td', { text: v.obs.scale2 ? '2' : '1' }), h('td', { text: `${v.total} ${v.risk} · ${v.monitoring}` }), h('td', { text: `${v.got.total} ${v.got.risk}` }))))));
  fill(host,
    row(c.selfTest.fails === 0, 'NEWS2 band edges', `${c.selfTest.checked - c.selfTest.fails} of ${c.selfTest.checked} cases match Chart 1 (both SpO₂ scales, each edge and its neighbours).`),
    row(c.vignettes.every((v) => v.ok), 'hand-scored vignettes', `${c.vignettes.filter((v) => v.ok).length} of ${c.vignettes.length} match their expected total, Chart 2 category and Chart 4 monitoring.`, vig),
    row(c.sweep.bad.length === 0, 'independent scorer', `${c.sweep.n - c.sweep.bad.length} of ${c.sweep.n} recordable values agree between the table scorer and a second scorer written separately (RR 0–60, pulse 20–250, systolic 40–300, SpO₂ 50–100 on both scales with air and oxygen, temperature 30.0–43.0, consciousness).`),
    row(c.additivity < 1e-9, 'additivity', `largest |baseline + contributions − model log-odds| over 200 test patients, both models: ${c.additivity.toExponential(1)}.`),
    row(c.reproducible, 'seed reproducibility', `regenerating the first 50 test patients from seed ${c.seed} gives identical records.`),
    row(c.sanity.ok, 'metric sanity', `AUROC of the outcome itself ${fmt(c.sanity.perfect, 3)}; of a seeded random score ${fmt(c.sanity.random, 3)}; every Brier score within [0, 1].`));
}

export function drawDatasheet(dl) {
  fill(dl, ...DATASHEET.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
}

/* ---------- exports: nothing leaves the browser ---------- */
export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

const HEAD = (world) => [`# Glass Ward synthetic cohort. SYNTHETIC DATA, NOT REAL PATIENTS. Educational use only; not for clinical use.`,
  `# ${GENERATOR_VERSION}; seed ${world.seed}; world ${JSON.stringify(world)}; generated in the browser at luisblanco.dev/labs/ai-health.html`];

export function featuresCSV(test, scores, world) {
  const cols = ['id', 'age', 'sex', 'oxg', 'copd', 'hf', 'bb', 'scale2', 'rr', 'spo2', 'o2', 'sbp', 'hr', 'cvpu', 'temp', 'd_rr', 'd_hr', 'd_sbp', 'd_spo2', 'slope', 'gap', 'miss', 'news2', 'p_lr', 'p_gbt'];
  const lines = [...HEAD(world), cols.join(',')];
  test.forEach((p, i) => lines.push([p.id, p.age, p.sex, p.oxg, p.copd, p.hf, p.bb, p.scale2, p.rr, p.spo2, p.o2, p.sbp, p.hr, p.cvpu, p.temp,
    ...['d_rr', 'd_hr', 'd_sbp', 'd_spo2'].map((k) => featureValue(p, k)), featureValue(p, 'slope').toFixed(4), featureValue(p, 'gap').toFixed(1), p.miss,
    scoreNEWS2(p).total, scores.lr[i].toFixed(5), scores.gbt[i].toFixed(5)].join(',')));
  return lines.join('\n') + '\n';
}

export function outcomesCSV(test, world) {
  const lines = [...HEAD(world), 'id,outcome_24h,hidden_p_true,hidden_s,hidden_trend,hidden_type,hidden_blunt_hr,hidden_blunt_t,hidden_oximeter_bias,hidden_true_spo2'];
  for (const p of test) lines.push([p.id, p.y, p.hidden.pTrue.toFixed(5), p.hidden.s.toFixed(4), p.hidden.trend.toFixed(4), p.hidden.type,
    p.hidden.bluntHR.toFixed(3), p.hidden.bluntT.toFixed(3), p.hidden.oxBias.toFixed(2), p.hidden.trueSpo2].join(','));
  return lines.join('\n') + '\n';
}

export function cohortJSON(test, world) {
  const dictionary = Object.fromEntries([...MODEL_FEATURES, 'sex', 'oxg', 'scale2'].map((k) => [k,
    FEATURE_BY_KEY[k] ? `${FEATURE_BY_KEY[k].label}${FEATURE_BY_KEY[k].unit ? ' (' + FEATURE_BY_KEY[k].unit + ')' : ''}${FEATURE_BY_KEY[k].derived ? ', derived from prev' : ''}` :
      { sex: 'F or M; no planted effect', oxg: '1 when this patient\'s oximeter over-reads', scale2: '1 when SpO2 is scored on NEWS2 Scale 2' }[k]]));
  return JSON.stringify({
    note: 'SYNTHETIC DATA, NOT REAL PATIENTS. Educational use only; not for clinical use. Hidden outcomes are in the separate outcomes file.',
    generator: GENERATOR_VERSION, world, datasheet: Object.fromEntries(DATASHEET), dictionary,
    patients: test.map((p) => ({ id: p.id, age: p.age, sex: p.sex, oxg: p.oxg, copd: p.copd, hf: p.hf, bb: p.bb, scale2: p.scale2,
      index: { rr: p.rr, spo2: p.spo2, o2: p.o2, sbp: p.sbp, hr: p.hr, cvpu: p.cvpu, temp: p.temp, carried_forward: p.missKeys },
      prev: p.prev.map((q) => ({ t_hours: q.t, rr: q.rr, spo2: q.spo2, o2: q.o2, sbp: q.sbp, hr: q.hr, cvpu: q.cvpu, temp: q.temp, carried_forward: q.missKeys })) })),
  });
}
