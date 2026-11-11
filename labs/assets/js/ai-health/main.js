/* ============================================================
   ai-health/main.js — Glass Ward. Wires the engine (cohort, news2,
   features, models, metrics, counterfactual, explain) to the views.
   State lives in one object and in the query string, so any view of
   the lab can be shared as a link. Heavy work (cohort generation,
   fitting, the bootstrap) runs in chunks that yield to the page.
   ============================================================ */

import { COHORT, MODEL_FEATURES, WARD, CITATIONS, FEATURE_BY_KEY, WORLD_DEFAULT, MECHANISMS, ATTRIBUTES, SLICES, SHIFTED, MODEL } from './config.js';
import { makeCohortsAsync, makeShift, drawPatient } from './cohort.js';
import { scoreNEWS2, selfTest, checkVignettes, alerts } from './news2.js';
import { sweep } from './news2-check.js';
import { featureRow } from './features.js';
import { MODELS, MODEL_BY_ID, featureKeys } from './models.js';
import {
  roc, pr, confusion, calibration, thresholdForRate, news2RiskMap, decisionCurve, sortedOrder, weightedAUC, weightedAP, weightedBrier, percentile,
} from './metrics.js';
import { counterfactuals } from './counterfactual.js';
import { rankContribs, templateExplanation, verify, explainWithModel, topSet } from './explain.js';
import { $, $$, h, fill, fmtPct, fmt, clock, reducedMotion } from './dom.js';
import { createWard } from './view-ward.js';
import { drawROC, drawPR, drawCalibration, drawDCA, drawConfusion, drawTable, drawTrace, drawTerms } from './view-charts.js';
import {
  buildEditor, drawDerived, drawNewsGrid, drawWaterfall, drawObsChart, drawDistribution, drawCounterfactuals, drawExplanation, drawDeletion, drawModelCard,
} from './view-patient.js';
import { computeSlices, drawSlices, finding, worstSliceSearch, drawSearch } from './view-slices.js';
import { drawGenerator, drawTruth, buildWorld, drawChecks, drawDatasheet, download, featuresCSV, outcomesCSV, cohortJSON } from './view-hidden.js';
import { mountRoutePanel } from '../ai/route-panel.js';
import { LLM } from '../ai/llm.js';
import { sigmoid, streamFor } from './rng.js';

const reduce = reducedMotion();
const tier = ((navigator.hardwareConcurrency || 4) <= 4 || innerWidth < 600 || reduce) ? 'lite' : 'full';
const NAME = Object.fromEntries(MODELS.map((m) => [m.id, m.name]));
const SHORT = Object.fromEntries(MODELS.map((m) => [m.id, m.short]));
const DCA_GRID = Array.from({ length: 50 }, (_, i) => (i + 1) / 100);
const BOOT_B = 200;
const EDITABLE = ['rr', 'spo2', 'o2', 'sbp', 'hr', 'cvpu', 'temp', 'age', 'copd', 'hf', 'bb', 'scale2'];

/* ---------- state, mirrored in the query string ---------- */
const S = {
  world: { ...WORLD_DEFAULT, oldPct: null }, dropped: new Set(), kind: MODEL.defaults.kind, rule: { t: 5, red: false }, mt: null, wardSeed: 7,
  sel: null, patient: null, source: null, extra: null, edits: null, srcLabel: '',
  data: null, models: null, sc: null, shiftSc: null, riskMap: null, metrics: null, boot: null, shift: null, refs: null,
  before: null, llmCache: new Map(), tally: { calls: 0, n: 0, verified: 0, wrong: 0, added: 0 }, slicePick: null, timings: {}, wardSum: null, searchRes: null,
};

function readURL() {
  const q = new URLSearchParams(location.search);
  const num = (k, lo, hi) => { const v = Number(q.get(k)); return q.has(k) && q.get(k) !== '' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null; };
  S.world.seed = num('s', 1, 99999) ?? S.world.seed;
  S.world.trainN = num('n', 1000, 8000) ?? S.world.trainN;
  S.world.blunt = num('b', 0, 1.5) ?? S.world.blunt;
  S.world.oxBias = num('ox', 0, 2) ?? S.world.oxBias;
  S.world.b0Shift = num('p', -1, 1) ?? S.world.b0Shift;
  S.world.oldPct = num('old', 0, 40);
  S.wardSeed = num('w', 1, 99999) ?? S.wardSeed;
  if (MODEL_BY_ID[q.get('m')]) S.kind = q.get('m');
  for (const k of (q.get('drop') || '').split(',')) if (MODEL_FEATURES.includes(k)) S.dropped.add(k);
  S.rule.t = num('nt', 1, 15) ?? S.rule.t;
  S.rule.red = q.get('red') === '1';
  const mt = num('mt', 1, 999); S.mt = mt != null ? mt / 1000 : null;
  const sel = q.get('sel') || '';
  let m;
  if ((m = sel.match(/^b(\d+)h(\d+)$/))) S.sel = { src: 'ward', bed: +m[1], hour: +m[2] };
  else if ((m = sel.match(/^t(\d+)$/))) S.sel = { src: 'test', idx: +m[1] };
  const v = q.get('v');
  if (v) S.edits = Object.fromEntries(v.split('_').map((x) => x.split('~')).filter(([k, val]) => EDITABLE.includes(k) && Number.isFinite(+val)).map(([k, val]) => [k, +val]));
}

function writeURL() {
  const q = new URLSearchParams();
  const W = S.world, D = WORLD_DEFAULT;
  if (W.seed !== D.seed) q.set('s', W.seed);
  if (W.trainN !== D.trainN) q.set('n', W.trainN);
  if (W.blunt !== D.blunt) q.set('b', W.blunt);
  if (W.oxBias !== D.oxBias) q.set('ox', W.oxBias);
  if (W.b0Shift !== D.b0Shift) q.set('p', W.b0Shift);
  if (W.oldPct != null) q.set('old', W.oldPct);
  if (S.dropped.size) q.set('drop', [...S.dropped].join(','));
  q.set('m', S.kind);
  if (S.rule.t !== 5) q.set('nt', S.rule.t);
  if (S.rule.red) q.set('red', '1');
  if (S.mt != null) q.set('mt', Math.round(S.mt * 1000));
  q.set('w', S.wardSeed);
  if (S.sel?.src === 'ward') q.set('sel', `b${S.sel.bed}h${S.sel.hour}`);
  else if (S.sel?.src === 'test') q.set('sel', `t${S.sel.idx}`);
  if (S.source && S.patient) {
    const ed = EDITABLE.filter((k) => +S.patient[k] !== +S.source[k]);
    if (ed.length) q.set('v', ed.map((k) => `${k}~${S.patient[k]}`).join('_'));
  }
  try { history.replaceState(null, '', location.pathname + '?' + q.toString() + location.hash); } catch { /* sandboxed */ }
}

const model = () => S.models[S.kind];
const thr = () => S.metrics?.thr ?? 0.08;
const ruleText = () => `≥ ${S.rule.t}${S.rule.red ? ' or a 3' : ''}`;
const setStatus = (t) => { $('#f-status').textContent = t; };
const describeTraining = () => `${NAME[S.kind]}${S.dropped.size ? ', without ' + [...S.dropped].map((k) => FEATURE_BY_KEY[k].short).join(', ') : ''}${S.world.oldPct != null ? `, ${S.world.oldPct}% aged 80+` : ''}`;

/* ---------- build: generate, fit, score ---------- */
async function generate() {
  setStatus('generating patients…');
  const t0 = performance.now();
  S.data = await makeCohortsAsync(S.world, (stage) => setStatus(`generating ${stage} cohort…`));
  S.timings.cohort = performance.now() - t0;
}

async function fit() {
  if (S.metrics) S.before = snapshot();
  const t0 = performance.now();
  setStatus('fitting the regression…');
  const lr = await MODEL_BY_ID.lr.fit(S.data.train, S.data.valid, { dropped: S.dropped });
  S.timings.lr = performance.now() - t0;
  const t1 = performance.now();
  const gbt = await MODEL_BY_ID.gbt.fit(S.data.train, S.data.valid, { dropped: S.dropped, onProgress: (k, n) => setStatus(`fitting trees ${k}/${n}…`) });
  S.timings.gbt = performance.now() - t1;
  S.models = { lr, gbt };
  const keys = featureKeys(new Set());
  const rows = S.data.train.map((p) => featureRow(p, keys));
  S.refs = Object.fromEntries(keys.map((k, j) => [k, rows.reduce((a, r) => a + r[j], 0) / rows.length]));
  score();
  const all = S.data.train.length + S.data.valid.length;
  const nOld = [...S.data.train, ...S.data.valid].filter((p) => p.age >= 80).length;
  setStatus(`${S.data.train.length} fit · ${S.data.valid.length} validate · ${fmtPct(nOld / all, 0)} aged 80+`);
  $('#ev-perf').textContent = `Render tier ${tier}. On this device: ${all + 2 * COHORT.testN} patients with histories generated in ${S.timings.cohort.toFixed(0)} ms, the regression fitted over ${MODEL.lr.l2Grid.length} L2 values in ${S.timings.lr.toFixed(0)} ms, ${MODEL.gbt.trees} trees in ${S.timings.gbt.toFixed(0)} ms, all in chunks that yield to the page.`;
}

function score() {
  S.riskMap = news2RiskMap(S.data.train.map((p) => scoreNEWS2(p).total), S.data.train.map((p) => p.y));
  const block = (set) => {
    const parts = set.map((p) => scoreNEWS2(p));
    return {
      y: set.map((p) => p.y), newsParts: parts, news: parts.map((r) => r.total),
      newsRisk: parts.map((r) => S.riskMap.map[Math.min(20, r.total)]),
      lr: set.map((p) => S.models.lr.predict(p)), gbt: set.map((p) => S.models.gbt.predict(p)), oracle: set.map((p) => p.hidden.pTrue),
    };
  };
  S.sc = block(S.data.test);
  S.shiftSc = block(S.data.shifted);
}

function computeMetrics() {
  S.sc.alertN = S.sc.newsParts.map((r) => (alerts(r, S.rule) ? 1 : 0));
  const { y, news, alertN, newsRisk } = S.sc;
  const newsConf = confusion(alertN, y, 1);
  const thrFor = (k) => thresholdForRate(S.sc[k], newsConf.alertRate);
  const t = S.mt ?? thrFor(S.kind);
  const block = (k) => {
    const tk = k === S.kind ? t : thrFor(k);
    return { roc: roc(S.sc[k], y), pr: pr(S.sc[k], y), conf: confusion(S.sc[k], y, tk), cal: calibration(S.sc[k], y), dca: decisionCurve(S.sc[k], y, DCA_GRID), thr: tk };
  };
  const lr = block('lr'), gbt = block('gbt');
  S.metrics = {
    thr: t, sel: S.kind,
    news: { roc: roc(news, y), pr: pr(news, y), conf: newsConf, conf7: confusion(news, y, 7), cal: calibration(newsRisk, y) },
    lr, gbt, oracle: { roc: roc(S.sc.oracle, y), pr: pr(S.sc.oracle, y) },
    dca: { news: decisionCurve(newsRisk, y, DCA_GRID), lr: lr.dca, gbt: gbt.dca },
  };
}

function snapshot() {
  const m = S.metrics, k = S.kind;
  const ix = S.data.test.map((p, i) => (p.age >= 80 ? i : -1)).filter((i) => i >= 0);
  const ev = ix.filter((i) => S.sc.y[i]).length;
  const caught = ix.filter((i) => S.sc.y[i] && S.sc[k][i] >= m.thr).length;
  return { label: describeTraining(), auc: m[k].roc.auc, ap: m[k].pr.ap, brier: m[k].cal.brier, sens: m[k].conf.sens, old: ev ? caught / ev : NaN };
}

/* ---------- the bootstrap: 200 paired resamples, chunked ---------- */
let bootToken = 0;
async function runBootstrap() {
  const token = ++bootToken;
  $('#c-boot-k').textContent = 'running';
  const { y, news, newsRisk, alertN } = S.sc;
  const n = y.length, K = S.kind, other = K === 'lr' ? 'gbt' : 'lr', t = thr();
  const ord = { news: sortedOrder(news), lr: sortedOrder(S.sc.lr), gbt: sortedOrder(S.sc.gbt) };
  const rng = streamFor(S.world.seed, 'bootstrap');
  const acc = { aucN: [], aucL: [], aucG: [], apN: [], apL: [], apG: [], brN: [], brL: [], brG: [], dSel: [], dOther: [] };
  const slices = SLICES.map((sl) => ({ id: sl.id, ix: S.data.test.map((p, i) => (sl.test(p) ? i : -1)).filter((i) => i >= 0), newsSens: [], modelSens: [], oe: [] }));
  const w = new Float64Array(n);
  for (let b = 0; b < BOOT_B; b++) {
    w.fill(0);
    for (let i = 0; i < n; i++) w[Math.floor(rng.u() * n)]++;
    const aN = weightedAUC(ord.news, news, y, w), aL = weightedAUC(ord.lr, S.sc.lr, y, w), aG = weightedAUC(ord.gbt, S.sc.gbt, y, w);
    acc.aucN.push(aN); acc.aucL.push(aL); acc.aucG.push(aG);
    acc.apN.push(weightedAP(ord.news, news, y, w)); acc.apL.push(weightedAP(ord.lr, S.sc.lr, y, w)); acc.apG.push(weightedAP(ord.gbt, S.sc.gbt, y, w));
    acc.brN.push(weightedBrier(newsRisk, y, w)); acc.brL.push(weightedBrier(S.sc.lr, y, w)); acc.brG.push(weightedBrier(S.sc.gbt, y, w));
    acc.dSel.push((K === 'lr' ? aL : aG) - aN); acc.dOther.push((K === 'lr' ? aG : aL) - aN);
    for (const sl of slices) {
      let ev = 0, cN = 0, cM = 0, ps = 0;
      for (const i of sl.ix) {
        const wi = w[i];
        if (!wi) continue;
        ps += wi * S.sc[K][i];
        if (y[i]) { ev += wi; if (alertN[i]) cN += wi; if (S.sc[K][i] >= t) cM += wi; }
      }
      if (ev) { sl.newsSens.push(cN / ev); sl.modelSens.push(cM / ev); }
      if (ps) sl.oe.push(ev / ps);
    }
    if (b % 25 === 24) { await new Promise((r) => setTimeout(r, 0)); if (token !== bootToken) return; }
  }
  const ci = (a) => [percentile(a, 0.025), percentile(a, 0.975)];
  S.boot = {
    B: BOOT_B, other, stats: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, ci(v)])),
    slices: Object.fromEntries(slices.map((sl) => [sl.id, { newsSens: ci(sl.newsSens), modelSens: ci(sl.modelSens), oe: ci(sl.oe) }])),
  };
  renderBoot();
  renderSlices();
}

/* ---------- 03 head to head ---------- */
const thrToSlider = (p) => Math.round(1000 * Math.log(p / 0.005) / Math.log(200));
const sliderToThr = (v) => 0.005 * Math.pow(200, v / 1000);

function renderCohort() {
  const d = S.metrics, K = S.kind;
  drawROC($('#c-roc'), d, S.rule);
  $('#c-roc-k').textContent = `N ${fmt(d.news.roc.auc, 3)} · ${SHORT[K]} ${fmt(d[K].roc.auc, 3)}`;
  fill($('#c-roc-cap'), 'AUROC: ', h('b', { text: `NEWS2 ${fmt(d.news.roc.auc, 3)}` }), `, regression ${fmt(d.lr.roc.auc, 3)}, trees ${fmt(d.gbt.roc.auc, 3)}, hidden truth ${fmt(d.oracle.roc.auc, 3)} (the ceiling). ` +
    `Rings mark NEWS2 at ${ruleText()} and at ≥ 7; the gold dot marks the ${NAME[K]} at ${fmtPct(d.thr)}. Intervals are in the bootstrap table below.`);
  drawPR($('#c-pr'), d);
  $('#c-pr-k').textContent = `AP N ${fmt(d.news.pr.ap, 3)} · ${SHORT[K]} ${fmt(d[K].pr.ap, 3)}`;
  fill($('#c-pr-cap'), `Average precision: NEWS2 ${fmt(d.news.pr.ap, 3)}, regression ${fmt(d.lr.pr.ap, 3)}, trees ${fmt(d.gbt.pr.ap, 3)}, hidden truth ${fmt(d.oracle.pr.ap, 3)}. `,
    `Deterioration happens in ${fmtPct(d.news.pr.prevalence)} of test patients (the dashed line), so precision is the honest view of how many alerts are right (Saito and Rehmsmeier 2015).`);
  drawCalibration($('#c-cal'), d);
  $('#c-cal-k').textContent = `Brier N ${fmt(d.news.cal.brier, 3)} · ${SHORT[K]} ${fmt(d[K].cal.brier, 3)}`;
  fill($('#c-cal-cap'), `Ten equal-count bins. Squares: NEWS2 mapped to risk by the observed event rate per aggregate score on the training split, made monotone (Brier ${fmt(d.news.cal.brier, 4)}). `,
    h('b', { text: NAME[K] }), `: Brier ${fmt(d[K].cal.brier, 4)}, expected calibration error ${fmt(d[K].cal.ece, 3)}, mean predicted ${fmtPct(d[K].cal.meanP)} against ${fmtPct(d[K].cal.meanY)} observed (Van Calster et al. 2019).`);
  drawDCA($('#c-dca'), d);
  const at = (arr, pt) => arr.find((r) => Math.abs(r.pt - pt) < 1e-9)?.nb ?? NaN;
  fill($('#c-dca-cap'), `Net benefit is true alerts per patient minus false alerts weighted by the odds of the threshold (Vickers and Elkin 2006). At a 10% threshold: NEWS2 ${fmt(at(d.dca.news, 0.1), 4)}, regression ${fmt(at(d.dca.lr, 0.1), 4)}, trees ${fmt(at(d.dca.gbt, 0.1), 4)}, alert on everyone ${fmt(d.dca.news[9].all, 4)}.`);
  drawConfusion($('#c-conf'), d, { news: `NEWS2 ${ruleText()}`, sel: `${NAME[K]} ≥ ${fmtPct(d.thr)}` });
  fill($('#c-conf-cap'), S.mt == null
    ? `Matched burden: both fire on ${fmtPct(d.news.conf.alertRate)} of patients, so the difference in caught and missed is a difference in ranking.`
    : `Unmatched burden: NEWS2 fires on ${fmtPct(d.news.conf.alertRate)} of patients, the model on ${fmtPct(d[K].conf.alertRate)}.`);
  $('#c-nt').textContent = S.rule.t;
  $('#c-red').checked = S.rule.red;
  $('#c-mt').textContent = fmtPct(d.thr);
  $('#c-mtr').value = String(thrToSlider(d.thr));
  $('#c-match').disabled = S.mt == null;
  renderShift();
  if (S.boot) renderBoot();
}

function renderBoot() {
  const b = S.boot, d = S.metrics;
  if (!b) return;
  const c = (est, ci, dg = 3) => ({ text: `${fmt(est, dg)} [${fmt(ci[0], dg)}, ${fmt(ci[1], dg)}]` });
  const K = S.kind, other = K === 'lr' ? 'gbt' : 'lr', st = b.stats;
  const kA = (k) => (k === 'lr' ? 'aucL' : 'aucG'), kP = (k) => (k === 'lr' ? 'apL' : 'apG'), kB = (k) => (k === 'lr' ? 'brL' : 'brG');
  const dSel = K === b.other ? st.dOther : st.dSel, dOth = K === b.other ? st.dSel : st.dOther;
  drawTable($('#c-boot'), ['', 'AUROC', 'average precision', 'Brier'], [
    { cells: ['NEWS2', c(d.news.roc.auc, st.aucN), c(d.news.pr.ap, st.apN), c(d.news.cal.brier, st.brN, 4)] },
    { cls: 'sel', cells: [NAME[K], c(d[K].roc.auc, st[kA(K)]), c(d[K].pr.ap, st[kP(K)]), c(d[K].cal.brier, st[kB(K)], 4)] },
    { cells: [NAME[other], c(d[other].roc.auc, st[kA(other)]), c(d[other].pr.ap, st[kP(other)]), c(d[other].cal.brier, st[kB(other)], 4)] },
    { cls: 'diff', cells: [`${SHORT[K]} − NEWS2`, c(d[K].roc.auc - d.news.roc.auc, dSel), '', ''] },
    { cls: 'diff', cells: [`${SHORT[other]} − NEWS2`, c(d[other].roc.auc - d.news.roc.auc, dOth), '', ''] },
  ]);
  $('#c-boot-k').textContent = `${b.B} paired resamples · 95% percentile`;
  const wins = dSel[0] > 0, loses = dSel[1] < 0;
  fill($('#c-boot-v'), wins ? `The ${NAME[K]} beats NEWS2 on AUROC in this world: the paired difference interval (${fmt(dSel[0], 3)} to ${fmt(dSel[1], 3)}) excludes 0.`
    : loses ? `NEWS2 beats the ${NAME[K]} on AUROC here: the difference interval lies below 0.`
      : `No claim either way: the paired AUROC difference interval (${fmt(dSel[0], 3)} to ${fmt(dSel[1], 3)}) includes 0.`,
  ' Paired means each resample scores both systems on the same patients (Efron and Tibshirani 1993).');
}

function renderShift() {
  const sh = S.shiftSc;
  const obs = sh.y.reduce((a, b) => a + b, 0) / sh.y.length;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const rows = [
    { name: 'NEWS2', here: S.metrics.news.roc.auc, there: roc(sh.news, sh.y).auc, pred: mean(sh.newsRisk), mapped: true },
    { name: 'regression', here: S.metrics.lr.roc.auc, there: roc(sh.lr, sh.y).auc, pred: mean(sh.lr), id: 'lr' },
    { name: 'trees', here: S.metrics.gbt.roc.auc, there: roc(sh.gbt, sh.y).auc, pred: mean(sh.gbt), id: 'gbt' },
  ];
  drawTable($('#c-shift'), ['', 'AUROC here', 'AUROC there', 'mean predicted', 'observed'], rows.map((r) => ({
    cls: r.id === S.kind ? 'sel' : '', cells: [r.name, fmt(r.here, 3), fmt(r.there, 3), fmtPct(r.pred) + (r.mapped ? ' mapped' : ''), fmtPct(obs)],
  })));
  const m = rows.find((r) => r.id === S.kind);
  $('#c-shift-note').textContent = `The second cohort is ${SHIFTED.label}. Nothing was refitted. Ranking travels (AUROC ${fmt(m.here, 3)} here, ${fmt(m.there, 3)} there); calibration does not: the ${NAME[S.kind]} predicts ${fmtPct(m.pred)} on average where ${fmtPct(obs)} deteriorate.`;
}

/* ---------- 04 where it fails ---------- */
const scoresForSlices = () => ({ news: S.sc.news, alertN: S.sc.alertN, model: S.sc[S.kind] });

function renderSlices() {
  const rows = computeSlices(S.data.test, scoresForSlices(), thr());
  drawSlices($('#f-table'), rows, S.boot, NAME[S.kind], pickSlice, S.slicePick);
  const share = S.data.train.filter((p) => p.age >= 80).length / S.data.train.length;
  fill($('#f-finding'), ...finding(rows, NAME[S.kind], `${S.dropped.has('age') ? 'Age is not an input' : 'Age is an input'}; ${fmtPct(share, 0)} of training patients are 80+. Select a slice to dim the ward beds outside it.`));
}

function pickSlice(r) {
  S.slicePick = S.slicePick === r.id || r.id === 'all' ? null : r.id;
  if (S.slicePick) {
    const sl = SLICES.find((x) => x.id === S.slicePick);
    const set = new Set(S.shift.beds.map((b, i) => (sl.test(b.patientAt(0)) ? i : -1)).filter((i) => i >= 0));
    ward.setFilter(set);
    $('#w-filter').textContent = `· showing ${sl.label.toLowerCase()} (${set.size} beds)`;
  } else { ward.setFilter(null); $('#w-filter').textContent = ''; }
  renderSlices();
}

let traceAnim = 0;
function renderTraining(animate) {
  const lr = S.models.lr, gbt = S.models.gbt;
  fill($('#f-feats'), ...MODEL_FEATURES.map((k) => h('button', {
    type: 'button', class: 'chip' + (S.dropped.has(k) ? ' off' : ''), 'aria-pressed': String(!S.dropped.has(k)),
    title: S.dropped.has(k) ? 'dropped: select to add back and refit' : 'select to drop and refit',
    onclick: () => { if (S.dropped.has(k)) S.dropped.delete(k); else if (MODEL_FEATURES.length - S.dropped.size > 2) S.dropped.add(k); refit(); },
  }, FEATURE_BY_KEY[k].short)));
  drawTable($('#f-split'), ['L2 per patient', 'validation log-loss', ''], lr.grid.map((g) => ({
    cls: g.l2 === lr.l2 ? 'sel' : '', cells: [String(g.l2), fmt(g.valLoss, 4), g.l2 === lr.l2 ? 'chosen' : ''],
  })).concat([{ cls: 'diff', cells: [`${gbt.trees.length} trees`, fmt(gbt.valLoss, 4), gbt.valLoss < lr.valLoss ? 'beats LR' : 'trails LR'] }]));
  const traces = S.kind === 'gbt'
    ? [{ name: 'validation', values: gbt.valTrace }, { name: 'training', values: gbt.trace }]
    : [{ name: 'training', values: lr.trace }];
  const label = S.kind === 'gbt' ? `log-loss per tree` : `log-loss per Newton step, L2 ${lr.l2}`;
  cancelAnimationFrame(traceAnim);
  if (animate && !reduce) {
    const t0 = performance.now();
    const step = (now) => { const f = Math.min(1, (now - t0) / 1100); drawTrace($('#f-trace'), traces, label, f); if (f < 1) traceAnim = requestAnimationFrame(step); };
    traceAnim = requestAnimationFrame(step);
  } else drawTrace($('#f-trace'), traces, label, 1);
  if (S.before) {
    const now = snapshot();
    drawTable($('#f-before'), ['', 'before', 'after'], [
      { cells: ['training', S.before.label, now.label] },
      { cells: ['AUROC', fmt(S.before.auc, 3), fmt(now.auc, 3)] },
      { cells: ['average precision', fmt(S.before.ap, 3), fmt(now.ap, 3)] },
      { cells: ['Brier', fmt(S.before.brier, 4), fmt(now.brier, 4)] },
      { cells: ['sensitivity', fmtPct(S.before.sens, 0), fmtPct(now.sens, 0)] },
      { cells: ['sensitivity, 80+', fmtPct(S.before.old, 0), fmtPct(now.old, 0)] },
    ]);
  } else fill($('#f-before'), h('p', { class: 'mini', text: 'Drop or add an input, or switch model, to see the refit beside the model before it.' }));
  drawTerms($('#f-terms'), lr.terms());
}

function runSearch() {
  const res = worstSliceSearch(S.data.test, scoresForSlices(), thr());
  drawSearch($('#f-search'), res, NAME[S.kind]);
  $('#f-search-k').textContent = `${res.searched} slices`;
  S.searchRes = res;
  $('#f-reveal').hidden = false;
  if ($('#f-reveal').getAttribute('aria-expanded') === 'true') revealPlanted();
}

function revealPlanted() {
  const res = S.searchRes;
  if (!res) return;
  const attrs = [...new Set([...res.model, ...res.news].flatMap((r) => r.attrs))];
  if (!attrs.includes('sex')) attrs.push('sex');
  fill($('#f-planted'), h('p', { class: 'mini', text: 'What the generator planted behind the attributes in those slices:' }),
    ...attrs.map((a) => h('p', {}, h('b', { text: ATTRIBUTES.find((x) => x.id === a).label + ': ' }), MECHANISMS[a])));
}

/* ---------- 01 ward ---------- */
let ward;
function wardBeds() {
  const m = model();
  return S.shift.beds.map((b) => ({
    bed: b.bed, age: b.person.age, copd: b.person.copd, bb: b.person.bb, role: b.role, eventHour: b.eventHour,
    series: b.obs.map((o, t) => {
      const p = b.patientAt(t);
      const r = scoreNEWS2(p);
      return { news: r.total, cat: r.risk.id, alertN: alerts(r, S.rule), risk: m.predict(p) };
    }),
  }));
}

function newShift(seed, startAt = 1) {
  S.wardSeed = seed;
  S.shift = makeShift(seed, S.world);
  $('#w-seed').textContent = seed;
  S.slicePick = null; $('#w-filter').textContent = '';
  ward.setFilter(null);
  ward.setShift(wardBeds(), startAt);
  ward.setThresholds(S.rule.t, thr());
  renderCases();
  writeURL();
}

function wardTick(sum) {
  $('#w-clock').textContent = sum.clock;
  $('#w-nt').textContent = ruleText();
  $('#w-mt').textContent = fmtPct(thr());
  $('#w-na').textContent = sum.systems.news.flagged;
  $('#w-ma').textContent = sum.systems.model.flagged;
  $('#w-ya').textContent = sum.mode === 'triage' ? `${sum.systems.you.flagged}/${WARD.outreachCapacity}` : '–';
  S.wardSum = sum;
  const help = $('#w-help');
  if (sum.mode === 'triage') {
    help.textContent = sum.done ? 'Shift over. The scorecard compares your calls with both systems.'
      : `You have ${WARD.outreachCapacity - sum.systems.you.flagged} outreach calls left. Read the lanes, call a bed, then advance the clock (key n). Deteriorations appear when they happen.`;
  } else {
    help.textContent = sum.done ? 'Shift over. A new shift starts in a few seconds; select a bed to read it first.'
      : 'The shift plays on its own. Select a bed, or a point on its lane, to read that patient below. Arrow keys move between beds and hours.';
  }
  const sc = $('#w-score');
  if (!sum.done && sc.dataset.final !== String(S.wardSeed) + sum.mode) {
    fill(sc, h('p', { class: 'mini', text: `${sum.events} of ${sum.eventsTotal} deteriorations so far. At 20:00 the scorecard shows who flagged each one first, and how many hours ahead.` }));
  }
}

function wardEnd(sum) {
  const sc = $('#w-score');
  sc.dataset.final = String(S.wardSeed) + sum.mode;
  const rows = [['NEWS2 ' + ruleText(), sum.systems.news], [NAME[S.kind] + ' ≥ ' + fmtPct(thr()), sum.systems.model]];
  if (sum.mode === 'triage') rows.push(['you', sum.systems.you]);
  const best = rows.slice().sort((a, b) => (b[1].caught - a[1].caught) || (a[1].falseA - b[1].falseA))[0];
  const evBeds = S.shift.beds.filter((b) => b.eventHour != null);
  const lead = (k, ev) => (k == null || k < 0 || k >= ev ? 'missed' : `${ev - k} h`);
  fill(sc,
    h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'system' }), h('th', { text: 'caught ahead' }), h('th', { text: 'mean lead' }), h('th', { text: 'false alerts' }))),
      h('tbody', {}, ...rows.map(([n, r]) => h('tr', { class: r === best[1] ? 'best' : '' },
        h('td', { text: n }), h('td', { text: `${r.caught} of ${sum.eventsTotal}` }), h('td', { text: r.lead == null ? '–' : fmt(r.lead, 1) + ' h' }), h('td', { text: r.falseA }))))),
    h('p', { class: 'why' }, ...evBeds.map((b) => {
      const i = ward.st.beds.findIndex((x) => x.bed === b.bed);
      const ser = ward.st.beds[i].series;
      const kn = ser.findIndex((x) => x.alertN), km = ser.findIndex((x) => x.risk >= thr());
      const you = sum.mode === 'triage' ? ward.st.calls.get(i) : undefined;
      return h('span', {}, `Bed ${String(b.bed).padStart(2, '0')} (${b.person.age}y, ${b.person.type}${b.person.bb ? ', beta-blocker' : ''}${b.person.oxg ? ', oximeter over-reads' : ''}) at ${clock(WARD.startHour, b.eventHour)}: NEWS2 ${lead(kn, b.eventHour)}, model ${lead(km, b.eventHour)}` +
        (sum.mode === 'triage' ? `, you ${lead(you, b.eventHour)}` : '') + '.', h('br'));
    })));
}

/* ---------- 02 patient ---------- */
let editor;
function selectWard(i, hour) {
  const b = S.shift.beds[i];
  S.sel = { src: 'ward', bed: i, hour };
  S.extra = { reserve: b.person.reserve, event: b.eventHour, label: `bed ${String(b.bed).padStart(2, '0')} at ${clock(WARD.startHour, hour)}`, ward: true, hour };
  setPatient(b.patientAt(hour), `bed ${String(b.bed).padStart(2, '0')} · ${clock(WARD.startHour, hour)} · shift ${S.wardSeed}`);
}

function selectTest(idx) {
  const p = S.data.test[idx];
  if (!p) return;
  S.sel = { src: 'test', idx };
  S.extra = { label: `test patient ${p.id}` };
  setPatient(p, `test patient ${p.id} · outcome hidden in section 05`);
}

function setPatient(p, label) {
  S.source = p; S.patient = { ...p };
  if (S.edits) { Object.assign(S.patient, S.edits); S.edits = null; }
  editor.set(S.patient, p);
  S.srcLabel = label;
  renderPatient();
  renderTruth();
  writeURL();
}

function readEditor() {
  S.patient = editor.read(S.patient);
  editor.mark(S.patient);
  renderPatient();
  writeURL();
}

let lastCtx = null;
function renderPatient() {
  const p = S.patient;
  if (!p || !S.models) return;
  const t0 = performance.now();
  const m = model(), t = thr();
  const news = scoreNEWS2(p);
  const expl = m.explain(p);
  const ranked = rankContribs(expl);
  const cfN = counterfactuals(p, (q) => alerts(scoreNEWS2(q), S.rule));
  const cfM = counterfactuals(p, (q) => m.predict(q) >= t);
  const ms = performance.now() - t0;
  const edited = S.source && EDITABLE.some((k) => +p[k] !== +S.source[k]);
  $('#p-src').textContent = (edited ? 'edited · ' : '') + S.srcLabel;
  $('#p-ms').textContent = `NEWS2, risk, contributions and ${cfN.evaluated + cfM.evaluated} counterfactual candidates in ${ms.toFixed(1)} ms`;
  drawDerived($('#p-derived'), p);
  drawNewsGrid($('#p-newsgrid'), $('#p-newstotal'), news, S.rule);
  $('#p-wf-title').textContent = `${NAME[S.kind]} · log-odds`;
  drawWaterfall($('#p-wf'), $('#p-wf-note'), expl, ranked, t, MODEL_BY_ID[S.kind].method);
  drawObsChart($('#p-obs'), $('#p-obs-k'), p, { ward: !!S.extra?.ward, hour: S.extra?.hour ?? 0, event: S.extra?.event, rule: S.rule });
  const ow = $('#p-obs').parentElement; ow.scrollLeft = ow.scrollWidth;
  const prob = sigmoid(expl.logit);
  drawDistribution($('#p-dist'), S.sc.news, S.sc[S.kind], news.total, prob, S.rule, t);
  drawCounterfactuals($('#p-cf'), [
    { who: `NEWS2 ${ruleText()}`, cf: cfN, after: (ch) => 'NEWS2 ' + scoreNEWS2(apply(p, ch)).total },
    { who: `${SHORT[S.kind]} ≥ ${fmtPct(t)}`, cf: cfM, after: (ch) => 'risk ' + fmtPct(m.predict(apply(p, ch))) },
  ], (changes) => { S.patient = apply(S.patient, changes); editor.set(S.patient, S.source); readEditor(); });
  const ctx = { patient: p, ranked, prob, baseProb: sigmoid(expl.base), modelName: NAME[S.kind], flagged: prob >= t, threshold: t, news, ward: wardFacts() };
  lastCtx = ctx;
  const cached = S.llmCache.get(cacheKey(p));
  const tmpl = templateExplanation(ctx);
  if (cached) {
    drawExplanation($('#p-llm-text'), $('#p-llm-audit'), verify(cached.reply, ctx));
    $('#p-llm-src').textContent = cached.label;
    $('#p-llm-tmpl').hidden = false;
    $('#p-llm-tmpl p').textContent = tmpl.sentences.map((x) => x.text).join(' ') + (tmpl.ward ? ' Ward: ' + tmpl.ward.text : '');
  } else {
    drawExplanation($('#p-llm-text'), $('#p-llm-audit'), verify(tmpl, ctx));
    $('#p-llm-src').textContent = 'deterministic template';
    $('#p-llm-tmpl').hidden = true;
  }
  renderDeletion(p, ranked);
  const top = topSet(ranked).map((f) => f.label.toLowerCase()).join(', ');
  $('#p-live').textContent = `${S.srcLabel}: NEWS2 ${news.total}, ${news.risk.label} clinical risk. ${NAME[S.kind]} risk ${fmtPct(prob)}, ${prob >= t ? 'flagged' : 'not flagged'}. Top contributions: ${top || 'none'}.`;
}

function renderDeletion(p, ranked) {
  const m = model();
  const keys = m.keys;
  const K = Math.min(8, keys.length);
  const base = m.logit(p);
  const moved = (order, k) => {
    const ovr = {};
    for (const key of order.slice(0, k)) ovr[key] = S.refs[key];
    return Math.abs(m.logit({ ...p, ovr }) - base);
  };
  const order = ranked.map((f) => f.key);
  const top = Array.from({ length: K + 1 }, (_, k) => moved(order, k));
  const rng = streamFor(S.world.seed, 'deletion:' + p.id);
  const random = new Array(K + 1).fill(0);
  const R = 20;
  for (let r = 0; r < R; r++) {
    const perm = keys.slice();
    for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(rng.u() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let k = 0; k <= K; k++) random[k] += moved(perm, k) / R;
  }
  drawDeletion($('#p-del'), $('#p-del-note'), { top, random, k: K });
}

const apply = (p, changes) => changes.reduce((q, c) => ({ ...q, [c.key]: c.to }), { ...p });
const cacheKey = (p) => `${S.world.seed}:${S.kind}:${[...S.dropped].join('')}:${p.id}:` + EDITABLE.map((k) => p[k]).join(',');

function wardFacts() {
  const sum = S.wardSum;
  if (!sum) return null;
  return { clock: sum.clock, hour: sum.hour, newsFlagged: sum.systems.news.flagged, modelFlagged: sum.systems.model.flagged, events: sum.events, beds: WARD.beds };
}

let llmBusy = false;
async function askModel() {
  if (llmBusy || !lastCtx) return;
  llmBusy = true;
  const btn = $('#p-llm-go');
  btn.disabled = true;
  const ctx = lastCtx;
  const key = cacheKey(ctx.patient);
  const status = $('#p-llm-status');
  const off = LLM.onStatus((st) => { status.textContent = 'asking · ' + st.label; });
  try {
    const r = await explainWithModel(ctx);
    const label = r.source === 'offline' ? 'no route answered · template' : `${r.model} via ${r.source} · ${(r.ms / 1000).toFixed(1)} s`;
    S.llmCache.set(key, { reply: r.reply, label });
    if (r.source !== 'offline') {
      const tmplAudit = verify(r.template, ctx);
      S.tally.calls++; S.tally.n += r.audit.claims.n; S.tally.verified += r.audit.claims.verified; S.tally.wrong += r.audit.claims.wrong;
      S.tally.added += [...r.audit.verifiedGroups].filter((g) => !tmplAudit.verifiedGroups.has(g)).length;
      $('#p-llm-tally').textContent = `Across ${S.tally.calls} model ${S.tally.calls === 1 ? 'reply' : 'replies'} this visit: ${S.tally.verified} of ${S.tally.n} claims verified, ${S.tally.wrong} wrong; ${S.tally.added} verified feature mentions the template did not make.`;
    }
    status.textContent = r.source === 'offline' ? `offline: ${r.errors.slice(-1)[0] || 'no route'}` : `audited: ${r.audit.ok ? 'every claim checks' : r.audit.bad + ' flags'}`;
    if (cacheKey(S.patient) === key) renderPatient();
  } catch (e) {
    status.textContent = 'stopped: ' + (e.message || e);
  } finally {
    off();
    llmBusy = false;
    btn.disabled = false;
  }
}

/* ---------- 05 hidden world ---------- */
function renderTruth() {
  if (!S.source) return;
  drawTruth($('#h-truth'), $('#h-who'), S.source, S.extra, $('#h-show').getAttribute('aria-expanded') === 'true');
}

function renderChecks() {
  const st = selfTest();
  let additivity = 0;
  for (const p of S.data.test.slice(0, 200)) for (const m of Object.values(S.models)) {
    const e = m.explain(p);
    additivity = Math.max(additivity, Math.abs(e.base + e.phi.reduce((a, f) => a + f.c, 0) - e.logit));
  }
  const rr = streamFor(S.world.seed, 'test');
  let reproducible = true;
  for (let i = 0; i < 50; i++) {
    if (JSON.stringify(drawPatient(rr, 't' + i, S.world)) !== JSON.stringify(S.data.test[i])) { reproducible = false; break; }
  }
  const rnd = streamFor(S.world.seed, 'sanity');
  const randomScores = S.sc.y.map(() => rnd.u());
  const briers = [S.metrics.news.cal.brier, S.metrics.lr.cal.brier, S.metrics.gbt.cal.brier];
  const sanity = { perfect: roc(S.sc.y, S.sc.y).auc, random: roc(randomScores, S.sc.y).auc };
  sanity.ok = sanity.perfect === 1 && Math.abs(sanity.random - 0.5) < 0.06 && briers.every((b) => b >= 0 && b <= 1);
  drawChecks($('#h-checks'), { selfTest: { fails: st.length, checked: st.checked }, vignettes: checkVignettes(), sweep: sweep(), additivity, reproducible, seed: S.world.seed, sanity });
}

function renderModelCard() {
  const m = model(), d = S.metrics;
  const rows = computeSlices(S.data.test, scoresForSlices(), thr()).filter((r) => r.id !== 'all' && r.ev >= 15);
  const worst = rows.sort((a, b) => a.model.sens - b.model.sens).slice(0, 3);
  drawModelCard($('#p-card'), {
    name: `${NAME[S.kind]}, trained in this browser`,
    inputs: m.keys.map((k) => FEATURE_BY_KEY[k].short).join(', '),
    fit: S.kind === 'lr' ? `IRLS with L2 ${m.l2} chosen on ${S.data.valid.length} validation patients` : `${m.trees.length} trees, depth ${MODEL.gbt.depth}, learning rate ${MODEL.gbt.rate}, on ${S.data.train.length} patients`,
    perf: `AUROC ${fmt(d[S.kind].roc.auc, 3)}, average precision ${fmt(d[S.kind].pr.ap, 3)}, Brier ${fmt(d[S.kind].cal.brier, 4)} on ${S.data.test.length} synthetic test patients`,
    slices: worst.map((r) => `${r.label.toLowerCase()} sensitivity ${fmtPct(r.model.sens, 0)}`).join('; ') + ` (overall ${fmtPct(d[S.kind].conf.sens, 0)})`,
  });
}

/* ---------- example cases ---------- */
function renderCases() {
  if (!S.sc?.alertN || !S.shift) return;
  const { y, alertN } = S.sc, pm = S.sc[S.kind], t = thr();
  const find = (f) => S.data.test.findIndex((p, i) => f(p, i));
  const cases = [];
  const blunt = S.shift.beds.findIndex((b) => b.role === 'blunted');
  if (blunt >= 0) {
    const b = S.shift.beds[blunt];
    cases.push({ label: `ward: ${b.person.age}-year-old, bed ${String(b.bed).padStart(2, '0')}`, go: () => ward.select(blunt, Math.max(0, Math.min(b.obs.length - 1, b.eventHour - 2))) });
  }
  const add = (label, f) => { const i = find(f); if (i >= 0) cases.push({ label, go: () => selectTest(i) }); };
  add('NEWS2 misses, model catches', (p, i) => y[i] && !alertN[i] && pm[i] >= t && p.age >= 75);
  add('model misses, NEWS2 catches', (p, i) => y[i] && alertN[i] && pm[i] < t);
  add('oximeter over-reads', (p, i) => y[i] && p.oxg && !alertN[i]);
  add('both miss', (p, i) => y[i] && !alertN[i] && pm[i] < t);
  add('both alarm, no event', (p, i) => !y[i] && S.sc.news[i] >= S.rule.t + 2 && pm[i] >= t);
  add('COPD on scale 2', (p, i) => p.scale2 && p.o2 && S.sc.news[i] >= 3);
  fill($('#p-cases'), ...cases.map((c) => h('button', { type: 'button', class: 'seg', onclick: c.go }, c.label)));
}

/* ---------- everything that depends on model or thresholds ---------- */
let bootTimer = 0;
function refreshAll(opts = {}) {
  computeMetrics();
  renderCohort();
  renderSlices();
  renderTraining(opts.trace);
  if (ward && S.shift) { ward.updateSeries(wardBeds()); ward.setThresholds(S.rule.t, thr()); }
  renderCases();
  if (S.patient) renderPatient();
  renderModelCard();
  runSearch();
  $$('[data-kind]').forEach((b) => { const on = b.dataset.kind === S.kind; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  writeURL();
  clearTimeout(bootTimer);
  bootTimer = setTimeout(runBootstrap, 120);
}

let building = false;
async function refit() {
  if (building) return;
  building = true;
  try { await fit(); refreshAll({ trace: true }); renderChecks(); } finally { building = false; }
}

async function rebuild() {
  if (building) return;
  building = true;
  try {
    await generate();
    await fit();
    syncOldSlider();
    computeMetrics();
    newShift(S.wardSeed, 4);
    refreshAll({ trace: true });
    renderChecks();
    const i = S.shift.beds.findIndex((b) => b.role === 'blunted');
    ward.select(i, Math.max(0, Math.min(4, S.shift.beds[i].eventHour - 1)));
  } finally { building = false; }
}

function syncOldSlider() {
  if (S.world.oldPct != null) { $('#f-oldr').value = String(S.world.oldPct); $('#f-old').textContent = S.world.oldPct + '%'; }
  else { const p = Math.round(100 * S.data.popOldShare); $('#f-oldr').value = String(p); $('#f-old').textContent = p + '% (population)'; }
}

/* ---------- boot ---------- */
async function boot() {
  readURL();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('booting')));
  mountRoutePanel($('#route'));
  fill($('#ev-cites'), ...CITATIONS.map((c) => h('li', { text: c.text })));
  drawGenerator($('#h-eq'));
  drawDatasheet($('#h-sheet'));
  const worldUI = buildWorld($('#h-world'), S.world);

  ward = createWard({
    stage: $('#ward-stage'), canvas: $('#ward-canvas'), list: $('#ward-beds'), tier,
    onSelect: (i, hr) => selectWard(i, hr), onTick: wardTick, onEnd: wardEnd,
  });
  ward.onLoop = () => { if (ward.st.mode === 'watch') newShift(S.wardSeed + 1); };
  editor = buildEditor($('#p-form'), () => readEditor());

  $$('.ward-modes .seg').forEach((b) => b.addEventListener('click', () => {
    $$('.ward-modes .seg').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    $('#w-score').dataset.final = '';
    ward.setMode(b.dataset.mode);
    $('#w-play').hidden = b.dataset.mode === 'triage';
    $('#w-next').hidden = b.dataset.mode !== 'triage';
    $('#w-play').textContent = 'pause';
  }));
  $('#w-play').addEventListener('click', () => { $('#w-play').textContent = ward.togglePlay() ? 'pause' : 'play'; });
  $('#w-next').addEventListener('click', () => ward.nextHour());
  $('#w-new').addEventListener('click', () => { $('#w-score').dataset.final = ''; newShift(S.wardSeed + 1); if (ward.st.mode === 'triage') ward.setMode('triage'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'n' && ward.st.mode === 'triage' && !/input|textarea|select/i.test(e.target.tagName)) ward.nextHour(); });
  $$('[data-kind]').forEach((b) => b.addEventListener('click', () => { if (S.kind === b.dataset.kind) return; S.before = snapshot(); S.kind = b.dataset.kind; refreshAll({ trace: true }); }));
  $$('[data-st]').forEach((b) => b.addEventListener('click', () => { S.rule.t = Math.max(1, Math.min(15, S.rule.t + (b.dataset.st === 'nt+' ? 1 : -1))); refreshAll(); }));
  $('#c-red').addEventListener('change', (e) => { S.rule.red = e.target.checked; refreshAll(); });
  $('#c-mtr').addEventListener('input', (e) => { S.mt = sliderToThr(+e.target.value); refreshAll(); });
  $('#c-match').addEventListener('click', () => { S.mt = null; refreshAll(); });
  $('#p-reset').addEventListener('click', () => { if (S.source) { S.patient = { ...S.source }; editor.set(S.patient, S.source); readEditor(); } });
  $('#p-llm-go').addEventListener('click', askModel);
  $('#f-oldr').addEventListener('change', (e) => { S.world.oldPct = +e.target.value; rebuild(); });
  $('#f-oldr').addEventListener('input', (e) => { $('#f-old').textContent = e.target.value + '%'; });
  $('#f-pop').addEventListener('click', () => { S.world.oldPct = null; rebuild(); });
  $('#f-search-go').addEventListener('click', runSearch);
  $('#f-reveal').addEventListener('click', (e) => {
    const open = e.currentTarget.getAttribute('aria-expanded') !== 'true';
    e.currentTarget.setAttribute('aria-expanded', String(open));
    e.currentTarget.textContent = open ? 'hide what was planted' : 'reveal what the generator planted';
    $('#f-planted').hidden = !open;
    if (open) revealPlanted();
  });
  $('#h-show').addEventListener('click', (e) => {
    const open = e.currentTarget.getAttribute('aria-expanded') !== 'true';
    e.currentTarget.setAttribute('aria-expanded', String(open));
    e.currentTarget.textContent = open ? 'hide hidden truth' : 'reveal hidden truth';
    renderTruth();
  });
  $('#h-regen').addEventListener('click', () => { S.world = { ...S.world, ...worldUI.read() }; rebuild(); });
  $('#h-default').addEventListener('click', () => { S.world = { ...WORLD_DEFAULT, oldPct: null }; worldUI.set(S.world); rebuild(); });
  const stamp = () => `seed${S.world.seed}`;
  $('#x-csv').addEventListener('click', () => { download(`glass-ward-features-${stamp()}.csv`, featuresCSV(S.data.test, S.sc, S.world), 'text/csv'); $('#x-status').textContent = `${S.data.test.length} synthetic rows exported.`; });
  $('#x-out').addEventListener('click', () => { download(`glass-ward-outcomes-${stamp()}.csv`, outcomesCSV(S.data.test, S.world), 'text/csv'); $('#x-status').textContent = 'Hidden outcomes exported as a separate file.'; });
  $('#x-cohort').addEventListener('click', () => { download(`glass-ward-cohort-${stamp()}.json`, cohortJSON(S.data.test, S.world), 'application/json'); $('#x-status').textContent = 'Cohort with histories, dictionary and datasheet exported.'; });
  $('#x-json').addEventListener('click', () => download(`glass-ward-metrics-${stamp()}.json`, metricsJSON(), 'application/json'));
  $('#x-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); $('#x-status').textContent = 'Link copied.'; } catch { $('#x-status').textContent = location.href; }
  });

  building = true;
  try { await generate(); await fit(); } finally { building = false; }
  syncOldSlider();
  worldUI.set(S.world);
  computeMetrics();
  S.shift = makeShift(S.wardSeed, S.world);
  $('#w-seed').textContent = S.wardSeed;
  const opening = S.shift.beds.findIndex((b) => b.role === 'blunted');
  const openHour = Math.max(2, S.shift.beds[opening].eventHour - 2);
  ward.setShift(wardBeds(), S.sel?.src === 'ward' ? Math.min(S.sel.hour, WARD.hours) : openHour);
  ward.setThresholds(S.rule.t, thr());
  ward.start();
  refreshAll({ trace: true });
  if (S.sel?.src === 'test') selectTest(S.sel.idx);
  else if (S.sel?.src === 'ward' && S.shift.beds[S.sel.bed]) ward.select(S.sel.bed, Math.min(S.sel.hour, S.shift.beds[S.sel.bed].obs.length - 1));
  else ward.select(opening, openHour);
  setTimeout(renderChecks, 50);
}

function metricsJSON() {
  const d = S.metrics;
  const pick = (b) => ({ auroc: b.roc.auc, average_precision: b.pr.ap, ...(b.cal ? { brier: b.cal.brier, ece: b.cal.ece } : {}),
    confusion: b.conf ? { tp: b.conf.tp, fp: b.conf.fp, tn: b.conf.tn, fn: b.conf.fn, sensitivity: b.conf.sens, specificity: b.conf.spec, ppv: b.conf.ppv } : undefined });
  return JSON.stringify({
    note: 'Glass Ward, luisblanco.dev. SYNTHETIC DATA. Educational demonstration of interpretability; not a medical device and not medical advice.',
    world: S.world, model: S.kind, dropped: [...S.dropped], news2_rule: S.rule, model_threshold: d.thr,
    test_n: S.data.test.length, prevalence: d.news.pr.prevalence,
    news2: pick(d.news), logistic_regression: pick(d.lr), boosted_trees: pick(d.gbt), hidden_truth: { auroc: d.oracle.roc.auc, average_precision: d.oracle.pr.ap },
    bootstrap_95: S.boot ? S.boot.stats : null,
    news2_risk_map: S.riskMap.perScore,
    lr_terms: S.models.lr.terms(), lr_l2: S.models.lr.l2, validation_logloss: { lr: S.models.lr.valLoss, gbt: S.models.gbt.valLoss },
  }, null, 2);
}

boot().catch((e) => { console.error(e); const el = document.querySelector('#w-help'); if (el) el.textContent = 'The lab failed to start: ' + e.message; });
